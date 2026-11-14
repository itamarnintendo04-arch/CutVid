import { useStore } from '../store';
import type { Project } from '../types';
import { projectDuration } from '../types';
import { media } from './media';
import { clipGain, drawFrame, fontEvents, type Layout } from './render';

/** Last time we asked each element to seek to — avoids re-seeking in a loop while paused. */
const requested = new WeakMap<HTMLMediaElement, number>();

function seekTo(el: HTMLMediaElement, t: number) {
  requested.set(el, t);
  try {
    el.currentTime = t;
  } catch {
    /* element not ready yet */
  }
}

/** Keep every <video>/<audio> element in step with the timeline. */
export function syncMedia(project: Project, t: number, playing: boolean) {
  for (const clip of project.clips) {
    if (clip.type !== 'video' && clip.type !== 'audio') continue;
    const lt = t - clip.start;
    const active = lt >= 0 && lt < clip.duration;
    const soon = lt < 0 && lt > -2;
    if (!active && !soon) continue;
    const el = clip.type === 'video' ? media.video(clip) : media.audio(clip);
    if (!el) continue;
    if (!active) {
      // Pre-roll: park upcoming clips on their first frame so the cut is seamless.
      if (!el.paused) el.pause();
      if (requested.get(el) !== clip.offset) seekTo(el, clip.offset);
      continue;
    }
    const track = project.tracks.find((x) => x.id === clip.trackId);
    const srcT = clip.offset + lt * clip.speed;
    const vol = track?.muted ? 0 : Math.max(0, Math.min(1, clipGain(clip, lt)));
    el.muted = vol === 0;
    el.volume = vol;
    if (playing) {
      const rate = Math.max(0.1, Math.min(8, clip.speed));
      if (el.playbackRate !== rate) el.playbackRate = rate;
      if (el.paused) {
        seekTo(el, srcT);
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - srcT) > 0.3 * Math.max(1, clip.speed)) {
        seekTo(el, srcT);
      }
    } else {
      if (!el.paused) el.pause();
      if (clip.type === 'video' && !el.seeking && Math.abs((requested.get(el) ?? -1) - srcT) > 0.005) seekTo(el, srcT);
    }
  }
}

function pauseInactive(project: Project, t: number) {
  for (const clip of project.clips) {
    if (clip.type !== 'video' && clip.type !== 'audio') continue;
    const lt = t - clip.start;
    if (lt >= 0 && lt < clip.duration) continue;
    const el = clip.type === 'video' ? media.video(clip) : media.audio(clip);
    if (el && !el.paused) el.pause();
  }
}

/** Real-time preview loop: advances the clock, syncs media elements and paints the canvas. */
class Player {
  canvas: HTMLCanvasElement | null = null;
  layouts = new Map<string, Layout>();
  /** Export takes over the media elements; the preview must not fight it. */
  suspended = false;
  private dirty = true;
  private last = 0;
  private raf = 0;

  constructor() {
    media.onFrame = () => (this.dirty = true);
    fontEvents.onLoad = () => (this.dirty = true);
    useStore.subscribe((s, prev) => {
      this.dirty = true;
      media.playing = s.playing;
      if (s.project.clips !== prev.project.clips) media.prune(new Set(s.project.clips.map((c) => c.id)));
      if (prev.playing && !s.playing) media.pauseAll();
    });
  }

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.dirty = true;
    if (canvas && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  invalidate() {
    this.dirty = true;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.suspended || !this.canvas) return;
    const st = useStore.getState();
    let t = st.time;
    if (st.playing) {
      t += dt;
      const end = projectDuration(st.project);
      if (t >= end) {
        t = end;
        st.setPlaying(false);
      }
      st.setTime(t);
    } else if (!this.dirty) return;
    this.dirty = false;

    const p = st.project;
    const stillPlaying = useStore.getState().playing;
    syncMedia(p, stillPlaying ? t : Math.min(t, Math.max(0, projectDuration(p) - 1 / p.fps)), stillPlaying);
    if (st.playing) pauseInactive(p, t);

    // Preview renders at a reduced resolution for speed; export renders at full size.
    const scale = Math.min(1, 1280 / Math.max(p.width, p.height));
    const cw = Math.round(p.width * scale);
    const ch = Math.round(p.height * scale);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    // Parked at the very end, keep showing the last frame instead of an empty canvas.
    const pEnd = projectDuration(p);
    const drawT = pEnd > 0 && t >= pEnd ? Math.max(0, pEnd - 1 / p.fps) : t;
    drawFrame(ctx, p, drawT, { scale, video: (c) => media.video(c), image: (id) => media.image(id), layouts: this.layouts });
  };
}

export const player = new Player();
