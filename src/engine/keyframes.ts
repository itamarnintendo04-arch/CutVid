import type { AnimProp, Clip, Easing, Keyframe } from '../types';

const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  hold: () => 0,
};

export function evalKeyframes(kfs: Keyframe[], t: number): number {
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1e-6;
      return a.v + (b.v - a.v) * EASE[a.ease]((t - a.t) / span);
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
