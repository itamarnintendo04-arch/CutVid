import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Diamond, Save, Trash2 } from 'lucide-react';
import { selectedClip, useStore } from '../store';
import { useT, type TKey } from '../lib/i18n';
import type { AnimProp, AnimationType, BlendMode, Clip, ClipEffect, Easing, EffectType, Filters, ShapeStyle } from '../types';
import { ANIMATION_TYPES, ANIM_PROPS, DEFAULT_FILTERS, DEFAULT_TEXT, EFFECT_TYPES, SHAPE_KINDS } from '../types';
import { EASINGS, easeFn, findKeyframe, propAt } from '../engine/keyframes';
import { canvasFiltersSupported, drawShape } from '../engine/render';
import { deletePreset, savePreset, usePresets, type PresetData, type PresetKind } from '../lib/presets';
import { Section, Slider, Toggle } from './ui';
import { ImportButtons } from './ImportButtons';
import { importFiles } from './Library';
import { ICON_STYLES, canChangeAppIcon, currentAppIcon, setAppIcon } from '../lib/appIcon';
import { setSetting, useSettings } from '../lib/settings';
import { configureBackgroundUpdates, notifyState, requestNotify, type NotifyState } from '../lib/notify';
import { savesToGallery } from '../lib/save';
import { APP_VERSION } from '../version';

// ---- shared -------------------------------------------------------------------------------

function NeedClip({ children }: { children: (clip: Clip) => ReactNode }) {
  const t = useT();
  const clip = useStore(selectedClip);
  if (!clip || clip.type === 'audio') return <p className="muted center pad">{t('selectVisualClip')}</p>;
  return <>{children(clip)}</>;
}

/** "Save as preset" row plus the user's saved presets of one kind. Saving needs an account. */
function MyPresets<K extends PresetKind>(props: { kind: K; current: () => PresetData[K] | null; onApply: (data: PresetData[K]) => void; thumb?: (data: PresetData[K]) => ReactNode }) {
  const t = useT();
  const all = usePresets((s) => s.presets);
  const signedIn = usePresets((s) => s.signedIn);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const mine = all.filter((p) => p.kind === props.kind);

  const save = async () => {
    const data = props.current();
    if (!data) return;
    setError('');
    try {
      await savePreset(props.kind, name || t('myPreset'), data);
      setName('');
    } catch (e) {
      if ((e as Error).message === 'SIGN_IN_REQUIRED') window.dispatchEvent(new Event('cutvid:open-cloud'));
      else setError((e as Error).message);
    }
  };

  return (
    <Section title={t('myPresets')}>
      <div className="row nowrap">
        <input type="text" placeholder={t('presetName')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={save} title={t('savePreset')}>
          <Save size={14} /> {t('save2')}
        </button>
      </div>
      {!signedIn && <p className="muted small">{t('signInToSave')}</p>}
      {error && <p className="error small">{error}</p>}
      {mine.length > 0 && (
        <ul className="list compact">
          {mine.map((p) => (
            <li key={p.id}>
              <button className="preset-apply" onClick={() => props.onApply(p.data as PresetData[K])}>
                {props.thumb?.(p.data as PresetData[K])}
                <span className="list-name">{p.name}</span>
              </button>
              <button className="icon-btn small" aria-label={t('delete')} onClick={() => deletePreset(p.id).catch((e) => setError(e.message))}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ShapeThumb({ shape, blend }: { shape: Partial<ShapeStyle> & Pick<ShapeStyle, 'kind'>; blend?: BlendMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const full = shape.width === 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    if (full) {
      // Overlays are previewed over a sample "footage" gradient.
      const bg = g.createLinearGradient(0, 0, c.width, c.height);
      bg.addColorStop(0, '#39506b');
      bg.addColorStop(1, '#8a6f57');
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = blend ?? 'source-over';
    }
    g.translate(c.width / 2, c.height / 2);
    const w = full ? c.width : c.width * 0.62;
    const h = full ? c.height : shape.kind === 'line' ? 8 : c.height * 0.7;
    drawShape(g, { fill: '#7c5cff', width: 1, height: 1, radius: 0.08, ...shape }, w, h, 0.3, 0.35);
    g.globalCompositeOperation = 'source-over';
  }, [shape, blend]);
  return <canvas ref={ref} width={128} height={80} className="shape-thumb" />;
}

// ---- elements -----------------------------------------------------------------------------

const STICKERS = ['🔥', '❤️', '⭐', '✨', '😂', '😍', '👍', '🎉', '💯', '👀', '🚀', '⚡', '🎵', '💥', '✅', '❌', '➡️', '👇', '💬', '🏆'];

export function ElementsPanel() {
  const t = useT();
  const add = (shape: Partial<ShapeStyle> & Pick<ShapeStyle, 'kind'>) => {
    const extra: Partial<ShapeStyle> = shape.kind === 'line' ? { width: 0.4, height: 0.012 } : shape.kind === 'ring' ? { radius: 0.1 } : shape.kind === 'frame' ? { width: 0.6, height: 0.6, radius: 0.04 } : {};
    useStore.getState().addShape({ ...shape, ...extra });
  };
  const sticker = (emoji: string) => {
    const st = useStore.getState();
    st.addText(emoji);
    st.updateClip(useStore.getState().selection[0], (c) => void (c.text = { ...DEFAULT_TEXT, content: emoji, size: 220, shadow: 0 }), false);
  };
  return (
    <div className="panel-scroll">
      <h4>{t('shapes')}</h4>
      <div className="tile-grid">
        {SHAPE_KINDS.map((kind) => (
          <button key={kind} className="tile" onClick={() => add({ kind })} title={kind}>
            <ShapeThumb shape={{ kind }} />
          </button>
        ))}
      </div>
      <h4>{t('gradients')}</h4>
      <div className="tile-grid">
        {([['#7c5cff', '#19d3c5'], ['#ff5c7a', '#ffd84a'], ['#0f2027', '#2c5364'], ['#ff9966', '#ff5e62'], ['#00c6ff', '#0072ff'], ['#f7971e', '#ffd200']] as const).map(([a, b]) => (
          <button key={a + b} className="tile" onClick={() => useStore.getState().addShape({ kind: 'rect', fill: a, fill2: b, gradientAngle: 45, width: 1, height: 1, radius: 0 })}>
            <span className="swatch" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
          </button>
        ))}
      </div>
      <h4>{t('stickers')}</h4>
      <div className="sticker-grid">
        {STICKERS.map((e) => (
          <button key={e} onClick={() => sticker(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- overlays -----------------------------------------------------------------------------

const OVERLAYS: { key: TKey; shape: Partial<ShapeStyle> & Pick<ShapeStyle, 'kind'>; blend?: BlendMode; opacity?: number }[] = [
  { key: 'ovLightLeak', shape: { kind: 'rect', fill: '#ff7a18', fill2: 'rgba(255,122,24,0)', gradientAngle: 20 }, blend: 'screen', opacity: 0.8 },
  { key: 'ovSunset', shape: { kind: 'rect', fill: '#ff5e62', fill2: '#ffd200', gradientAngle: 90 }, blend: 'overlay', opacity: 0.55 },
  { key: 'ovCool', shape: { kind: 'rect', fill: '#00c6ff', fill2: '#3a1c71', gradientAngle: 90 }, blend: 'soft-light', opacity: 0.7 },
  { key: 'ovNeon', shape: { kind: 'rect', fill: '#ff00cc', fill2: '#3333ff', gradientAngle: 45 }, blend: 'screen', opacity: 0.4 },
  { key: 'ovVignette', shape: { kind: 'vignette', fill: 'rgba(0,0,0,0.9)' } },
  { key: 'ovLetterbox', shape: { kind: 'letterbox', fill: '#000000', radius: 0.12 } },
  { key: 'ovScanlines', shape: { kind: 'scanlines', fill: 'rgba(0,0,0,0.45)' } },
  { key: 'ovGrain', shape: { kind: 'grain', fill: '#ffffff' }, blend: 'overlay', opacity: 0.4 },
  { key: 'ovFrame', shape: { kind: 'frame', fill: '#ffffff', radius: 0.03 } },
  { key: 'ovDim', shape: { kind: 'rect', fill: '#000000' }, opacity: 0.45 },
  { key: 'ovFlashWhite', shape: { kind: 'rect', fill: '#ffffff' }, opacity: 0.6 },
  { key: 'ovSpotlight', shape: { kind: 'vignette', fill: 'rgba(0,0,0,1)' }, blend: 'multiply' },
];

const QUICK_BLENDS: { mode: BlendMode; key: TKey }[] = [
  { mode: 'source-over', key: 'blendNormal' },
  { mode: 'screen', key: 'blendScreen' },
  { mode: 'multiply', key: 'blendMultiply' },
  { mode: 'overlay', key: 'blendOverlay' },
  { mode: 'lighten', key: 'blendLighten' },
];

export function OverlaysPanel() {
  const t = useT();
  const clip = useStore(selectedClip);
  const updateClip = useStore((s) => s.updateClip);
  const addOwn = async (files: FileList) => {
    const assets = await importFiles(files);
    for (const a of assets) if (a.kind !== 'audio') useStore.getState().addClipFromAsset(a.id, { overlay: true });
  };
  return (
    <div className="panel-scroll">
      <h4>{t('ownOverlay')}</h4>
      <ImportButtons visualOnly onFiles={addOwn} />
      <p className="muted small pad-b">{t('ownOverlayHint')}</p>
      {clip && clip.type !== 'audio' && (
        <>
          <h4>{t('blend')}</h4>
          <div className="chips pad-b">
            {QUICK_BLENDS.map((b) => (
              <button key={b.mode} className={'chip' + (clip.blend === b.mode ? ' active' : '')} onClick={() => updateClip(clip.id, (c) => void (c.blend = b.mode))}>
                {t(b.key)}
              </button>
            ))}
          </div>
        </>
      )}
      <h4>{t('readyOverlays')}</h4>
      <p className="muted small pad-b">{t('overlayHint')}</p>
      <div className="tile-grid two">
        {OVERLAYS.map((o) => {
          const shape = { width: 1, height: 1, radius: 0, ...o.shape };
          return (
            <button
              key={o.key}
              className="tile labelled"
              onClick={() => {
                const st = useStore.getState();
                st.addShape(shape, { name: t(o.key), blend: o.blend ?? 'source-over' });
                if (o.opacity !== undefined) st.updateClip(useStore.getState().selection[0], (c) => void (c.transform.opacity = o.opacity!), false);
              }}
            >
              <ShapeThumb shape={shape} blend={o.blend} />
              <small>{t(o.key)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- effects ------------------------------------------------------------------------------

export function EffectsPanel() {
  const t = useT();
  const setEffect = useStore((s) => s.setEffect);
  const updateClip = useStore((s) => s.updateClip);
  const snapshot = useStore((s) => s.snapshot);
  return (
    <div className="panel-scroll">
      <NeedClip>
        {(clip) => {
          const amount = (type: EffectType) => clip.effects.find((e) => e.type === type)?.amount ?? 0;
          return (
            <>
              <div className="chips">
                {EFFECT_TYPES.map((type) => (
                  <button key={type} className={'chip' + (amount(type) > 0 ? ' active' : '')} onClick={() => setEffect(clip.id, type, amount(type) > 0 ? 0 : 0.5)}>
                    {type}
                  </button>
                ))}
              </div>
              {clip.effects.map((e) => (
                <Slider key={e.type} label={e.type} value={e.amount} min={0.02} max={1} display={100} unit="%" onChange={(v) => setEffect(clip.id, e.type, v, false)} />
              ))}
              {clip.effects.length > 0 && (
                <button onClick={() => updateClip(clip.id, (c) => void (c.effects = []))}>{t('clearEffects')}</button>
              )}
              <MyPresets
                kind="effect"
                current={() => (clip.effects.length ? clip.effects.map((e) => ({ ...e })) : null)}
                onApply={(data: ClipEffect[]) => updateClip(clip.id, (c) => void (c.effects = data.filter((e) => EFFECT_TYPES.includes(e.type)).map((e) => ({ ...e }))))}
              />
              {(clip.type === 'video' || clip.type === 'image') && (
                <Section title={t('chroma')} defaultOpen={clip.chroma.enabled}>
                  <div className="row">
                    <Toggle label={t('enabled')} checked={clip.chroma.enabled} onChange={(v) => updateClip(clip.id, (c) => void (c.chroma.enabled = v))} />
                    <label className="field inline">
                      <span className="field-label">{t('keyColor')}</span>
                      <input type="color" value={clip.chroma.color} onPointerDown={snapshot} onChange={(e) => updateClip(clip.id, (c) => void (c.chroma.color = e.target.value), false)} />
                    </label>
                  </div>
                  <Slider label={t('similarity')} value={clip.chroma.similarity} min={0.01} max={1} display={100} unit="%" onChange={(v) => updateClip(clip.id, (c) => void (c.chroma.similarity = v), false)} />
                  <Slider label={t('smoothness')} value={clip.chroma.smoothness} min={0} max={1} display={100} unit="%" onChange={(v) => updateClip(clip.id, (c) => void (c.chroma.smoothness = v), false)} />
                </Section>
              )}
            </>
          );
        }}
      </NeedClip>
    </div>
  );
}

// ---- transitions --------------------------------------------------------------------------

export function TransitionsPanel() {
  const t = useT();
  const updateClip = useStore((s) => s.updateClip);
  const [side, setSide] = useState<'animIn' | 'animOut'>('animIn');
  return (
    <div className="panel-scroll">
      <NeedClip>
        {(clip) => (
          <>
            <div className="segmented">
              <button className={side === 'animIn' ? 'active' : ''} onClick={() => setSide('animIn')}>
                {t('animIn')} · {clip.animIn.type}
              </button>
              <button className={side === 'animOut' ? 'active' : ''} onClick={() => setSide('animOut')}>
                {t('animOut')} · {clip.animOut.type}
              </button>
            </div>
            <div className="chips">
              {ANIMATION_TYPES.map((a: AnimationType) => (
                <button key={a} className={'chip' + (clip[side].type === a ? ' active' : '')} onClick={() => updateClip(clip.id, (c) => void (c[side].type = a))}>
                  {a}
                </button>
              ))}
            </div>
            {clip[side].type !== 'none' && (
              <Slider label={t('duration')} value={clip[side].duration} min={0.1} max={Math.max(0.2, Math.min(5, clip.duration))} step={0.05} unit="s" onChange={(v) => updateClip(clip.id, (c) => void (c[side].duration = v), false)} />
            )}
            <button
              onClick={() =>
                updateClip(clip.id, (c) => {
                  const other = side === 'animIn' ? 'animOut' : 'animIn';
                  c[other] = { ...c[side] };
                })
              }
            >
              {t('applyBoth')}
            </button>
          </>
        )}
      </NeedClip>
    </div>
  );
}

// ---- filters ------------------------------------------------------------------------------

const FILTER_PRESETS: { name: string; f: Partial<Filters> }[] = [
  { name: 'Original', f: {} },
  { name: 'Vivid', f: { saturation: 1.5, contrast: 1.15 } },
  { name: 'Cinema', f: { contrast: 1.25, saturation: 0.85, brightness: 0.95, vignette: 0.45 } },
  { name: 'Noir', f: { grayscale: 1, contrast: 1.35, vignette: 0.4 } },
  { name: 'Warm', f: { sepia: 0.35, saturation: 1.2, brightness: 1.05 } },
  { name: 'Cool', f: { hue: 200, saturation: 0.9, sepia: 0.25 } },
  { name: 'Vintage', f: { sepia: 0.6, contrast: 0.9, brightness: 1.08, vignette: 0.5 } },
  { name: 'Dream', f: { blur: 3, brightness: 1.12, saturation: 1.25 } },
  { name: 'Fade', f: { contrast: 0.8, brightness: 1.1, saturation: 0.8 } },
  { name: 'Punch', f: { contrast: 1.4, saturation: 1.3, brightness: 1.02 } },
  { name: 'Moody', f: { brightness: 0.85, contrast: 1.2, saturation: 0.7, vignette: 0.6 } },
  { name: 'Teal', f: { hue: -20, saturation: 1.25, contrast: 1.1 } },
  { name: 'Rose', f: { hue: 330, saturation: 1.1, brightness: 1.06 } },
  { name: 'Negative', f: { invert: 1 } },
];

const FILTER_SLIDERS: { key: keyof Filters; label: TKey; min: number; max: number; step?: number; display?: number; unit?: string }[] = [
  { key: 'brightness', label: 'brightness', min: 0, max: 2, display: 100, unit: '%' },
  { key: 'contrast', label: 'contrast', min: 0, max: 2, display: 100, unit: '%' },
  { key: 'saturation', label: 'saturation', min: 0, max: 3, display: 100, unit: '%' },
  { key: 'hue', label: 'hue', min: -180, max: 360, step: 1, unit: '°' },
  { key: 'blur', label: 'blur', min: 0, max: 40, step: 0.5 },
  { key: 'grayscale', label: 'grayscale', min: 0, max: 1, display: 100, unit: '%' },
  { key: 'sepia', label: 'sepia', min: 0, max: 1, display: 100, unit: '%' },
  { key: 'invert', label: 'invert', min: 0, max: 1, display: 100, unit: '%' },
  { key: 'vignette', label: 'vignette', min: 0, max: 1, display: 100, unit: '%' },
];

export function FiltersPanel() {
  const t = useT();
  const updateClip = useStore((s) => s.updateClip);
  return (
    <div className="panel-scroll">
      <NeedClip>
        {(clip) => (
          <>
            {!canvasFiltersSupported() && <p className="muted small">Canvas filters are not supported by this browser.</p>}
            <div className="chips">
              {FILTER_PRESETS.map((p) => (
                <button key={p.name} className="chip" onClick={() => updateClip(clip.id, (c) => void (c.filters = { ...DEFAULT_FILTERS, ...p.f }))}>
                  {p.name}
                </button>
              ))}
            </div>
            {FILTER_SLIDERS.map((f) => (
              <Slider key={f.key} label={t(f.label)} value={clip.filters[f.key]} min={f.min} max={f.max} step={f.step} display={f.display} unit={f.unit} onChange={(v) => updateClip(clip.id, (c) => void (c.filters[f.key] = v), false)} />
            ))}
            <MyPresets kind="filter" current={() => ({ ...clip.filters })} onApply={(data: Filters) => updateClip(clip.id, (c) => void (c.filters = { ...DEFAULT_FILTERS, ...data }))} />
          </>
        )}
      </NeedClip>
    </div>
  );
}

// ---- keyframes ----------------------------------------------------------------------------

/** Small plot of an easing curve. */
export function CurveThumb({ ease, size = 44 }: { ease: Easing; size?: number }) {
  const fn = easeFn(ease);
  const pts: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const x = i / 32;
    // The view spans y = -0.25..1.25 so overshooting curves stay visible.
    pts.push(`${(x * 100).toFixed(1)},${((1.25 - fn(x)) / 1.5) * 100}`);
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="curve-thumb" aria-hidden="true">
      <line x1="0" y1={(1.25 / 1.5) * 100} x2="100" y2={(1.25 / 1.5) * 100} />
      <line x1="0" y1={(0.25 / 1.5) * 100} x2="100" y2={(0.25 / 1.5) * 100} />
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

type Bez = [number, number, number, number];

/** Draggable cubic-bezier editor (the "graph" for a keyframe segment). */
function BezierEditor({ value, onChange }: { value: Bez; onChange: (v: Bez) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<0 | 1 | null>(null);
  const S = 200;
  const Y0 = 0.5; // extra room above 1 and below 0
  const toX = (x: number) => x * S;
  const toY = (y: number) => ((1 + Y0 - y) / (1 + 2 * Y0)) * S;
  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(-Y0, Math.min(1 + Y0, 1 + Y0 - ((e.clientY - r.top) / r.height) * (1 + 2 * Y0)));
    const next = [...value] as Bez;
    next[drag.current * 2] = +x.toFixed(3);
    next[drag.current * 2 + 1] = +y.toFixed(3);
    onChange(next);
  };
  const [x1, y1, x2, y2] = value;
  const handle = (i: 0 | 1, cx: number, cy: number) => (
    <circle
      cx={toX(cx)}
      cy={toY(cy)}
      r={9}
      className="bez-handle"
      onPointerDown={(e) => {
        drag.current = i;
        (e.target as Element).setPointerCapture(e.pointerId);
      }}
    />
  );
  return (
    <svg ref={ref} viewBox={`0 0 ${S} ${S}`} className="bezier" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <rect x={0} y={toY(1)} width={S} height={toY(0) - toY(1)} className="bez-box" />
      <line x1={toX(0)} y1={toY(0)} x2={toX(x1)} y2={toY(y1)} className="bez-arm" />
      <line x1={toX(1)} y1={toY(1)} x2={toX(x2)} y2={toY(y2)} className="bez-arm" />
      <path d={`M ${toX(0)} ${toY(0)} C ${toX(x1)} ${toY(y1)}, ${toX(x2)} ${toY(y2)}, ${toX(1)} ${toY(1)}`} className="bez-curve" />
      {handle(0, x1, y1)}
      {handle(1, x2, y2)}
    </svg>
  );
}

const PROP_LABEL: Record<AnimProp, TKey> = { x: 'posX', y: 'posY', scale: 'scale', rotation: 'rotation', opacity: 'opacity' };

export function KeyframesPanel() {
  const t = useT();
  const time = useStore((s) => s.time);
  const toggleKeyframe = useStore((s) => s.toggleKeyframe);
  const setEasing = useStore((s) => s.setEasing);
  const updateClip = useStore((s) => s.updateClip);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [custom, setCustom] = useState<Bez>([0.25, 0.1, 0.25, 1]);

  return (
    <div className="panel-scroll">
      <NeedClip>
        {(clip) => {
          const lt = Math.max(0, Math.min(clip.duration, time - clip.start));
          const animated = ANIM_PROPS.some((p) => clip.keyframes[p]?.length);
          return (
            <>
              <p className="muted small pad-b">{t('keyframeHint')}</p>
              <div className="kf-props">
                {ANIM_PROPS.map((prop) => {
                  const kfs = clip.keyframes[prop] ?? [];
                  const on = findKeyframe(clip, prop, lt) >= 0;
                  return (
                    <div key={prop} className="kf-prop">
                      <button className={'kf-btn big' + (on ? ' on' : kfs.length ? ' animated' : '')} onClick={() => toggleKeyframe(clip.id, prop)} aria-label={t('keyframe')}>
                        <Diamond size={15} fill={on ? 'currentColor' : 'none'} />
                      </button>
                      <span className="kf-name">{t(PROP_LABEL[prop])}</span>
                      <span className="kf-times" dir="ltr">
                        {kfs.map((k) => (
                          <button key={k.t} className="kf-time" onClick={() => useStore.getState().setTime(clip.start + k.t)} title={`${propAt(clip, prop, k.t).toFixed(2)}`}>
                            {k.t.toFixed(2)}s
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
              {animated && (
                <button onClick={() => updateClip(clip.id, (c) => void (c.keyframes = {}))}>{t('clearKeyframes')}</button>
              )}

              <Section title={t('curves')}>
                {!animated && <p className="muted small">{t('addKeyframeFirst')}</p>}
                <div className="segmented">
                  <button className={!onlyCurrent ? 'active' : ''} onClick={() => setOnlyCurrent(false)}>
                    {t('allSegments')}
                  </button>
                  <button className={onlyCurrent ? 'active' : ''} onClick={() => setOnlyCurrent(true)}>
                    {t('currentSegment')}
                  </button>
                </div>
                <div className="curve-grid">
                  {Object.keys(EASINGS).map((name) => (
                    <button key={name} className="curve" disabled={!animated} onClick={() => setEasing(clip.id, name, onlyCurrent)} title={name}>
                      <CurveThumb ease={name} />
                      <small>{name}</small>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('customCurve')}>
                <BezierEditor value={custom} onChange={setCustom} />
                <p className="muted small center" dir="ltr">
                  cubic-bezier({custom.join(', ')})
                </p>
                <button className="primary" disabled={!animated} onClick={() => setEasing(clip.id, [...custom] as Bez, onlyCurrent)}>
                  {t('applyCurve')}
                </button>
              </Section>

              <MyPresets
                kind="curve"
                current={() => [...custom] as Bez}
                thumb={(data) => <CurveThumb ease={data} size={30} />}
                onApply={(data: Easing) => {
                  if (Array.isArray(data)) setCustom([...data] as Bez);
                  if (animated) setEasing(clip.id, data, onlyCurrent);
                }}
              />
            </>
          );
        }}
      </NeedClip>
    </div>
  );
}

// ---- settings -----------------------------------------------------------------------------

export function SettingsPanel() {
  const t = useT();
  const s = useSettings();
  const lang = useStore((st) => st.lang);
  const [perm, setPerm] = useState<NotifyState>('unsupported');
  useEffect(() => {
    notifyState().then(setPerm);
  }, []);

  return (
    <div className="panel-scroll">
      <Section title={t('notifications')}>
        {perm === 'prompt' && (
          <button className="primary" onClick={() => requestNotify().then(setPerm)}>
            {t('notifyAllow')}
          </button>
        )}
        {perm === 'denied' && <p className="muted small">{t('notifyBlocked')}</p>}
        <Toggle label={t('setNotifyAi')} checked={s.notifyAi} onChange={(v) => setSetting('notifyAi', v)} />
        <Toggle label={t('setNotifyExport')} checked={s.notifyExport} onChange={(v) => setSetting('notifyExport', v)} />
        <Toggle
          label={t('setNotifyUpdates')}
          checked={s.notifyUpdates}
          onChange={(v) => {
            setSetting('notifyUpdates', v);
            configureBackgroundUpdates(v);
          }}
        />
        <p className="muted small">{t('setNotifyUpdatesHint')}</p>
      </Section>

      <Section title={t('export')}>
        <Toggle label={savesToGallery() ? t('setAutoSaveGallery') : t('setAutoSave')} checked={s.autoSave} onChange={(v) => setSetting('autoSave', v)} />
        <label className="field">
          <span className="field-label">{t('resolution')}</span>
          <select value={s.exportShort} onChange={(e) => setSetting('exportShort', +e.target.value)}>
            <option value={480}>480p</option>
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
            <option value={1440}>1440p</option>
            <option value={2160}>4K</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('fps')}</span>
          <select value={s.exportFps} onChange={(e) => setSetting('exportFps', +e.target.value)}>
            <option value={0}>{t('sameAsProject')}</option>
            {[24, 25, 30, 50, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('quality')}</span>
          <select value={s.exportQuality} onChange={(e) => setSetting('exportQuality', e.target.value as 'low')}>
            <option value="low">{t('low')}</option>
            <option value="medium">{t('medium')}</option>
            <option value="high">{t('high')}</option>
          </select>
        </label>
      </Section>

      {canChangeAppIcon() && <AppIconPicker />}

      <Section title={t('general')}>
        <label className="field">
          <span className="field-label">{t('language')}</span>
          <select value={lang} onChange={(e) => useStore.getState().setLang(e.target.value as 'he')}>
            <option value="en">English</option>
            <option value="he">עברית</option>
          </select>
        </label>
        <p className="muted small">CutVid · build {APP_VERSION}</p>
      </Section>
    </div>
  );
}

function AppIconPicker() {
  const t = useT();
  const [current, setCurrent] = useState('Default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    currentAppIcon().then(setCurrent);
  }, []);
  const pick = async (id: string) => {
    if (id === current || busy) return;
    setBusy(true);
    setError('');
    try {
      await setAppIcon(id);
      setCurrent(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('appIcon')}>
      <div className="icon-grid">
        {ICON_STYLES.map((s) => (
          <button key={s.id} className={'icon-choice' + (current === s.id ? ' active' : '')} disabled={busy} onClick={() => pick(s.id)} aria-pressed={current === s.id}>
            <img src={`./app-icons/${s.id}.png`} alt="" width={56} height={56} draggable={false} />
            <small>{s.label}</small>
          </button>
        ))}
      </div>
      <p className="muted small">{t('appIconHint')}</p>
      {error && <p className="error small">{error}</p>}
    </Section>
  );
}
