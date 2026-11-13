import { useRef, useState } from 'react';
import { AlertTriangle, Circle, Film, Image as ImageIcon, Music, Plus, Square, Trash2, Type, Upload } from 'lucide-react';
import { useStore } from '../store';
import { media } from '../engine/media';
import { formatTime, useT, type TKey } from '../lib/i18n';
import type { TextStyle } from '../types';
import { DEFAULT_TEXT } from '../types';

export async function importFiles(files: FileList | File[]) {
  const st = useStore.getState();
  const list = Array.from(files);
  if (!list.length) return;
  st.setBusy('importing');
  try {
    for (const f of list) {
      const asset = await media.importFile(f);
      if (asset) useStore.getState().addAsset(asset);
    }
  } finally {
    useStore.getState().setBusy(null);
  }
}

const TEXT_PRESETS: { key: TKey; style: Partial<TextStyle> }[] = [
  { key: 'title', style: { size: 140, bold: true } },
  { key: 'subtitle', style: { size: 80, bold: false } },
  { key: 'caption', style: { size: 56, bold: true, background: 'rgba(0,0,0,0.6)', shadow: 0 } },
  { key: 'outline', style: { size: 120, color: '#ffffff', stroke: '#000000', strokeWidth: 14, shadow: 0 } },
  { key: 'boxed', style: { size: 90, color: '#111111', background: '#ffd84a', shadow: 0 } },
  { key: 'neon', style: { size: 120, color: '#19d3c5', stroke: '#7c5cff', strokeWidth: 6, shadow: 30 } },
  { key: 'typewriter', style: { size: 80, font: '"Courier New", monospace', typewriter: true } },
];

export function Library() {
  const t = useT();
  const [tab, setTab] = useState<'media' | 'text' | 'elements'>('media');
  const assets = useStore((s) => s.project.assets);
  const addClipFromAsset = useStore((s) => s.addClipFromAsset);
  const removeAsset = useStore((s) => s.removeAsset);
  const fps = useStore((s) => s.project.fps);
  const input = useRef<HTMLInputElement>(null);

  const addText = (p: (typeof TEXT_PRESETS)[number]) => {
    const st = useStore.getState();
    st.addText(t(p.key));
    const id = useStore.getState().selection[0];
    st.updateClip(id, (c) => void (c.text = { ...DEFAULT_TEXT, ...p.style, content: t(p.key) }), false);
  };

  return (
    <div className="panel library">
      <div className="tabs">
        <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
          <Film size={15} /> {t('media')}
        </button>
        <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
          <Type size={15} /> {t('text')}
        </button>
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>
          <Square size={15} /> {t('elements')}
        </button>
      </div>

      {tab === 'media' && (
        <div className="panel-scroll">
          <input
            ref={input}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            hidden
            onChange={(e) => {
              if (e.target.files) importFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button className="import-btn" onClick={() => input.current?.click()}>
            <Upload size={18} />
            <b>{t('import')}</b>
            <small>{t('importHint')}</small>
          </button>
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
      )}

      {tab === 'text' && (
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
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                {t(p.key)}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'elements' && (
        <div className="panel-scroll preset-grid">
          <button className="preset" onClick={() => useStore.getState().addShape('rect')}>
            <Square size={30} />
            <small>{t('rect')}</small>
          </button>
          <button className="preset" onClick={() => useStore.getState().addShape('ellipse')}>
            <Circle size={30} />
            <small>{t('ellipse')}</small>
          </button>
        </div>
      )}
    </div>
  );
}
