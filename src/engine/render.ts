import type { AnimationType, Clip, ClipEffect, Project, ShapeStyle } from '../types';
import { isVisual } from '../types';
import { EASINGS, propAt } from './keyframes';

export interface Layout {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface RenderOptions {
  /** Canvas pixels per project pixel. */
  scale: number;
  video: (clip: Clip) => HTMLVideoElement | null;
  image: (assetId: string) => HTMLImageElement | null;
  /** Filled with on-canvas boxes (project pixels) of every drawn clip, for hit-testing. */
  layouts?: Map<string, Layout>;
}

type Ctx = CanvasRenderingContext2D;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const TAU = Math.PI * 2;

/** Deterministic pseudo-random in 0..1 so preview and export glitch identically. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface Mod {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  sx: number;
  sy: number;
  rot: number;
  wipe: number; // visible fraction
  wipeMode: 'l' | 'r' | 'u' | 'd' | 'iris';
  blur: number;
  hue: number;
}

function applyAnim(m: Mod, type: AnimationType, a: number, dir: 1 | -1, p: number) {
  // a: 0 = at rest, 1 = fully "away" (eased). p: raw progress 0..1. dir: 1 intro, -1 outro.
  if (a <= 0) return;
  const wipe = (mode: Mod['wipeMode']) => {
    m.wipe *= 1 - a;
    m.wipeMode = mode;
  };
  switch (type) {
    case 'fade':
      m.alpha *= 1 - a;
      break;
    case 'slideLeft':
      m.dx += a * dir;
      break;
    case 'slideRight':
      m.dx -= a * dir;
      break;
    case 'slideUp':
      m.dy += a * dir;
      break;
    case 'slideDown':
      m.dy -= a * dir;
      break;
    case 'zoomIn':
      m.scale *= dir === 1 ? 1 - a * 0.7 : 1 + a * 0.7;
      m.alpha *= 1 - a;
      break;
    case 'zoomOut':
      m.scale *= dir === 1 ? 1 + a * 0.7 : 1 - a * 0.7;
      m.alpha *= 1 - a;
      break;
    case 'spin':
      m.rot -= a * 180 * dir;
      m.scale *= 1 - a * 0.5;
      m.alpha *= 1 - a;
      break;
    case 'wipe':
      wipe('l');
      break;
    case 'wipeRight':
      wipe('r');
      break;
    case 'wipeUp':
      wipe('u');
      break;
    case 'wipeDown':
      wipe('d');
      break;
    case 'iris':
      wipe('iris');
      break;
    case 'flipX':
      m.sx *= 1 - a;
      break;
    case 'flipY':
      m.sy *= 1 - a;
      break;
    case 'bounce':
      m.dy -= (1 - EASINGS.bounceOut(p)) * 0.6;
      m.alpha *= clamp01(p * 5);
      break;
    case 'drop':
      m.scale *= 1 + a * 2.2;
      m.alpha *= 1 - a;
      break;
    case 'swing':
      m.rot += a * 50 * dir;
      m.dx += a * 0.25 * dir;
      m.alpha *= 1 - a;
      break;
    case 'blur':
      m.blur += a * 40;
      m.alpha *= 1 - a;
      break;
  }
}

/** Continuous motion effects only change the transform; pixel effects are applied later. */
function applyMotionEffects(m: Mod, effects: ClipEffect[], t: number) {
  for (const e of effects) {
    const k = e.amount;
    if (k <= 0) continue;
    switch (e.type) {
      case 'shake':
        m.dx += k * 0.025 * Math.sin(t * 61) * Math.sin(t * 13.7 + 1);
        m.dy += k * 0.025 * Math.sin(t * 83 + 1.3) * Math.sin(t * 17.1);
        break;
      case 'pulse':
        m.scale *= 1 + k * 0.12 * Math.sin(t * TAU * 1.5);
        break;
      case 'wobble':
        m.rot += k * 10 * Math.sin(t * TAU * 0.8);
        break;
      case 'float':
        m.dy += k * 0.035 * Math.sin(t * TAU * 0.5);
        break;
      case 'zoomPunch':
        m.scale *= 1 + k * 0.3 * Math.max(0, 1 - (t % 1) * 4);
        break;
      case 'strobe':
        if (Math.floor(t * 10) % 2) m.alpha *= 1 - k;
        break;
      case 'hueCycle':
        m.hue += t * 360 * k * 0.5;
        break;
    }
  }
}

let supportsFilter: boolean | null = null;
/** Safari only gained canvas filters recently; without them colour filters are skipped. */
export function canvasFiltersSupported(): boolean {
  if (supportsFilter === null) {
    const c = document.createElement('canvas').getContext('2d');
    supportsFilter = !!c && 'filter' in c;
  }
  return supportsFilter;
}

function filterString(clip: Clip, m: Mod, pxScale: number): string {
  const f = clip.filters;
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
  const hue = f.hue + m.hue;
  if (hue !== 0) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia})`);
  if (f.invert > 0) parts.push(`invert(${f.invert})`);
  const blur = (f.blur + m.blur) * pxScale;
  if (blur > 0.05) parts.push(`blur(${blur.toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

// ---- fonts --------------------------------------------------------------------------------
const requestedFonts = new Set<string>();
/** Called when a web font finished loading so the frame can be redrawn with it. */
export const fontEvents = { onLoad: () => {} };

function ensureFont(spec: string, sample: string) {
  if (requestedFonts.has(spec) || !document.fonts) return;
  requestedFonts.add(spec);
  document.fonts.load(spec, sample || 'A').then(
    () => fontEvents.onLoad(),
    () => {},
  );
}

/** Resolve once every font used by the project's text clips is ready (used before export). */
export async function fontsReady(project: Project) {
  if (!document.fonts) return;
  await Promise.all(
    project.clips.filter((c) => c.text).map((c) => document.fonts.load(`${c.text!.italic ? 'italic ' : ''}${c.text!.bold ? '700' : '400'} 40px ${c.text!.font}`, c.text!.content).catch(() => [])),
  );
}

// ---- scratch canvases ---------------------------------------------------------------------
const scratch: Record<string, HTMLCanvasElement> = {};
function canvas(name: string, w: number, h: number, readback = false): [HTMLCanvasElement, Ctx] {
  const c = (scratch[name] ??= document.createElement('canvas'));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const g = c.getContext('2d', readback ? { willReadFrequently: true } : undefined)!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return [c, g];
}

let noiseTile: HTMLCanvasElement | null = null;
function noise(): HTMLCanvasElement {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas');
    noiseTile.width = noiseTile.height = 160;
    const g = noiseTile.getContext('2d')!;
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return noiseTile;
}

function chromaKey(g: Ctx, w: number, h: number, clip: Clip) {
  let img: ImageData;
  try {
    img = g.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const d = img.data;
  const hex = clip.chroma.color.replace('#', '');
  const kr = parseInt(hex.slice(0, 2), 16);
  const kg = parseInt(hex.slice(2, 4), 16);
  const kb = parseInt(hex.slice(4, 6), 16);
  // Compare in chroma (Cb/Cr) space so brightness differences of the screen do not matter.
  const kcb = -0.169 * kr - 0.331 * kg + 0.5 * kb;
  const kcr = 0.5 * kr - 0.419 * kg - 0.081 * kb;
  const sim = clip.chroma.similarity * 180;
  const smooth = Math.max(1, clip.chroma.smoothness * 180);
  for (let i = 0; i < d.length; i += 4) {
    const cb = -0.169 * d[i] - 0.331 * d[i + 1] + 0.5 * d[i + 2];
    const cr = 0.5 * d[i] - 0.419 * d[i + 1] - 0.081 * d[i + 2];
    const dist = Math.hypot(cb - kcb, cr - kcr);
    if (dist < sim) d[i + 3] = 0;
    else if (dist < sim + smooth) d[i + 3] = (d[i + 3] * (dist - sim)) / smooth;
  }
  g.putImageData(img, 0, 0);
}

const PIXEL_EFFECTS = new Set(['rgbSplit', 'glitch', 'pixelate', 'mirror']);

/** Effects that need the clip rendered to its own surface first. */
function applyPixelEffects(stage: HTMLCanvasElement, g: Ctx, clip: Clip, t: number) {
  const w = stage.width;
  const h = stage.height;
  if (clip.chroma.enabled && clip.type !== 'text' && clip.type !== 'shape') chromaKey(g, w, h, clip);

  for (const e of clip.effects) {
    const k = e.amount;
    if (k <= 0) continue;
    if (e.type === 'pixelate') {
      const block = 3 + k * 40;
      const [small, sg] = canvas('small', Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)));
      sg.clearRect(0, 0, small.width, small.height);
      sg.drawImage(stage, 0, 0, small.width, small.height);
      g.clearRect(0, 0, w, h);
      g.imageSmoothingEnabled = false;
      g.drawImage(small, 0, 0, w, h);
      g.imageSmoothingEnabled = true;
    } else if (e.type === 'mirror') {
      g.save();
      g.clearRect(w / 2, 0, w / 2, h);
      g.translate(w, 0);
      g.scale(-1, 1);
      g.drawImage(stage, 0, 0, w / 2, h, 0, 0, w / 2, h);
      g.restore();
    } else if (e.type === 'rgbSplit' || e.type === 'glitch') {
      const bucket = Math.floor(t * 12);
      const active = e.type === 'rgbSplit' || hash(bucket) < 0.35 + k * 0.4;
      if (!active) continue;
      const jitter = e.type === 'glitch' ? 0.4 + hash(bucket + 9) : 1;
      const off = Math.max(1, k * 0.03 * w * jitter);
      const [orig, og] = canvas('orig', w, h);
      og.clearRect(0, 0, w, h);
      og.drawImage(stage, 0, 0);
      const [tint, tg] = canvas('tint', w, h);
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const [color, dx] of [['#ff0000', -off], ['#00ff00', 0], ['#0000ff', off]] as const) {
        tg.globalCompositeOperation = 'source-over';
        tg.clearRect(0, 0, w, h);
        tg.drawImage(orig, 0, 0);
        tg.globalCompositeOperation = 'multiply';
        tg.fillStyle = color;
        tg.fillRect(0, 0, w, h);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(orig, 0, 0);
        g.drawImage(tint, dx, 0);
      }
      g.globalCompositeOperation = 'source-over';
      if (e.type === 'glitch') {
        og.clearRect(0, 0, w, h);
        og.drawImage(stage, 0, 0);
        const slices = 2 + Math.floor(k * 6);
        for (let i = 0; i < slices; i++) {
          const y = Math.floor(hash(bucket * 7 + i) * h);
          const sh = Math.max(2, Math.floor(hash(bucket * 3 + i * 5) * h * 0.12));
          const dx = (hash(bucket + i * 11) - 0.5) * w * 0.25 * k;
          g.clearRect(0, y, w, sh);
          g.drawImage(orig, 0, y, w, sh, dx, y, w, sh);
        }
      }
    }
  }
}

// ---- text ---------------------------------------------------------------------------------
function textFont(clip: Clip, H: number): string {
  const t = clip.text!;
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${Math.max(4, (t.size * H) / 1080)}px ${t.font}`;
}

function measureText(ctx: Ctx, clip: Clip, H: number) {
  const t = clip.text!;
  const font = textFont(clip, H);
  ensureFont(font, t.content);
  ctx.font = font;
  const lines = t.content.split('\n');
  const px = (t.size * H) / 1080;
  const lh = px * t.lineHeight;
  let maxW = 1;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l || ' ').width);
  const pad = t.background ? px * 0.3 : 0;
  return { lines, lh, px, pad, w: maxW + pad * 2, h: lines.length * lh + pad * 2, textW: maxW };
}

function drawText(ctx: Ctx, clip: Clip, H: number, localT: number, m: ReturnType<typeof measureText>) {
  const t = clip.text!;
  const u = H / 1080;
  ctx.font = textFont(clip, H);
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  if (t.background) {
    ctx.fillStyle = t.background;
    roundRect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, m.px * 0.18);
    ctx.fill();
  }
  let budget = t.typewriter ? Math.floor(localT * 20) : Infinity;
  ctx.textAlign = t.align;
  const x = t.align === 'left' ? -m.textW / 2 : t.align === 'right' ? m.textW / 2 : 0;
  ctx.lineJoin = 'round';
  m.lines.forEach((full, i) => {
    if (budget <= 0) return;
    const line = budget >= full.length ? full : Array.from(full).slice(0, budget).join('');
    budget -= full.length;
    const y = -m.h / 2 + m.pad + m.lh * (i + 0.5);
    if (t.glow > 0) {
      // Two passes: a wide soft halo and a tighter bright core.
      ctx.fillStyle = t.glowColor;
      ctx.shadowColor = t.glowColor;
      ctx.shadowOffsetY = 0;
      for (const r of [t.glow * 1.6, t.glow * 0.6]) {
        ctx.shadowBlur = r * u;
        ctx.fillText(line, x, y);
      }
      ctx.shadowColor = 'transparent';
    }
    if (t.shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = t.shadow * u;
      ctx.shadowOffsetY = (t.shadow * u) / 3;
    }
    if (t.strokeWidth > 0) {
      ctx.strokeStyle = t.stroke;
      ctx.lineWidth = t.strokeWidth * u;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
  });
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- shapes -------------------------------------------------------------------------------
function polygon(ctx: Ctx, pts: [number, number][], w: number, h: number) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * w, py * h) : ctx.moveTo(px * w, py * h)));
  ctx.closePath();
}

function shapeFill(ctx: Ctx, s: ShapeStyle, w: number, h: number): string | CanvasGradient {
  if (!s.fill2) return s.fill;
  const a = ((s.gradientAngle ?? 90) * Math.PI) / 180;
  const dx = (Math.cos(a) * w) / 2;
  const dy = (Math.sin(a) * h) / 2;
  const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
  g.addColorStop(0, s.fill);
  g.addColorStop(1, s.fill2);
  return g;
}

/** Draw a shape centred on the origin inside a w × h box. */
export function drawShape(ctx: Ctx, s: ShapeStyle, w: number, h: number, t: number, unit: number) {
  const fill = shapeFill(ctx, s, w, h);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  const m = Math.min(w, h);
  switch (s.kind) {
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
      ctx.fill();
      break;
    case 'triangle':
      polygon(ctx, [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]], w, h);
      ctx.fill();
      break;
    case 'diamond':
      polygon(ctx, [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]], w, h);
      ctx.fill();
      break;
    case 'hexagon':
      polygon(ctx, [[-0.25, -0.5], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0]], w, h);
      ctx.fill();
      break;
    case 'arrow':
      polygon(ctx, [[-0.5, -0.18], [0.12, -0.18], [0.12, -0.5], [0.5, 0], [0.12, 0.5], [0.12, 0.18], [-0.5, 0.18]], w, h);
      ctx.fill();
      break;
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.2 : 0.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polygon(ctx, pts, w, h);
      ctx.fill();
      break;
    }
    case 'heart': {
      const x = w / 2;
      const y = h / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(-x * 2.1, -y * 0.25, -x * 0.9, -y * 1.45, 0, -y * 0.45);
      ctx.bezierCurveTo(x * 0.9, -y * 1.45, x * 2.1, -y * 0.25, 0, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'line':
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      break;
    case 'bubble': {
      const bh = h * 0.78;
      roundRect(ctx, -w / 2, -h / 2, w, bh, m * 0.18);
      ctx.fill();
      polygon(ctx, [[-0.28, 0.25], [-0.36, 0.5], [-0.08, 0.25]], w, h);
      ctx.fill();
      break;
    }
    case 'ring':
      ctx.lineWidth = m * Math.max(0.02, s.radius || 0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, w / 2 - ctx.lineWidth / 2), Math.max(1, h / 2 - ctx.lineWidth / 2), 0, 0, TAU);
      ctx.stroke();
      break;
    case 'frame': {
      const lw = m * Math.max(0.01, s.radius || 0.04);
      ctx.lineWidth = lw;
      ctx.strokeRect(-w / 2 + lw / 2, -h / 2 + lw / 2, w - lw, h - lw);
      break;
    }
    case 'letterbox': {
      const bar = h * Math.max(0.02, s.radius || 0.12);
      ctx.fillRect(-w / 2, -h / 2, w, bar);
      ctx.fillRect(-w / 2, h / 2 - bar, w, bar);
      break;
    }
    case 'vignette': {
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, s.fill);
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'scanlines': {
      const step = Math.max(2, 5 * unit);
      const drift = (t * 30 * unit) % step;
      for (let y = -h / 2 + drift; y < h / 2; y += step) ctx.fillRect(-w / 2, y, w, step * 0.45);
      break;
    }
    case 'grain': {
      const tile = noise();
      const p = ctx.createPattern(tile, 'repeat');
      if (!p) break;
      const f = Math.floor(t * 24);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.clip();
      ctx.translate(-hash(f) * 160, -hash(f + 5) * 160);
      const k = Math.max(1, unit * 2);
      ctx.scale(k, k);
      ctx.fillStyle = p;
      ctx.fillRect(-w / k, -h / k, (w * 2) / k + 320, (h * 2) / k + 320);
      ctx.restore();
      break;
    }
    default:
      roundRect(ctx, -w / 2, -h / 2, w, h, (s.radius || 0) * m);
      ctx.fill();
  }
}

// ---- compositor ---------------------------------------------------------------------------
/** Composite one frame of the project at time t. The same code drives preview and export. */
export function drawFrame(ctx: Ctx, project: Project, t: number, opts: RenderOptions) {
  const W = project.width;
  const H = project.height;
  const useFilter = canvasFiltersSupported();
  ctx.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (useFilter) ctx.filter = 'none';
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, W, H);
  opts.layouts?.clear();

  for (let ti = project.tracks.length - 1; ti >= 0; ti--) {
    const track = project.tracks[ti];
    if (track.kind !== 'video' || track.hidden) continue;
    for (const clip of project.clips) {
      if (clip.trackId !== track.id || !isVisual(clip.type)) continue;
      const lt = t - clip.start;
      if (lt < 0 || lt >= clip.duration) continue;
      const blur = clip.effects?.find((e) => e.type === 'motionBlur' && e.amount > 0);
      if (!blur) {
        drawClip(ctx, project, clip, lt, opts, useFilter);
        continue;
      }
      // Motion blur: average several sub-frame positions of the clip (a virtual open shutter).
      // Additive blending of N passes at 1/N opacity keeps still parts fully opaque.
      const [acc, ag] = canvas('motion', ctx.canvas.width, ctx.canvas.height);
      ag.clearRect(0, 0, acc.width, acc.height);
      ag.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
      const shutter = blur.amount * 0.08;
      for (let i = 0; i < MOTION_SAMPLES; i++) {
        const st = Math.max(0, lt - (shutter * i) / (MOTION_SAMPLES - 1));
        drawClip(ag, project, clip, st, i === 0 ? opts : { ...opts, layouts: undefined }, useFilter, { alpha: 1 / MOTION_SAMPLES, blend: 'lighter' });
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (useFilter) ctx.filter = 'none';
      ctx.globalCompositeOperation = clip.blend;
      ctx.drawImage(acc, 0, 0);
      ctx.restore();
    }
  }
}

const MOTION_SAMPLES = 16;

function drawClip(ctx: Ctx, project: Project, clip: Clip, lt: number, opts: RenderOptions, useFilter: boolean, pass?: { alpha: number; blend: GlobalCompositeOperation }) {
  const W = project.width;
  const H = project.height;
  const unit = H / 1080;

  // Resolve the drawable and its natural size at scale 1.
  let src: CanvasImageSource | null = null;
  let w = 0;
  let h = 0;
  let text: ReturnType<typeof measureText> | null = null;
  if (clip.type === 'video') {
    const v = opts.video(clip);
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    src = v;
    const s = Math.min(W / v.videoWidth, H / v.videoHeight);
    w = v.videoWidth * s;
    h = v.videoHeight * s;
  } else if (clip.type === 'image') {
    const img = clip.assetId ? opts.image(clip.assetId) : null;
    if (!img) return;
    src = img;
    const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    w = img.naturalWidth * s;
    h = img.naturalHeight * s;
  } else if (clip.type === 'text' && clip.text) {
    text = measureText(ctx, clip, H);
    w = text.w;
    h = text.h;
  } else if (clip.type === 'shape' && clip.shape) {
    w = clip.shape.width * W;
    h = clip.shape.height * H;
  } else return;

  const x = propAt(clip, 'x', lt);
  const y = propAt(clip, 'y', lt);
  const scale = propAt(clip, 'scale', lt);
  const rotation = propAt(clip, 'rotation', lt);
  const opacity = clamp01(propAt(clip, 'opacity', lt));

  opts.layouts?.set(clip.id, { cx: W / 2 + x * W, cy: H / 2 + y * H, w: w * scale, h: h * scale, rotation });

  const m: Mod = { alpha: 1, dx: 0, dy: 0, scale: 1, sx: 1, sy: 1, rot: 0, wipe: 1, wipeMode: 'l', blur: 0, hue: 0 };
  if (clip.animIn.type !== 'none' && clip.animIn.duration > 0) {
    const p = clamp01(lt / clip.animIn.duration);
    applyAnim(m, clip.animIn.type, 1 - easeOut(p), 1, p);
  }
  if (clip.animOut.type !== 'none' && clip.animOut.duration > 0) {
    const p = clamp01((clip.duration - lt) / clip.animOut.duration);
    applyAnim(m, clip.animOut.type, 1 - easeOut(p), -1, p);
  }
  const effects = clip.effects ?? [];
  if (effects.length) applyMotionEffects(m, effects, lt);
  const alpha = opacity * m.alpha;
  if (alpha <= 0.001) return;

  const content = (c: Ctx) => {
    if (src) c.drawImage(src, -w / 2, -h / 2, w, h);
    else if (text) drawText(c, clip, H, lt, text);
    else if (clip.shape) drawShape(c, clip.shape, w, h, lt, unit);
  };

  // Pixel effects and chroma key need the clip on its own surface.
  let staged: HTMLCanvasElement | null = null;
  const needsStage = (clip.chroma.enabled && !!src) || effects.some((e) => e.amount > 0 && PIXEL_EFFECTS.has(e.type));
  if (needsStage) {
    // Text needs room around its box for glow/shadow, so pad the surface.
    const pad = text ? Math.max(text.px * 0.6, ((clip.text!.glow || 0) + (clip.text!.shadow || 0)) * unit * 2) : 0;
    const k = Math.min(opts.scale * Math.max(0.25, Math.abs(scale)), 1600 / Math.max(w + pad * 2, h + pad * 2));
    const sw = Math.max(2, Math.round((w + pad * 2) * k));
    const sh = Math.max(2, Math.round((h + pad * 2) * k));
    const [stage, sg] = canvas('stage', sw, sh, clip.chroma.enabled);
    sg.clearRect(0, 0, sw, sh);
    sg.save();
    sg.translate(sw / 2, sh / 2);
    sg.scale(k, k);
    content(sg);
    sg.restore();
    applyPixelEffects(stage, sg, clip, lt);
    staged = stage;
    w += pad * 2;
    h += pad * 2;
  }

  ctx.save();
  ctx.translate(W / 2 + (x + m.dx) * W, H / 2 + (y + m.dy) * H);
  ctx.rotate(((rotation + m.rot) * Math.PI) / 180);
  const s = scale * m.scale;
  ctx.scale(s * m.sx * (clip.transform.flipH ? -1 : 1) || 1e-4, s * m.sy * (clip.transform.flipV ? -1 : 1) || 1e-4);
  ctx.globalAlpha = alpha * (pass?.alpha ?? 1);
  ctx.globalCompositeOperation = pass?.blend ?? clip.blend;
  if (m.wipe < 1) {
    const f = m.wipe;
    ctx.beginPath();
    if (m.wipeMode === 'iris') ctx.arc(0, 0, (Math.hypot(w, h) / 2) * f, 0, TAU);
    else if (m.wipeMode === 'r') ctx.rect(w / 2 - w * f, -h / 2, w * f, h);
    else if (m.wipeMode === 'u') ctx.rect(-w / 2, h / 2 - h * f, w, h * f);
    else if (m.wipeMode === 'd') ctx.rect(-w / 2, -h / 2, w, h * f);
    else ctx.rect(-w / 2, -h / 2, w * f, h);
    ctx.clip();
  }
  if (useFilter) ctx.filter = filterString(clip, m, (opts.scale * H) / 1080);

  if (staged) ctx.drawImage(staged, -w / 2, -h / 2, w, h);
  else content(ctx);

  // Overlays that sit on top of the clip.
  if (useFilter) ctx.filter = 'none';
  // Inside a motion-blur pass the overlays are skipped: they would break the additive average.
  if (pass) {
    ctx.restore();
    return;
  }
  ctx.globalCompositeOperation = 'source-over';
  const boxed = !!src || (!!clip.shape && !text);
  if (clip.filters.vignette > 0 && boxed) {
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(0, 0, r * (1 - clip.filters.vignette * 0.75), 0, 0, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.5 + clip.filters.vignette * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  for (const e of effects) {
    if (e.amount <= 0 || !boxed) continue;
    if (e.type === 'flash') {
      ctx.globalAlpha = alpha * e.amount * Math.max(0, 1 - (lt % 1) * 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else if (e.type === 'grain') {
      ctx.globalAlpha = alpha * e.amount * 0.35;
      drawShape(ctx, { kind: 'grain', fill: '#fff', width: 1, height: 1, radius: 0 }, w, h, lt, unit);
    } else if (e.type === 'scanlines') {
      ctx.globalAlpha = alpha * e.amount * 0.45;
      drawShape(ctx, { kind: 'scanlines', fill: '#000000', width: 1, height: 1, radius: 0 }, w, h, lt, unit);
    }
  }
  ctx.restore();
}

/** Audio gain of a clip at local time, including fades. */
export function clipGain(clip: Clip, lt: number): number {
  let g = clip.volume;
  if (clip.fadeIn > 0) g *= clamp01(lt / clip.fadeIn);
  if (clip.fadeOut > 0) g *= clamp01((clip.duration - lt) / clip.fadeOut);
  return g;
}
