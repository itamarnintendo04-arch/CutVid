import { Diamond, FlipHorizontal2, FlipVertical2, RotateCcw } from 'lucide-react';
import { selectedClip, useStore } from '../store';
import { useT, type TKey } from '../lib/i18n';
import type { AnimProp, AnimationType, BlendMode, Clip, Easing, Filters } from '../types';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../types';
import { findKeyframe, propAt } from '../engine/keyframes';
import { canvasFiltersSupported } from '../engine/render';
import { Section, Slider, Toggle } from './ui';

const FORMATS = [
  { label: '16:9 · 1920×1080', w: 1920, h: 1080 },
  { label: '9:16 · 1080×1920', w: 1080, h: 1920 },
  { label: '1:1 · 1080×1080', w: 1080, h: 1080 },
  { label: '4:5 · 1080×1350', w: 1080, h: 1350 },
  { label: '21:9 · 2560×1080', w: 2560, h: 1080 },
  { label: '4K · 3840×2160', w: 3840, h: 2160 },
];

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
  { name: 'Negative', f: { invert: 1 } },
];

const ANIMS: AnimationType[] = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'zoomIn', 'zoomOut', 'spin', 'wipe', 'blur'];
const BLENDS: BlendMode[] = ['source-over', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'difference', 'color-dodge', 'hard-light', 'soft-light'];
const FONTS = [
  ['Heebo / Sans', 'Heebo, Arial, sans-serif'],
  ['Arial', 'Arial, sans-serif'],
  ['Impact', 'Impact, "Arial Black", sans-serif'],
  ['Georgia', 'Georgia, serif'],
  ['Times', '"Times New Roman", serif'],
  ['Courier', '"Courier New", monospace'],
  ['Verdana', 'Verdana, sans-serif'],
  ['Comic', '"Comic Sans MS", cursive'],
];
const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'];

function ProjectSettings() {
  const t = useT();
  const p = useStore((s) => s.project);
  const mutate = useStore((s) => s.mutate);
  return (
    <>
      <p className="muted center">{t('noSelection')}</p>
      <Section title={t('project')}>
        <label className="field">
          <span className="field-label">{t('name')}</span>
          <input type="text" value={p.name} onChange={(e) => mutate((d) => void (d.name = e.target.value), false)} />
        </label>
        <label className="field">
          <span className="field-label">{t('format')}</span>
          <select
            value={`${p.width}x${p.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              mutate((d) => {
                d.width = w;
                d.height = h;
              });
            }}
          >
            {FORMATS.map((f) => (
              <option key={f.label} value={`${f.w}x${f.h}`}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('fps')}</span>
          <select value={p.fps} onChange={(e) => mutate((d) => void (d.fps = +e.target.value))}>
            {[24, 25, 30, 50, 60].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span className="field-label">{t('background')}</span>
          <input type="color" value={p.background} onChange={(e) => mutate((d) => void (d.background = e.target.value), false)} />
        </label>
      </Section>
    </>
  );
}

/** Slider for an animatable property with a keyframe toggle (After Effects style stopwatch). */
function AnimSlider(props: { clip: Clip; prop: AnimProp; label: TKey; min: number; max: number; step?: number; display?: number; unit?: string }) {
  const t = useT();
  const { clip, prop } = props;
  const time = useStore((s) => s.time);
  const setProp = useStore((s) => s.setProp);
  const toggleKeyframe = useStore((s) => s.toggleKeyframe);
  const lt = Math.max(0, Math.min(clip.duration, time - clip.start));
  const animated = !!clip.keyframes[prop]?.length;
  const onKey = findKeyframe(clip, prop, lt) >= 0;
  return (
    <Slider
      label={t(props.label)}
      value={propAt(clip, prop, lt)}
      min={props.min}
      max={props.max}
      step={props.step}
      display={props.display}
      unit={props.unit}
      onChange={(v) => setProp(clip.id, prop, v, false)}
      extra={
        <button
          type="button"
          className={'kf-btn' + (onKey ? ' on' : animated ? ' animated' : '')}
          title={t('keyframe')}
          aria-label={t('keyframe')}
          onClick={(e) => {
            e.preventDefault();
            toggleKeyframe(clip.id, prop);
          }}
        >
          <Diamond size={12} fill={onKey ? 'currentColor' : 'none'} />
        </button>
      }
    />
  );
}

export function Inspector() {
  const t = useT();
  const clip = useStore(selectedClip);
  const updateClip = useStore((s) => s.updateClip);
  const setSpeed = useStore((s) => s.setSpeed);
  const snapshot = useStore((s) => s.snapshot);

  if (!clip)
    return (
      <div className="panel inspector">
        <div className="panel-scroll">
          <ProjectSettings />
        </div>
      </div>
    );

  const up = (fn: (c: Clip) => void, record = false) => updateClip(clip.id, fn as never, record);
  const visual = clip.type !== 'audio';
  const hasAudio = clip.type === 'audio' || clip.type === 'video';
  const hasKeyframes = Object.values(clip.keyframes).some((k) => k && k.length);

  return (
    <div className="panel inspector">
      <div className="panel-scroll">
        <div className="clip-title">{clip.name}</div>

        {clip.text && (
          <Section title={t('text')}>
            <textarea
              rows={3}
              dir="auto"
              value={clip.text.content}
              onFocus={snapshot}
              onChange={(e) =>
                up((c) => {
                  c.text!.content = e.target.value;
                  c.name = e.target.value.split('\n')[0] || 'Text';
                })
              }
            />
            <label className="field">
              <span className="field-label">{t('font')}</span>
              <select value={clip.text.font} onChange={(e) => up((c) => void (c.text!.font = e.target.value), true)}>
                {FONTS.map(([n, v]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Slider label={t('size')} value={clip.text.size} min={12} max={400} step={1} onChange={(v) => up((c) => void (c.text!.size = v))} />
            <div className="row">
              <label className="field inline">
                <span className="field-label">{t('color')}</span>
                <input type="color" value={clip.text.color} onPointerDown={snapshot} onChange={(e) => up((c) => void (c.text!.color = e.target.value))} />
              </label>
              <Toggle label={t('bold')} checked={clip.text.bold} onChange={(v) => up((c) => void (c.text!.bold = v), true)} />
              <Toggle label={t('italic')} checked={clip.text.italic} onChange={(v) => up((c) => void (c.text!.italic = v), true)} />
            </div>
            <label className="field">
              <span className="field-label">{t('align')}</span>
              <select value={clip.text.align} onChange={(e) => up((c) => void (c.text!.align = e.target.value as 'left'), true)}>
                <option value="left">⇤</option>
                <option value="center">↔</option>
                <option value="right">⇥</option>
              </select>
            </label>
            <div className="row">
              <label className="field inline">
                <span className="field-label">{t('stroke')}</span>
                <input type="color" value={clip.text.stroke} onPointerDown={snapshot} onChange={(e) => up((c) => void (c.text!.stroke = e.target.value))} />
              </label>
              <label className="field inline">
                <span className="field-label">{t('textBg')}</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(clip.text.background) ? clip.text.background : '#000000'}
                  onPointerDown={snapshot}
                  onChange={(e) => up((c) => void (c.text!.background = e.target.value))}
                />
              </label>
              {clip.text.background && (
                <button className="chip" onClick={() => up((c) => void (c.text!.background = ''), true)}>
                  {t('none')}
                </button>
              )}
            </div>
            <Slider label={t('strokeWidth')} value={clip.text.strokeWidth} min={0} max={40} step={1} onChange={(v) => up((c) => void (c.text!.strokeWidth = v))} />
            <Slider label={t('shadow')} value={clip.text.shadow} min={0} max={60} step={1} onChange={(v) => up((c) => void (c.text!.shadow = v))} />
            <Toggle label={t('typewriter')} checked={clip.text.typewriter} onChange={(v) => up((c) => void (c.text!.typewriter = v), true)} />
          </Section>
        )}

        {clip.shape && (
          <Section title={t('shape')}>
            <label className="field inline">
              <span className="field-label">{t('fill')}</span>
              <input type="color" value={clip.shape.fill} onPointerDown={snapshot} onChange={(e) => up((c) => void (c.shape!.fill = e.target.value))} />
            </label>
            <Slider label={t('width')} value={clip.shape.width} min={0.01} max={1.5} display={100} unit="%" onChange={(v) => up((c) => void (c.shape!.width = v))} />
            <Slider label={t('height')} value={clip.shape.height} min={0.01} max={1.5} display={100} unit="%" onChange={(v) => up((c) => void (c.shape!.height = v))} />
            {clip.shape.kind === 'rect' && (
              <Slider label={t('radius')} value={clip.shape.radius} min={0} max={0.5} display={100} unit="%" onChange={(v) => up((c) => void (c.shape!.radius = v))} />
            )}
          </Section>
        )}

        {visual && (
          <Section
            title={t('transform')}
            action={
              <button
                className="icon-btn small"
                title={t('reset')}
                aria-label={t('reset')}
                onClick={() =>
                  up((c) => {
                    c.transform = { ...DEFAULT_TRANSFORM };
                    c.keyframes = {};
                  }, true)
                }
              >
                <RotateCcw size={13} />
              </button>
            }
          >
            <AnimSlider clip={clip} prop="x" label="posX" min={-1} max={1} step={0.001} display={100} unit="%" />
            <AnimSlider clip={clip} prop="y" label="posY" min={-1} max={1} step={0.001} display={100} unit="%" />
            <AnimSlider clip={clip} prop="scale" label="scale" min={0.05} max={4} display={100} unit="%" />
            <AnimSlider clip={clip} prop="rotation" label="rotation" min={-360} max={360} step={1} unit="°" />
            <AnimSlider clip={clip} prop="opacity" label="opacity" min={0} max={1} display={100} unit="%" />
            {hasKeyframes && (
              <label className="field">
                <span className="field-label">{t('easing')}</span>
                <select
                  value={Object.values(clip.keyframes).find((k) => k?.length)?.[0].ease ?? 'easeInOut'}
                  onChange={(e) =>
                    up((c) => {
                      for (const kfs of Object.values(c.keyframes)) kfs?.forEach((k) => (k.ease = e.target.value as Easing));
                    }, true)
                  }
                >
                  {EASINGS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="row">
              <button className={'chip' + (clip.transform.flipH ? ' active' : '')} onClick={() => up((c) => void (c.transform.flipH = !c.transform.flipH), true)}>
                <FlipHorizontal2 size={14} /> {t('flipH')}
              </button>
              <button className={'chip' + (clip.transform.flipV ? ' active' : '')} onClick={() => up((c) => void (c.transform.flipV = !c.transform.flipV), true)}>
                <FlipVertical2 size={14} /> {t('flipV')}
              </button>
            </div>
            <label className="field">
              <span className="field-label">{t('blend')}</span>
              <select value={clip.blend} onChange={(e) => up((c) => void (c.blend = e.target.value as BlendMode), true)}>
                {BLENDS.map((b) => (
                  <option key={b} value={b}>
                    {b === 'source-over' ? 'normal' : b}
                  </option>
                ))}
              </select>
            </label>
          </Section>
        )}

        {visual && (
          <Section title={t('animation')}>
            {(['animIn', 'animOut'] as const).map((k) => (
              <div key={k}>
                <label className="field">
                  <span className="field-label">{t(k)}</span>
                  <select value={clip[k].type} onChange={(e) => up((c) => void (c[k].type = e.target.value as AnimationType), true)}>
                    {ANIMS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                {clip[k].type !== 'none' && (
                  <Slider label={t('duration')} value={clip[k].duration} min={0.1} max={Math.max(0.2, Math.min(5, clip.duration))} step={0.05} unit="s" onChange={(v) => up((c) => void (c[k].duration = v))} />
                )}
              </div>
            ))}
          </Section>
        )}

        {hasAudio && (
          <Section title={clip.type === 'video' ? `${t('speed')} · ${t('audio')}` : t('audio')}>
            <Slider label={t('speed')} value={clip.speed} min={0.1} max={8} step={0.05} unit="×" onChange={(v) => setSpeed(clip.id, v)} />
            <Slider label={t('volume')} value={clip.volume} min={0} max={2} display={100} unit="%" onChange={(v) => up((c) => void (c.volume = v))} />
            <Slider label={t('fadeIn')} value={clip.fadeIn} min={0} max={Math.min(10, clip.duration)} step={0.05} unit="s" onChange={(v) => up((c) => void (c.fadeIn = v))} />
            <Slider label={t('fadeOut')} value={clip.fadeOut} min={0} max={Math.min(10, clip.duration)} step={0.05} unit="s" onChange={(v) => up((c) => void (c.fadeOut = v))} />
          </Section>
        )}

        {visual && (
          <Section title={t('filters')} defaultOpen={false}>
            {!canvasFiltersSupported() && <p className="muted">Canvas filters are not supported by this browser.</p>}
            <div className="chips">
              {FILTER_PRESETS.map((p) => (
                <button key={p.name} className="chip" onClick={() => up((c) => void (c.filters = { ...DEFAULT_FILTERS, ...p.f }), true)}>
                  {p.name}
                </button>
              ))}
            </div>
            <Slider label={t('brightness')} value={clip.filters.brightness} min={0} max={2} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.brightness = v))} />
            <Slider label={t('contrast')} value={clip.filters.contrast} min={0} max={2} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.contrast = v))} />
            <Slider label={t('saturation')} value={clip.filters.saturation} min={0} max={3} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.saturation = v))} />
            <Slider label={t('hue')} value={clip.filters.hue} min={-180} max={180} step={1} unit="°" onChange={(v) => up((c) => void (c.filters.hue = v))} />
            <Slider label={t('blur')} value={clip.filters.blur} min={0} max={40} step={0.5} onChange={(v) => up((c) => void (c.filters.blur = v))} />
            <Slider label={t('grayscale')} value={clip.filters.grayscale} min={0} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.grayscale = v))} />
            <Slider label={t('sepia')} value={clip.filters.sepia} min={0} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.sepia = v))} />
            <Slider label={t('invert')} value={clip.filters.invert} min={0} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.invert = v))} />
            <Slider label={t('vignette')} value={clip.filters.vignette} min={0} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.filters.vignette = v))} />
          </Section>
        )}

        {(clip.type === 'video' || clip.type === 'image') && (
          <Section title={t('chroma')} defaultOpen={false}>
            <div className="row">
              <Toggle label={t('enabled')} checked={clip.chroma.enabled} onChange={(v) => up((c) => void (c.chroma.enabled = v), true)} />
              <label className="field inline">
                <span className="field-label">{t('keyColor')}</span>
                <input type="color" value={clip.chroma.color} onPointerDown={snapshot} onChange={(e) => up((c) => void (c.chroma.color = e.target.value))} />
              </label>
            </div>
            <Slider label={t('similarity')} value={clip.chroma.similarity} min={0.01} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.chroma.similarity = v))} />
            <Slider label={t('smoothness')} value={clip.chroma.smoothness} min={0} max={1} display={100} unit="%" onChange={(v) => up((c) => void (c.chroma.smoothness = v))} />
          </Section>
        )}
      </div>
    </div>
  );
}
