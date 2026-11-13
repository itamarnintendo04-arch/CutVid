import type { AnimationType, Clip, Project } from '../types';
import { isVisual } from '../types';
import { propAt } from './keyframes';

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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Mod {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  wipe: number; // visible fraction
  blur: number;
}

function applyAnim(m: Mod, type: AnimationType, a: number, dir: 1 | -1) {
  // a: 0 = at rest, 1 = fully "away". dir: 1 for intro, -1 for outro.
  if (a <= 0) return;
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
      m.wipe *= 1 - a;
      break;
    case 'blur':
      m.blur += a * 40;
      m.alpha *= 1 - a;
      break;
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

function filterString(clip: Clip, extraBlur: number, pxScale: number): string {
  const f = clip.filters;
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia})`);
  if (f.invert > 0) parts.push(`invert(${f.invert})`);
  const blur = (f.blur + extraBlur) * pxScale;
  if (blur > 0.05) parts.push(`blur(${blur.toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

// ---- chroma key ---------------------------------------------------------------------------
let keyCanvas: HTMLCanvasElement | null = null;

function chromaKeyed(src: CanvasImageSource, sw: number, sh: number, clip: Clip): HTMLCanvasElement | null {
  keyCanvas ??= document.createElement('canvas');
  const s = Math.min(1, 960 / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s));
  const h = Math.max(1, Math.round(sh * s));
  if (keyCanvas.width !== w) keyCanvas.width = w;
  if (keyCanvas.height !== h) keyCanvas.height = h;
  const k = keyCanvas.getContext('2d', { willReadFrequently: true })!;
  k.clearRect(0, 0, w, h);
  k.drawImage(src, 0, 0, w, h);
  let img: ImageData;
  try {
    img = k.getImageData(0, 0, w, h);
  } catch {
    return null;
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
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const cb = -0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b;
    const dist = Math.hypot(cb - kcb, cr - kcr);
    if (dist < sim) d[i + 3] = 0;
    else if (dist < sim + smooth) d[i + 3] = (d[i + 3] * (dist - sim)) / smooth;
  }
  k.putImageData(img, 0, 0);
  return keyCanvas;
}

// ---- text ---------------------------------------------------------------------------------
function textFont(clip: Clip, H: number): string {
  const t = clip.text!;
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${Math.max(4, (t.size * H) / 1080)}px ${t.font}`;
}

function measureText(ctx: CanvasRenderingContext2D, clip: Clip, H: number) {
  const t = clip.text!;
  ctx.font = textFont(clip, H);
  const lines = t.content.split('\n');
  const px = (t.size * H) / 1080;
  const lh = px * t.lineHeight;
  let maxW = 1;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l || ' ').width);
  const pad = t.background ? px * 0.3 : 0;
  return { lines, lh, px, pad, w: maxW + pad * 2, h: lines.length * lh + pad * 2, textW: maxW };
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip, H: number, localT: number, m: ReturnType<typeof measureText>) {
  const t = clip.text!;
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
    if (t.shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = (t.shadow * H) / 1080;
      ctx.shadowOffsetY = (t.shadow * H) / 1080 / 3;
    }
    if (t.strokeWidth > 0) {
      ctx.strokeStyle = t.stroke;
      ctx.lineWidth = (t.strokeWidth * H) / 1080;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- compositor ---------------------------------------------------------------------------
/** Composite one frame of the project at time t. The same code drives preview and export. */
export function drawFrame(ctx: CanvasRenderingContext2D, project: Project, t: number, opts: RenderOptions) {
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
      drawClip(ctx, project, clip, lt, opts, useFilter);
    }
  }
}

function drawClip(ctx: CanvasRenderingContext2D, project: Project, clip: Clip, lt: number, opts: RenderOptions, useFilter: boolean) {
  const W = project.width;
  const H = project.height;

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

  const m: Mod = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, wipe: 1, blur: 0 };
  if (clip.animIn.type !== 'none' && clip.animIn.duration > 0) {
    applyAnim(m, clip.animIn.type, 1 - easeOut(clamp01(lt / clip.animIn.duration)), 1);
  }
  if (clip.animOut.type !== 'none' && clip.animOut.duration > 0) {
    applyAnim(m, clip.animOut.type, 1 - easeOut(clamp01((clip.duration - lt) / clip.animOut.duration)), -1);
  }
  const alpha = opacity * m.alpha;
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.translate(W / 2 + (x + m.dx) * W, H / 2 + (y + m.dy) * H);
  ctx.rotate(((rotation + m.rot) * Math.PI) / 180);
  const s = scale * m.scale;
  ctx.scale(s * (clip.transform.flipH ? -1 : 1), s * (clip.transform.flipV ? -1 : 1));
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = clip.blend;
  if (m.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w * m.wipe, h);
    ctx.clip();
  }
  if (useFilter) ctx.filter = filterString(clip, m.blur, (opts.scale * H) / 1080);

  if (src) {
    let drawable: CanvasImageSource = src;
    if (clip.chroma.enabled) {
      const sw = clip.type === 'video' ? (src as HTMLVideoElement).videoWidth : (src as HTMLImageElement).naturalWidth;
      const sh = clip.type === 'video' ? (src as HTMLVideoElement).videoHeight : (src as HTMLImageElement).naturalHeight;
      drawable = chromaKeyed(src, sw, sh, clip) ?? src;
    }
    ctx.drawImage(drawable, -w / 2, -h / 2, w, h);
  } else if (text) {
    drawText(ctx, clip, H, lt, text);
  } else if (clip.shape) {
    ctx.fillStyle = clip.shape.fill;
    if (clip.shape.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      roundRect(ctx, -w / 2, -h / 2, w, h, clip.shape.radius * Math.min(w, h));
    }
    ctx.fill();
  }

  if (clip.filters.vignette > 0 && (src || clip.shape)) {
    if (useFilter) ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(0, 0, r * (1 - clip.filters.vignette * 0.75), 0, 0, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.5 + clip.filters.vignette * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
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
