import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eraser, RefreshCw, Send, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { useT, type TKey } from '../lib/i18n';
import { PROVIDERS, chat, configFor, listModels, loadAiSettings, providerDef, saveAiSettings, type AiSettings, type ChatMessage, type ProviderConfig } from '../ai/providers';
import { SYSTEM_PROMPT, applyOps, parseReply, projectSummary, resolveAsyncOps } from '../ai/assistant';
import { notify } from '../lib/notify';
import { useSettings } from '../lib/settings';
import { useSignedIn } from '../lib/supabase';

interface Turn {
  role: 'user' | 'assistant';
  /** What is shown in the chat. */
  text: string;
  /** What is replayed to the model on later turns. */
  wire: string;
  note?: string;
  error?: boolean;
}

const SUGGESTIONS: TKey[] = ['sug1', 'sug2', 'sug3', 'sug4'];
// The conversation lives outside the component so switching library tabs does not lose it.
let savedTurns: Turn[] = [];
const modelCache = new Map<string, string[]>();

export function AiPanel() {
  const t = useT();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [turns, setTurns] = useState<Turn[]>(savedTurns);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [models, setModels] = useState<string[]>(() => modelCache.get(settings.provider) ?? []);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');
  const def = providerDef(settings.provider);
  const cfg = configFor(settings, def.id);
  const [showSettings, setShowSettings] = useState(def.wire !== 'cutvid' && !cfg.model);
  const log = useRef<HTMLDivElement>(null);
  const signedIn = useSignedIn();
  const needsSignIn = def.wire === 'cutvid' && !signedIn;

  useEffect(() => {
    savedTurns = turns;
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, busy]);

  const update = (next: AiSettings) => {
    setSettings(next);
    saveAiSettings(next);
  };
  const patch = (p: Partial<ProviderConfig>) => update({ ...settings, configs: { ...settings.configs, [def.id]: { ...cfg, ...p } } });

  const pickProvider = (id: string) => {
    update({ ...settings, provider: id });
    setModels(modelCache.get(id) ?? []);
    setModelError('');
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setModelError('');
    try {
      const list = await listModels(def.id, cfg);
      modelCache.set(def.id, list);
      setModels(list);
      if (!list.length) setModelError('0 ' + t('modelsLoaded'));
      else if (!list.includes(cfg.model)) patch({ model: list[0] });
    } catch (e) {
      setModelError((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  };

  const send = async (text: string) => {
    const request = text.trim();
    if (!request || busy) return;
    setInput('');
    const st = useStore.getState();
    // Only the newest message carries the project summary; older turns replay as plain text.
    const context = JSON.stringify(projectSummary(st.project, st.time, st.selection));
    const history: ChatMessage[] = turns.filter((x) => !x.error).slice(-8).map((x) => ({ role: x.role, content: x.wire }));
    // Providers require the conversation to start with a user turn.
    while (history.length && history[0].role !== 'user') history.shift();
    const userTurn: Turn = { role: 'user', text: request, wire: request };
    setTurns((prev) => [...prev, userTurn]);
    setBusy(true);
    try {
      const raw = await chat(def.id, cfg, SYSTEM_PROMPT, [...history, { role: 'user', content: `Current project:\n${context}\n\nRequest: ${request}` }]);
      const reply = parseReply(raw);
      // Pictures (create / remove background) are made first; the whole edit is still one undo step.
      const { ops, errors } = await resolveAsyncOps(reply.ops, setStep);
      setStep('');
      const applied = ops.length ? applyOps(ops) : 0;
      const note = [reply.ops.length ? (applied ? `${applied} ${t('applied')}` : t('noChanges')) : '', ...errors].filter(Boolean).join(' · ') || undefined;
      if (useSettings.getState().notifyAi) notify('CutVid AI', reply.message || (note ?? '✓'));
      setTurns((prev) => [...prev, { role: 'assistant', text: reply.message || (applied ? '✓' : raw.slice(0, 400)), wire: raw, note }]);
    } catch (e) {
      setTurns((prev) => [...prev, { role: 'assistant', text: (e as Error).message, wire: '', error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const ready = def.wire === 'cutvid' || !!cfg.model;

  return (
    <div className="ai-panel">
      <button className="ai-settings-toggle" onClick={() => setShowSettings(!showSettings)}>
        <Sparkles size={14} />
        <b>{def.name}</b>
        <span className="muted ai-model" dir="ltr">
          {def.wire === 'cutvid' ? '' : cfg.model || t('chooseModel')}
        </span>
        <span className="spacer" />
        <ChevronDown size={14} style={{ transform: showSettings ? 'rotate(180deg)' : undefined }} />
      </button>

      {showSettings && (
        <div className="ai-settings">
          <label className="field">
            <span className="field-label">{t('provider')}</span>
            <select value={def.id} onChange={(e) => pickProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {def.wire === 'cutvid' ? (
            <p className="muted small">{t('cutvidAiHint')}</p>
          ) : (
            <>
              {def.customUrl && (
                <label className="field">
                  <span className="field-label">{t('baseUrl')}</span>
                  <input dir="ltr" type="url" placeholder="https://host/v1" value={cfg.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
                </label>
              )}
              <label className="field">
                <span className="field-label">{t('apiKey')}</span>
                <input dir="ltr" type="password" autoComplete="off" placeholder={def.keyHint ?? (def.needsKey ? '' : '—')} value={cfg.key} onChange={(e) => patch({ key: e.target.value.trim() })} />
              </label>
              <button onClick={loadModels} disabled={loadingModels || (def.needsKey && !cfg.key)}>
                <RefreshCw size={14} className={loadingModels ? 'spin' : ''} /> {t('loadModels')}
              </button>
              <label className="field">
                <span className="field-label">
                  {t('model')} {models.length > 0 && <small>· {models.length} {t('modelsLoaded')}</small>}
                </span>
                {models.length > 0 ? (
                  <select dir="ltr" value={cfg.model} onChange={(e) => patch({ model: e.target.value })}>
                    {!models.includes(cfg.model) && <option value={cfg.model}>{cfg.model || '—'}</option>}
                    {models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input dir="ltr" type="text" placeholder="model-id" value={cfg.model} onChange={(e) => patch({ model: e.target.value.trim() })} />
                )}
              </label>
              {modelError && <p className="error small">{modelError}</p>}
              <p className="muted small">{t('keyStoredLocally')}</p>
            </>
          )}
        </div>
      )}

      {needsSignIn && (
        <div className="ai-signin">
          <p>{t('aiSignIn')}</p>
          <button className="primary" onClick={() => window.dispatchEvent(new Event('cutvid:open-cloud'))}>
            {t('signIn')}
          </button>
        </div>
      )}

      <div className="ai-log" ref={log}>
        {!turns.length && (
          <div className="ai-empty">
            <p className="muted">{t('aiIntro')}</p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((k) => (
                <button key={k} className="chip" disabled={!ready || busy} onClick={() => send(t(k))}>
                  {t(k)}
                </button>
              ))}
            </div>
            <p className="muted small">{t('aiNotGenerative')}</p>
          </div>
        )}
        {turns.map((x, i) => (
          <div key={i} className={`bubble ${x.role}${x.error ? ' error' : ''}`} dir="auto">
            {x.text}
            {x.note && <small className="bubble-note">{x.note}</small>}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">{step ? `${t('creatingImage')} ${step}` : t('thinking')}</div>}
      </div>

      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {turns.length > 0 && (
          <button type="button" className="icon-btn" title={t('clearChat')} aria-label={t('clearChat')} onClick={() => setTurns([])}>
            <Eraser size={16} />
          </button>
        )}
        <textarea
          rows={2}
          dir="auto"
          value={input}
          placeholder={ready ? t('aiPlaceholder') : t('chooseModel')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="submit" className="primary" disabled={!ready || busy || !input.trim()} aria-label={t('send')}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
