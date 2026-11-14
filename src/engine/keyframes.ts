import type { AnimProp, Clip, Easing, Keyframe } from '../types';

type Fn = (t: number) => number;

const bounceOut: Fn = (t) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const c4 = (2 * Math.PI) / 3;
const pow = Math.pow;

/** Ready-made curves. The key is what is stored on a keyframe. */
export const EASINGS: Record<string, Fn> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  quartIn: (t) => t * t * t * t,
  quartOut: (t) => 1 - pow(1 - t, 4),
  quartInOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
  expoIn: (t) => (t === 0 ? 0 : pow(2, 10 * t - 10)),
  expoOut: (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
  expoInOut: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
  circOut: (t) => Math.sqrt(1 - pow(t - 1, 2)),
  backIn: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  backOut: (t) => 1 + 2.70158 * pow(t - 1, 3) + 1.70158 * pow(t - 1, 2),
  backInOut: (t) => {
    const k = 1.70158 * 1.525;
    return t < 0.5 ? (pow(2 * t, 2) * ((k + 1) * 2 * t - k)) / 2 : (pow(2 * t - 2, 2) * ((k + 1) * (t * 2 - 2) + k) + 2) / 2;
  },
  elasticOut: (t) => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  elasticIn: (t) => (t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4)),
  bounceOut,
  bounceIn: (t) => 1 - bounceOut(1 - t),
  steps4: (t) => Math.floor(t * 4) / 4,
  hold: () => 0,
};

/** y(x) of a CSS-style cubic-bezier, solved with Newton's method plus bisection fallback. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Fn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (x > v) lo = t;
      else hi = t;
      t = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-6) break;
    }
    return sy(t);
  };
}

const bezierCache = new Map<string, Fn>();

export function easeFn(e: Easing | undefined): Fn {
  if (Array.isArray(e)) {
    const key = e.join(',');
    let fn = bezierCache.get(key);
    if (!fn) bezierCache.set(key, (fn = bezier(e[0], e[1], e[2], e[3])));
    return fn;
  }
  return (e && EASINGS[e]) || EASINGS.easeInOut;
}

export function evalKeyframes(kfs: Keyframe[], t: number): number {
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1e-6;
      return a.v + (b.v - a.v) * easeFn(a.ease)((t - a.t) / span);
    }
  }
  return last.v;
}

/** Value of an animatable property at clip-local time. */
export function propAt(clip: Clip, prop: AnimProp, localT: number): number {
  const kfs = clip.keyframes[prop];
  if (kfs && kfs.length) return evalKeyframes(kfs, localT);
  return clip.transform[prop];
}

export const KF_EPS = 0.02;

export function findKeyframe(clip: Clip, prop: AnimProp, localT: number): number {
  const kfs = clip.keyframes[prop];
  if (!kfs) return -1;
  return kfs.findIndex((k) => Math.abs(k.t - localT) < KF_EPS);
}
