import { useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, LogOut, Trash2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { clearConfig, cloudDelete, cloudList, cloudLoad, cloudSave, getConfig, setConfig, supabase, type CloudProject } from '../lib/supabase';
import { Dialog } from './ui';

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [cfg, setCfg] = useState(getConfig);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [list, setList] = useState<CloudProject[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const refresh = () =>
    cloudList()
      .then(setList)
      .catch((e) => setError(e.message));

  useEffect(() => {
    const c = supabase();
    if (!c) return;
    c.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = c.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [cfg]);

  useEffect(() => {
    if (user) refresh();
    else setList(null);
  }, [user]);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setStatus('');
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const connect = () => {
    if (!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20) return setError('URL / key?');
    setConfig(url, key);
    setError('');
    setCfg(getConfig());
  };

  const auth = (mode: 'in' | 'up') =>
    run(async () => {
      const c = supabase()!;
      const res = mode === 'in' ? await c.auth.signInWithPassword({ email, password }) : await c.auth.signUp({ email, password });
      if (res.error) throw new Error(res.error.message);
      if (mode === 'up' && !res.data.session) setStatus(t('checkEmail'));
    });

  const save = () =>
    run(async () => {
      await cloudSave(useStore.getState().project, setStatus);
      setStatus(t('saved') + ' ✓');
      await refresh();
    });

  const open = (id: string) =>
    run(async () => {
      setStatus(t('loading'));
      const p = await cloudLoad(id, setStatus);
      useStore.getState().loadProject(p);
      onClose();
    });

  return (
    <Dialog title={t('cloudTitle')} onClose={onClose}>
      {!cfg ? (
        <div className="stack">
          <p className="muted">{t('cloudIntro')}</p>
          <label className="field">
            <span className="field-label">{t('projectUrl')}</span>
            <input dir="ltr" type="url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('anonKey')}</span>
            <input dir="ltr" type="text" placeholder="eyJ… / sb_publishable_…" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <button className="primary" onClick={connect}>
            {t('connect')}
          </button>
        </div>
      ) : !user ? (
        <div className="stack">
          <p className="muted" dir="ltr">
            {cfg.url}
          </p>
          <label className="field">
            <span className="field-label">{t('email')}</span>
            <input dir="ltr" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('password')}</span>
            <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="row">
            <button className="primary" disabled={working} onClick={() => auth('in')}>
              {t('signIn')}
            </button>
            <button disabled={working} onClick={() => auth('up')}>
              {t('signUp')}
            </button>
            <span className="spacer" />
            {cfg.fromEnv ? (
              <small className="muted">{t('configuredByBuild')}</small>
            ) : (
              <button
                onClick={() => {
                  clearConfig();
                  setCfg(null);
                }}
              >
                {t('disconnect')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="row">
            <span className="muted">
              {t('signedInAs')}
              <bdi>{user.email}</bdi>
            </span>
            <span className="spacer" />
            <button onClick={() => supabase()!.auth.signOut()}>
              <LogOut size={14} /> {t('signOut')}
            </button>
          </div>
          <button className="primary" disabled={working} onClick={save}>
            <CloudUpload size={16} /> {t('saveToCloud')}
          </button>
          <h3>{t('cloudProjects')}</h3>
          {list === null ? <p className="muted">{t('loading')}</p> : !list.length ? <p className="muted">{t('noCloudProjects')}</p> : null}
          <ul className="list">
            {list?.map((p) => (
              <li key={p.id}>
                <span className="list-name">{p.name}</span>
                <small className="muted">{new Date(p.updated_at).toLocaleString()}</small>
                <button disabled={working} onClick={() => open(p.id)}>
                  <CloudDownload size={14} /> {t('open')}
                </button>
                <button className="icon-btn small" disabled={working} aria-label={t('delete')} onClick={() => run(() => cloudDelete(p.id).then(refresh))}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
