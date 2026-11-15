import type { Draft } from 'immer';
import { addTrackTo, baseClip, freeTrack, useStore } from '../store';
import type { AnimProp, BlendMode, Clip, Easing, EffectType, Keyframe, Project, ShapeKind } from '../types';
import { ANIMATION_TYPES, ANIM_PROPS, DEFAULT_TEXT, EFFECT_TYPES, clipEnd, projectDuration } from '../types';
import { EASINGS } from '../engine/keyframes';

export const SYSTEM_PROMPT = `You are CutVid AI, the assistant inside the CutVid video editor. You build and edit the user's timeline by returning a list of operations. You can create motion graphics and whole videos out of text, shapes and the media files already imported into the project. You only edit the timeline: you cannot generate footage, pictures or audio. When a request needs media that is not in the project, build the best version you can from text, shapes and overlays, and say what is missing.

Reply with ONE JSON object and nothing else (no markdown fence):
{"message": "<one or two sentences to the user, in the language they wrote in>", "ops": [ ...operations... ]}
Use "ops": [] when you only need to answer a question.

Coordinate system
- Time is in seconds. x and y are offsets from the centre of the frame as a fraction of its width / height: x=-0.5 is the left edge, x=0.5 the right edge, y=-0.5 the top, y=0.5 the bottom.
- scale 1 = natural size (media fills the frame), rotation in degrees, opacity 0..1.
- Text "size" is the font height in pixels on a 1080-pixel-tall frame (titles 110-170, body 50-80). Use "\\n" for line breaks.
- Shape width / height are fractions of the frame width / height (1 x 1 covers the frame).
- Later operations are placed on higher layers than earlier ones, so add backgrounds first and text last.

Operations
- {"op":"addText","id":"t1","content":"...","start":0,"duration":3, ...text fields, ...common fields}
  text fields: size, color, bold, italic, font ("sans"|"rounded"|"display"|"condensed"|"serif"|"script"|"marker"|"mono"|"impact"), align ("left"|"center"|"right"), stroke, strokeWidth, background (colour or ""), shadow, glow (0-80) with glowColor, typewriter (bool)
- {"op":"addShape","id":"s1","kind":"rect"|"ellipse"|"triangle"|"star"|"heart"|"arrow"|"diamond"|"hexagon"|"line"|"bubble"|"ring"|"frame"|"letterbox"|"vignette"|"scanlines"|"grain","fill":"#rrggbb","fill2":"#rrggbb" (optional, makes a gradient), "gradientAngle":90,"width":1,"height":1,"radius":0,"start":0,"duration":3, ...common fields}
- {"op":"addMedia","id":"m1","asset":"a1","start":0,"duration":4,"offset":0,"speed":1,"volume":1, ...common fields}  ("asset" is an alias from the project summary; "offset" is the in-point inside the file; omit "duration" to use the rest of the file)
- {"op":"updateClip","clip":"c1", ...any field listed here}  (only the fields you include change)
- {"op":"deleteClip","clip":"c1"}
- {"op":"setProject","width":1080,"height":1920,"fps":30,"background":"#000000"}
- {"op":"clear"}  (removes every clip; use it only when the user asks to start over)

Common fields (all optional)
- x, y, scale, rotation, opacity, blend ("normal"|"screen"|"multiply"|"overlay"|"lighten"|"darken"|"difference")
- animIn / animOut: "none"|"fade"|"slideLeft"|"slideRight"|"slideUp"|"slideDown"|"zoomIn"|"zoomOut"|"spin"|"wipe"|"wipeRight"|"wipeUp"|"wipeDown"|"iris"|"flipX"|"flipY"|"bounce"|"drop"|"swing"|"blur", with animInDuration / animOutDuration in seconds
- effects: {"shake":0.5,"glitch":0.4} — continuous effects with strength 0..1 (0 removes): motionBlur (blurs fast movement; use it on clips that move), shake, pulse, wobble, float, zoomPunch, strobe, flash, rgbSplit, glitch, pixelate, mirror, grain, scanlines, hueCycle
- keyframes: {"x":[{"t":0,"v":-0.6,"ease":"easeOut"},{"t":1,"v":0}], "scale":[...]} for x, y, scale, rotation, opacity. "t" is seconds from the START OF THE CLIP. ease: "linear"|"easeIn"|"easeOut"|"easeInOut"|"backOut"|"backIn"|"elasticOut"|"bounceOut"|"expoOut"|"expoIn"|"sineInOut"|"hold", or a cubic-bezier array [x1,y1,x2,y2]. Set a property to null to remove its keyframes.
- filters: {"brightness":1,"contrast":1,"saturation":1,"hue":0,"blur":0,"grayscale":0,"sepia":0,"invert":0,"vignette":0}
- fadeIn / fadeOut (audio fades, seconds), chroma: {"enabled":true,"color":"#00ff00","similarity":0.35,"smoothness":0.1}

"clip" refers to an existing clip alias (c1, c2, ...) from the project summary, or to the "id" you gave a clip earlier in the same reply.

Craft
- Keep content inside the frame: |x| and |y| at most about 0.4 unless something is meant to enter or leave.
- Stagger entrances by 0.15-0.4 s, give every element an entrance, and let motion ease out. Prefer a few purposeful moves over many small ones.
- Pick a small palette (a background, one accent, a text colour with strong contrast) and keep it consistent.
- Match the frame: for a vertical frame stack elements and use larger text.
- When the user asks to change something that exists, use updateClip instead of adding a duplicate.`;

const ANIMS = ANIMATION_TYPES;
const KINDS: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'heart', 'arrow', 'diamond', 'hexagon', 'line', 'bubble', 'ring', 'frame', 'letterbox', 'vignette', 'scanlines', 'grain'];
const ease = (e: unknown): Easing => {
  if (typeof e === 'string' && EASINGS[e]) return e;
  if (Array.isArray(e) && e.length === 4 && e.every((n) => typeof n === 'number' && isFinite(n))) return [Math.max(0, Math.min(1, e[0])), e[1], Math.max(0, Math.min(1, e[2])), e[3]];
  return 'easeInOut';
};
const BLENDS: Record<string, BlendMode> = { normal: 'source-over', screen: 'screen', multiply: 'multiply', overlay: 'overlay', lighten: 'lighten', darken: 'darken', difference: 'difference' };
const FONTS: Record<string, string> = {
  sans: DEFAULT_TEXT.font,
  rounded: 'Rubik, Arial, sans-serif',
  display: '"Bebas Neue", Impact, sans-serif',
  condensed: 'Anton, Impact, sans-serif',
  serif: '"Playfair Display", Georgia, serif',
  script: 'Pacifico, cursive',
  marker: '"Permanent Marker", cursive',
  mono: '"Roboto Mono", "Courier New", monospace',
  impact: '"Bebas Neue", Impact, sans-serif',
};

/** Compact description of the project the model can reason over; aliases keep ids short. */
export function projectSummary(p: Project, time: number, selection: string[]) {
  const assets = p.assets.map((a, i) => ({ alias: `a${i + 1}`, name: a.name, kind: a.kind, duration: +a.duration.toFixed(2), width: a.width, height: a.height }));
  const clips = p.clips.map((c, i) => ({
    alias: `c${i + 1}`,
    type: c.type,
    name: c.name.slice(0, 60),
    layer: p.tracks.length - p.tracks.findIndex((t) => t.id === c.trackId),
    start: +c.start.toFixed(2),
    duration: +c.duration.toFixed(2),
    x: c.transform.x,
    y: c.transform.y,
    scale: c.transform.scale,
    ...(c.text ? { text: c.text.content, size: c.text.size, color: c.text.color } : {}),
    ...(c.shape ? { shape: c.shape.kind, fill: c.shape.fill } : {}),
    ...(Object.keys(c.keyframes).length ? { animated: Object.keys(c.keyframes) } : {}),
    ...(selection.includes(c.id) ? { selected: true } : {}),
  }));
  return { frame: { width: p.width, height: p.height, fps: p.fps, background: p.background }, duration: +projectDuration(p).toFixed(2), playhead: +time.toFixed(2), assets, clips };
}

/** Pull the JSON object out of a model reply, tolerating code fences and stray prose. */
export function parseReply(raw: string): { message: string; ops: any[] } {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { message: raw.trim(), ops: [] };
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    return { message: typeof obj.message === 'string' ? obj.message : '', ops: Array.isArray(obj.ops) ? obj.ops : [] };
  } catch {
    return { message: raw.trim(), ops: [] };
  }
}

const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined);
const color = (v: unknown): string | undefined => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(v.trim()) ? v.trim() : undefined);
const hex6 = (v: unknown): string | undefined => {
  const c = color(v);
  if (!c || !c.startsWith('#')) return undefined;
  if (c.length === 4) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  return c.length >= 7 ? c.slice(0, 7) : undefined;
};

/** New visual clips go above everything they overlap in time, so reply order is layer order. */
function trackAbove(p: Draft<Project>, start: number, end: number): string {
  const video = p.tracks.map((t, i) => ({ t, i })).filter((x) => x.t.kind === 'video');
  const busy = (id: string) => p.clips.some((c) => c.trackId === id && c.start < end - 1e-6 && clipEnd(c) > start + 1e-6);
  const topBusy = Math.min(...video.filter((x) => busy(x.t.id)).map((x) => x.i), Infinity);
  const free = video.filter((x) => x.i < topBusy && !x.t.locked).pop();
  return (free?.t ?? addTrackTo(p, 'video')).id;
}

/** Fields shared by every op that creates or updates a clip. Unknown or invalid values are ignored. */
function applyFields(c: Draft<Clip>, o: any) {
  const set = <K extends AnimProp>(k: K, min: number, max: number) => {
    const v = num(o[k], min, max);
    if (v !== undefined) c.transform[k] = v;
  };
  set('x', -3, 3);
  set('y', -3, 3);
  set('scale', 0.01, 20);
  set('rotation', -3600, 3600);
  set('opacity', 0, 1);
  if (typeof o.blend === 'string' && BLENDS[o.blend]) c.blend = BLENDS[o.blend];
  if (ANIMS.includes(o.animIn)) c.animIn.type = o.animIn;
  if (ANIMS.includes(o.animOut)) c.animOut.type = o.animOut;
  c.animIn.duration = num(o.animInDuration, 0.05, 10) ?? c.animIn.duration;
  c.animOut.duration = num(o.animOutDuration, 0.05, 10) ?? c.animOut.duration;
  c.fadeIn = num(o.fadeIn, 0, 30) ?? c.fadeIn;
  c.fadeOut = num(o.fadeOut, 0, 30) ?? c.fadeOut;
  c.volume = num(o.volume, 0, 2) ?? c.volume;

  if (o.keyframes && typeof o.keyframes === 'object') {
    for (const prop of ANIM_PROPS) {
      const list = o.keyframes[prop];
      if (list === null) delete c.keyframes[prop];
      if (!Array.isArray(list)) continue;
      const kfs: Keyframe[] = [];
      for (const k of list) {
        const t = num(k?.t, 0, 36000);
        const v = num(k?.v, -3600, 3600);
        if (t !== undefined && v !== undefined) kfs.push({ t, v, ease: ease(k.ease) });
      }
      if (kfs.length) c.keyframes[prop] = kfs.sort((a, b) => a.t - b.t);
    }
  }
  if (o.effects && typeof o.effects === 'object' && !Array.isArray(o.effects)) {
    for (const type of EFFECT_TYPES as EffectType[]) {
      const amount = num(o.effects[type], 0, 1);
      if (amount === undefined) continue;
      c.effects = c.effects.filter((e) => e.type !== type);
      if (amount > 0) c.effects.push({ type, amount });
    }
  }
  if (o.filters && typeof o.filters === 'object') {
    const f = o.filters;
    const lim: Record<keyof Clip['filters'], [number, number]> = { brightness: [0, 3], contrast: [0, 3], saturation: [0, 3], hue: [-360, 360], blur: [0, 100], grayscale: [0, 1], sepia: [0, 1], invert: [0, 1], vignette: [0, 1] };
    for (const k of Object.keys(lim) as (keyof Clip['filters'])[]) c.filters[k] = num(f[k], ...lim[k]) ?? c.filters[k];
  }
  if (o.chroma && typeof o.chroma === 'object') {
    if (typeof o.chroma.enabled === 'boolean') c.chroma.enabled = o.chroma.enabled;
    c.chroma.color = hex6(o.chroma.color) ?? c.chroma.color;
    c.chroma.similarity = num(o.chroma.similarity, 0.01, 1) ?? c.chroma.similarity;
    c.chroma.smoothness = num(o.chroma.smoothness, 0, 1) ?? c.chroma.smoothness;
  }
  if (c.text) {
    const t = c.text;
    if (typeof o.content === 'string' && o.content) {
      t.content = o.content;
      c.name = o.content.split('\n')[0].slice(0, 60);
    }
    t.size = num(o.size, 8, 600) ?? t.size;
    t.color = color(o.color) ?? t.color;
    t.stroke = color(o.stroke) ?? t.stroke;
    t.strokeWidth = num(o.strokeWidth, 0, 80) ?? t.strokeWidth;
    t.shadow = num(o.shadow, 0, 120) ?? t.shadow;
    t.glow = num(o.glow, 0, 80) ?? t.glow;
    t.glowColor = hex6(o.glowColor) ?? t.glowColor;
    if (typeof o.background === 'string') t.background = o.background === '' ? '' : (color(o.background) ?? t.background);
    if (typeof o.bold === 'boolean') t.bold = o.bold;
    if (typeof o.italic === 'boolean') t.italic = o.italic;
    if (typeof o.typewriter === 'boolean') t.typewriter = o.typewriter;
    if (o.align === 'left' || o.align === 'center' || o.align === 'right') t.align = o.align;
    if (typeof o.font === 'string' && FONTS[o.font]) t.font = FONTS[o.font];
  }
  if (c.shape) {
    const s = c.shape;
    s.fill = color(o.fill) ?? s.fill;
    s.width = num(o.width, 0.001, 5) ?? s.width;
    s.height = num(o.height, 0.001, 5) ?? s.height;
    s.radius = num(o.radius, 0, 0.5) ?? s.radius;
    if (KINDS.includes(o.kind)) s.kind = o.kind;
    if (o.fill2 === null || o.fill2 === '') s.fill2 = undefined;
    else s.fill2 = color(o.fill2) ?? s.fill2;
    s.gradientAngle = num(o.gradientAngle, 0, 360) ?? s.gradientAngle;
  }
}

/** Apply a model's operations as a single undoable edit. Returns how many were applied. */
export function applyOps(ops: any[]): number {
  let applied = 0;
  const st = useStore.getState();
  st.mutate((p) => {
    // Aliases are resolved against the project as it was when the summary was sent.
    const refs = new Map<string, string>();
    p.clips.forEach((c, i) => refs.set(`c${i + 1}`, c.id));
    const assets = new Map(p.assets.map((a, i) => [`a${i + 1}`, a]));
    const find = (ref: unknown) => p.clips.find((c) => c.id === refs.get(String(ref)));

    for (const o of ops) {
      if (!o || typeof o !== 'object') continue;
      const start = num(o.start, 0, 36000) ?? 0;
      let clip: Clip | null = null;

      switch (o.op) {
        case 'addText': {
          if (typeof o.content !== 'string' || !o.content) continue;
          const duration = num(o.duration, 0.1, 3600) ?? 3;
          clip = baseClip({ type: 'text', name: '', trackId: trackAbove(p, start, start + duration), start, duration, text: { ...DEFAULT_TEXT } });
          break;
        }
        case 'addShape': {
          const duration = num(o.duration, 0.1, 3600) ?? 3;
          clip = baseClip({ type: 'shape', name: KINDS.includes(o.kind) ? o.kind : 'rect', trackId: trackAbove(p, start, start + duration), start, duration, shape: { kind: 'rect', fill: '#7c5cff', width: 0.3, height: 0.3, radius: 0 } });
          break;
        }
        case 'addMedia': {
          const asset = assets.get(String(o.asset)) ?? p.assets.find((a) => a.name === o.asset);
          if (!asset) continue;
          const speed = num(o.speed, 0.1, 8) ?? 1;
          const timed = asset.kind !== 'image';
          const offset = timed ? (num(o.offset, 0, Math.max(0, asset.duration - 0.05)) ?? 0) : 0;
          const max = timed ? (asset.duration - offset) / speed : 3600;
          const duration = Math.max(0.05, Math.min(num(o.duration, 0.05, 3600) ?? (timed ? max : 5), max));
          const trackId = asset.kind === 'audio' ? freeTrack(p, 'audio', start, start + duration) : trackAbove(p, start, start + duration);
          clip = baseClip({ type: asset.kind, assetId: asset.id, name: asset.name, trackId, start, duration, offset, speed });
          break;
        }
        case 'updateClip': {
          const c = find(o.clip);
          if (!c) continue;
          c.start = num(o.start, 0, 36000) ?? c.start;
          c.duration = num(o.duration, 0.05, 3600) ?? c.duration;
          applyFields(c, o);
          applied++;
          continue;
        }
        case 'deleteClip': {
          const c = find(o.clip);
          if (!c) continue;
          p.clips = p.clips.filter((x) => x.id !== c.id);
          applied++;
          continue;
        }
        case 'setProject': {
          const w = num(o.width, 64, 7680);
          const h = num(o.height, 64, 7680);
          if (w && h) {
            p.width = Math.round(w / 2) * 2;
            p.height = Math.round(h / 2) * 2;
          }
          p.fps = num(o.fps, 1, 120) ?? p.fps;
          p.background = hex6(o.background) ?? p.background;
          applied++;
          continue;
        }
        case 'clear':
          p.clips = [];
          applied++;
          continue;
        default:
          continue;
      }

      if (clip) {
        p.clips.push(clip);
        const draft = p.clips[p.clips.length - 1];
        applyFields(draft, o);
        if (typeof o.id === 'string') refs.set(o.id, clip.id);
        applied++;
      }
    }
  });
  if (applied) useStore.setState({ selection: [] });
  return applied;
}
