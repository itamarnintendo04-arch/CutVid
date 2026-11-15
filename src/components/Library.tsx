import { useRef } from 'react';
import { AlertTriangle, Blend, Diamond, Settings, Film, Image as ImageIcon, Layers2, Music, Plus, Shapes, SlidersHorizontal, Sparkles, Trash2, Type, Upload, Wand2, Zap } from 'lucide-react';
import { useStore, type PanelTab } from '../store';
import { media } from '../engine/media';
import { formatTime, useT, type TKey } from '../lib/i18n';
import type { TextStyle } from '../types';
import { DEFAULT_TEXT } from '../types';
import { AiPanel } from './AiPanel';
import { EffectsPanel, ElementsPanel, FiltersPanel, KeyframesPanel, OverlaysPanel, SettingsPanel, TransitionsPanel } from './Panels';

export async function importFiles(files: FileList | File[]) {
  const st = useStore.getState();
  const list = Array.from(files);
  if (!list.length) return;
  st.setBusy('importing');
  let failed = 0;
  try {
    for (const f of list) {
      const asset = await media.importFile(f);
      if (asset) useStore.getState().addAsset(asset);
      else failed++;
    }
  } finally {
    useStore.getState().setBusy(failed ? 'importFailed' : null);
    if (failed) setTimeout(() => useStore.getState().busy === 'importFailed' && useStore.getState().setBusy(null), 4000);
  }
}

export const TABS: { id: PanelTab; label: TKey; icon: typeof Film }[] = [
  { id: 'media', label: 'media', icon: Film },
  { id: 'text', label: 'text', icon: Type },
  { id: 'elements', label: 'elements', icon: Shapes },
  { id: 'overlays', label: 'overlays', icon: Layers2 },
  { id: 'effects', label: 'effects', icon: Zap },
  { id: 'transitions', label: 'transitions', icon: Blend },
  { id: 'filters', label: 'filters', icon: Wand2 },
  { id: 'keyframes', label: 'keyframes', icon: Diamond },
  { id: 'ai', label: 'ai', icon: Sparkles },
  { id: 'settings', label: 'settings', icon: Settings },
];
export const EDIT_ICON = SlidersHorizontal;

const F = {
  heebo: 'Heebo, Arial, sans-serif',
  rubik: 'Rubik, Arial, sans-serif',
  bebas: '"Bebas Neue", Impact, sans-serif',
  anton: 'Anton, Impact, sans-serif',
  pacifico: 'Pacifico, cursive',
  marker: '"Permanent Marker", cursive',
  playfair: '"Playfair Display", Georgia, serif',
  mono: '"Roboto Mono", "Courier New", monospace',
  secular: '"Secular One", Arial, sans-serif',
  karantina: 'Karantina, Impact, sans-serif',
  poppins: 'Poppins, Arial, sans-serif',
  suez: '"Suez One", Georgia, serif',
};

const TEXT_PRESETS: { key: TKey; style: Partial<TextStyle> }[] = [
  { key: 'title', style: { size: 140, bold: true, font: F.heebo } },
  { key: 'subtitle', style: { size: 80, bold: false, font: F.heebo } },
  { key: 'caption', style: { size: 56, bold: true, background: 'rgba(0,0,0,0.6)', shadow: 0, font: F.rubik } },
  { key: 'outline', style: { size: 120, color: '#ffffff', stroke: '#000000', strokeWidth: 14, shadow: 0, font: F.anton, bold: false } },
  { key: 'boxed', style: { size: 90, color: '#111111', background: '#ffd84a', shadow: 0, font: F.poppins } },
  { key: 'neon', style: { size: 120, color: '#ffffff', glow: 34, glowColor: '#ff2bd6', shadow: 0, font: F.pacifico, bold: false } },
  { key: 'stGlowBlue', style: { size: 120, color: '#e8fbff', glow: 30, glowColor: '#19b8ff', shadow: 0, font: F.bebas, bold: false } },
  { key: 'stGold', style: { size: 120, color: '#ffd84a', stroke: '#7a4a00', strokeWidth: 6, glow: 18, glowColor: '#ffae00', font: F.playfair } },
  { key: 'stImpact', style: { size: 150, color: '#ffffff', stroke: '#000000', strokeWidth: 10, font: F.bebas, bold: false } },
  { key: 'stMarker', style: { size: 110, color: '#ffffff', font: F.marker, bold: false, shadow: 10 } },
  { key: 'stFire', style: { size: 130, color: '#fff3c4', glow: 28, glowColor: '#ff5a00', stroke: '#ff2a00', strokeWidth: 3, font: F.anton, bold: false, shadow: 0 } },
  { key: 'stHebrew', style: { size: 130, font: F.secular, bold: false, color: '#ffffff', stroke: '#7c5cff', strokeWidth: 8 } },
  { key: 'stPoster', style: { size: 170, font: F.karantina, bold: true, color: '#ffd84a', shadow: 14 } },
  { key: 'stElegant', style: { size: 100, font: F.suez, bold: false, color: '#f5efe0', shadow: 6 } },
  { key: 'stSubtitleBar', style: { size: 60, font: F.heebo, bold: true, color: '#ffffff', background: '#7c5cff', shadow: 0 } },
  { key: 'typewriter', style: { size: 80, font: F.mono, typewriter: true } },
];

function MediaPanel() {
  const t = useT();
  const assets = useStore((s) => s.project.assets);
  const addClipFromAsset = useStore((s) => s.addClipFromAsset);
  const removeAsset = useStore((s) => s.removeAsset);
  const fps = useStore((s) => s.project.fps);
  const gallery = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) importFiles(e.target.files);
    e.target.value = '';
  };
  return (
    <div className="panel-scroll">
      {/* Two inputs: image/video opens the photo gallery on phones; the second one browses files (audio too). */}
      <input ref={gallery} type="file" multiple accept="video/*,image/*" hidden onChange={onPick} />
      <input ref={files} type="file" multiple accept="video/*,audio/*,image/*,.mp4,.mov,.m4v,.webm,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={onPick} />
      <div className="import-row">
        <button className="import-btn" onClick={() => gallery.current?.click()}>
          <ImageIcon size={18} />
          <b>{t('fromGallery')}</b>
          <small>{t('galleryHint')}</small>
        </button>
        <button className="import-btn" onClick={() => files.current?.click()}>
          <Upload size={18} />
          <b>{t('fromFiles')}</b>
          <small>{t('filesHint')}</small>
        </button>
      </div>
      {!assets.length && <p className="muted center">{t('emptyMedia')}</p>}
      <div className="asset-grid">
        {assets.map((a) => {
          const missing = !media.has(a.id);
          return (
            <div key={a.id} className="asset" title={a.name}>
              <button className="asset-thumb" disabled={missing} onClick={() => addClipFromAsset(a.id)} aria-label={t('addToTimeline')}>
                {a.thumb ? <img src={a.thumb} alt="" draggable={false} /> : a.kind === 'audio' ? <Music size={26} /> : a.kind === 'image' ? <ImageIcon size={26} /> : <Film size={26} />}
                {missing ? (
                  <span className="asset-badge warn" title={t('missingFile')}>
                    <AlertTriangle size={12} />
                  </span>
                ) : (
                  <span className="asset-add">
                    <Plus size={16} />
                  </span>
                )}
                {a.kind !== 'image' && <span className="asset-dur">{formatTime(a.duration, fps).slice(0, 5)}</span>}
              </button>
              <div className="asset-meta">
                <span className="asset-name">{a.name}</span>
                <button
                  className="icon-btn small"
                  aria-label={t('remove')}
                  onClick={() => {
                    removeAsset(a.id);
                    media.release(a.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextPanel() {
  const t = useT();
  const addText = (p: (typeof TEXT_PRESETS)[number]) => {
    const st = useStore.getState();
    st.addText(t(p.key));
    const id = useStore.getState().selection[0];
    st.updateClip(id, (c) => void (c.text = { ...DEFAULT_TEXT, ...p.style, content: t(p.key) }), false);
  };
  return (
    <div className="panel-scroll preset-grid">
      {TEXT_PRESETS.map((p) => (
        <button key={p.key} className="preset" onClick={() => addText(p)}>
          <span
            style={{
              fontFamily: p.style.font ?? DEFAULT_TEXT.font,
              fontWeight: p.style.bold === false ? 400 : 700,
              color: p.style.color ?? '#fff',
              background: p.style.background || 'transparent',
              WebkitTextStroke: p.style.strokeWidth ? `1px ${p.style.stroke}` : undefined,
              textShadow: p.style.glow ? `0 0 10px ${p.style.glowColor}, 0 0 4px ${p.style.glowColor}` : undefined,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {t(p.key)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Library() {
  const t = useT();
  const tab = useStore((s) => s.panelTab);
  const setTab = useStore((s) => s.setPanelTab);
  return (
    <div className="panel library">
      <div className="tabs scroll">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={(id === 'ai' ? 'ai-tab ' : '') + (tab === id ? 'active' : '')} onClick={() => setTab(id)}>
            <Icon size={15} /> {t(label)}
          </button>
        ))}
      </div>
      {tab === 'media' && <MediaPanel />}
      {tab === 'text' && <TextPanel />}
      {tab === 'elements' && <ElementsPanel />}
      {tab === 'overlays' && <OverlaysPanel />}
      {tab === 'effects' && <EffectsPanel />}
      {tab === 'transitions' && <TransitionsPanel />}
      {tab === 'filters' && <FiltersPanel />}
      {tab === 'keyframes' && <KeyframesPanel />}
      {tab === 'ai' && <AiPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}
