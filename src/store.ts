import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { AnimProp, Clip, Easing, EffectType, MediaAsset, Project, ShapeStyle, Track, TrackKind } from './types';
import { DEFAULT_CHROMA, DEFAULT_FILTERS, DEFAULT_TEXT, DEFAULT_TRANSFORM, clipEnd, projectDuration, uid } from './types';
import { KF_EPS, findKeyframe, propAt } from './engine/keyframes';
import { dbSet } from './lib/db';
import type { Lang } from './lib/i18n';

export function emptyProject(name = 'Untitled'): Project {
  return {
    id: uid(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    assets: [],
    tracks: [
      { id: uid(), kind: 'video', name: 'V1', muted: false, hidden: false, locked: false },
      { id: uid(), kind: 'audio', name: 'A1', muted: false, hidden: false, locked: false },
    ],
    clips: [],
    updatedAt: Date.now(),
  };
}

export function baseClip(partial: Partial<Clip> & Pick<Clip, 'type' | 'trackId' | 'start' | 'duration' | 'name'>): Clip {
  return {
    id: uid(),
    offset: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    filters: { ...DEFAULT_FILTERS },
    chroma: { ...DEFAULT_CHROMA },
    blend: 'source-over',
    animIn: { type: 'none', duration: 0.5 },
    animOut: { type: 'none', duration: 0.5 },
    keyframes: {},
    effects: [],
    ...partial,
  };
}

/** Fill in fields added after a project was saved, so old projects keep opening. */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    clips: p.clips.map((c) => ({
      ...c,
      effects: c.effects ?? [],
      text: c.text ? { ...DEFAULT_TEXT, ...c.text } : undefined,
    })),
  };
}

export type PanelTab = 'media' | 'text' | 'elements' | 'overlays' | 'effects' | 'transitions' | 'filters' | 'keyframes' | 'ai' | 'settings';

const overlaps = (clips: Clip[], trackId: string, start: number, end: number, ignore?: string) =>
  clips.some((c) => c.trackId === trackId && c.id !== ignore && c.start < end - 1e-6 && clipEnd(c) > start + 1e-6);

/** Push `clip` right until it no longer overlaps anything on its track. */
export function resolveOverlap(p: Draft<Project> | Project, clip: Clip) {
  const others = p.clips.filter((c) => c.trackId === clip.trackId && c.id !== clip.id).sort((a, b) => a.start - b.start);
  for (const o of others) {
    if (o.start < clipEnd(clip) - 1e-6 && clipEnd(o) > clip.start + 1e-6) clip.start = clipEnd(o);
  }
}

export function addTrackTo(p: Draft<Project>, kind: TrackKind): Track {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1;
  const track: Track = { id: uid(), kind, name: (kind === 'video' ? 'V' : 'A') + n, muted: false, hidden: false, locked: false };
  if (kind === 'video') p.tracks.unshift(track);
  else p.tracks.push(track);
  return track;
}

/** Lowest free track of a kind for the interval, creating one if all are busy. */
export function freeTrack(p: Draft<Project>, kind: TrackKind, start: number, end: number, preferTop = false): string {
  let tracks = p.tracks.filter((t) => t.kind === kind && !t.locked);
  // Video layers stack upward: index 0 is the top, so search bottom-up unless an overlay is wanted.
  if (kind === 'video' && !preferTop) tracks = tracks.reverse();
  const free = tracks.find((t) => !overlaps(p.clips, t.id, start, end));
  return (free ?? addTrackTo(p, kind)).id;
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  time: number;
  playing: boolean;
  selection: string[];
  zoom: number; // timeline pixels per second
  lang: Lang;
  busy: string | null;
  screen: 'home' | 'editor';
  panelTab: PanelTab;

  mutate: (fn: (p: Draft<Project>) => void, record?: boolean) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  setTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  select: (ids: string[]) => void;
  setZoom: (z: number) => void;
  setLang: (l: Lang) => void;
  setBusy: (b: string | null) => void;
  loadProject: (p: Project) => void;
  setScreen: (s: 'home' | 'editor') => void;
  setPanelTab: (t: PanelTab) => void;

  addAsset: (a: MediaAsset) => void;
  removeAsset: (id: string) => void;
  addClipFromAsset: (assetId: string) => void;
  addText: (content: string) => void;
  addShape: (shape: Partial<ShapeStyle> & Pick<ShapeStyle, 'kind'>, extra?: Partial<Clip>) => void;
  setEffect: (id: string, type: EffectType, amount: number, record?: boolean) => void;
  setEasing: (id: string, ease: Easing, onlyCurrent: boolean) => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  splitAtPlayhead: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  updateClip: (id: string, fn: (c: Draft<Clip>) => void, record?: boolean) => void;
  setProp: (id: string, prop: AnimProp, value: number, record?: boolean) => void;
  toggleKeyframe: (id: string, prop: AnimProp) => void;
  setSpeed: (id: string, speed: number) => void;
}

const HISTORY = 100;

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  past: [],
  future: [],
  time: 0,
  playing: false,
  selection: [],
  zoom: 80,
  // English by default; the language button in the top bar switches to Hebrew.
  lang: localStorage.getItem('cutvid:lang') === 'he' ? 'he' : 'en',
  busy: null,
  screen: 'home',
  panelTab: 'media',

  mutate: (fn, record = true) =>
    set((s) => {
      const next = produce(s.project, (d) => {
        fn(d);
        d.updatedAt = Date.now();
      });
      if (next === s.project) return s;
      return record ? { project: next, past: [...s.past.slice(-HISTORY), s.project], future: [] } : { project: next };
    }),
  snapshot: () => set((s) => ({ past: [...s.past.slice(-HISTORY), s.project], future: [] })),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], selection: [] };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return s;
      return { project: next, past: [...s.past, s.project], future: s.future.slice(1), selection: [] };
    }),
  setTime: (t) => set({ time: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  select: (selection) => set({ selection }),
  setZoom: (z) => set({ zoom: Math.max(4, Math.min(600, z)) }),
  setLang: (lang) => {
    localStorage.setItem('cutvid:lang', lang);
    set({ lang });
  },
  setBusy: (busy) => set({ busy }),
  loadProject: (project) => set({ project: normalizeProject(project), past: [], future: [], time: 0, playing: false, selection: [] }),
  setScreen: (screen) => set({ screen, playing: false }),
  setPanelTab: (panelTab) => set({ panelTab }),

  addAsset: (a) => get().mutate((p) => void p.assets.push(a)),
  removeAsset: (id) =>
    get().mutate((p) => {
      p.assets = p.assets.filter((a) => a.id !== id);
      p.clips = p.clips.filter((c) => c.assetId !== id);
    }),

  addClipFromAsset: (assetId) => {
    const { project, time } = get();
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const duration = asset.kind === 'image' ? 5 : Math.max(0.1, asset.duration);
    let id = '';
    get().mutate((p) => {
      const kind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video';
      const clip = baseClip({ type: asset.kind, assetId, name: asset.name, trackId: freeTrack(p, kind, time, time + duration), start: time, duration });
      id = clip.id;
      p.clips.push(clip);
    });
    // Advance the playhead so repeated adds build a sequence instead of a stack.
    set({ selection: [id], time: time + duration });
  },

  addText: (content) => {
    const { time } = get();
    let id = '';
    get().mutate((p) => {
      const clip = baseClip({ type: 'text', name: content, trackId: freeTrack(p, 'video', time, time + 3, true), start: time, duration: 3, text: { ...DEFAULT_TEXT, content } });
      id = clip.id;
      p.clips.push(clip);
    });
    set({ selection: [id] });
  },

  addShape: (shape, extra) => {
    const { time } = get();
    let id = '';
    get().mutate((p) => {
      const full = shape.width === undefined;
      // Keep round-ish shapes square on any frame.
      const square = ['ellipse', 'star', 'heart', 'diamond', 'hexagon', 'ring', 'triangle'].includes(shape.kind);
      const clip = baseClip({
        type: 'shape',
        name: shape.kind,
        trackId: freeTrack(p, 'video', time, time + 3, true),
        start: time,
        duration: 3,
        ...extra,
        shape: { fill: '#7c5cff', width: 0.3, height: full && square ? (0.3 * p.width) / p.height : 0.3, radius: 0.08, ...shape },
      });
      id = clip.id;
      p.clips.push(clip);
    });
    set({ selection: [id] });
  },

  setEffect: (id, type, amount, record = true) =>
    get().updateClip(
      id,
      (c) => {
        const list = (c.effects ??= []);
        const i = list.findIndex((e) => e.type === type);
        if (amount <= 0) {
          if (i >= 0) list.splice(i, 1);
        } else if (i >= 0) list[i].amount = amount;
        else list.push({ type, amount });
      },
      record,
    ),

  // Apply a curve to every keyframe of the clip, or only to the segment under the playhead.
  setEasing: (id, ease, onlyCurrent) => {
    const { time } = get();
    get().updateClip(id, (c) => {
      const lt = time - c.start;
      for (const kfs of Object.values(c.keyframes)) {
        if (!kfs) continue;
        kfs.forEach((k, i) => {
          const next = kfs[i + 1];
          if (!onlyCurrent || (lt >= k.t - KF_EPS && (!next || lt < next.t))) k.ease = ease;
        });
      }
    });
  },

  addTrack: (kind) => get().mutate((p) => void addTrackTo(p, kind)),
  removeTrack: (id) =>
    get().mutate((p) => {
      const t = p.tracks.find((x) => x.id === id);
      if (!t || p.tracks.filter((x) => x.kind === t.kind).length <= 1) return;
      p.tracks = p.tracks.filter((x) => x.id !== id);
      p.clips = p.clips.filter((c) => c.trackId !== id);
    }),

  splitAtPlayhead: () => {
    const { time, selection } = get();
    get().mutate((p) => {
      const under = p.clips.filter((c) => time > c.start + 0.03 && time < clipEnd(c) - 0.03);
      const chosen = under.filter((c) => selection.includes(c.id));
      for (const c of chosen.length ? chosen : under) {
        const cut = time - c.start;
        const right: Clip = JSON.parse(JSON.stringify(c));
        right.id = uid();
        right.start = time;
        right.duration = c.duration - cut;
        right.offset = c.offset + cut * c.speed;
        right.animIn = { ...c.animIn, type: 'none' };
        right.fadeIn = 0;
        // Keyframes keep their absolute timing: shift them into the new clip's local time.
        for (const k of Object.values(right.keyframes)) k?.forEach((kf) => (kf.t -= cut));
        c.duration = cut;
        c.animOut.type = 'none';
        c.fadeOut = 0;
        p.clips.push(right);
      }
    });
  },

  deleteSelection: () => {
    const { selection } = get();
    if (!selection.length) return;
    get().mutate((p) => void (p.clips = p.clips.filter((c) => !selection.includes(c.id))));
    set({ selection: [] });
  },

  duplicateSelection: () => {
    const { selection } = get();
    const ids: string[] = [];
    get().mutate((p) => {
      for (const c of p.clips.filter((x) => selection.includes(x.id))) {
        const copy: Clip = JSON.parse(JSON.stringify(c));
        copy.id = uid();
        copy.start = clipEnd(c);
        resolveOverlap(p, copy);
        p.clips.push(copy);
        ids.push(copy.id);
      }
    });
    if (ids.length) set({ selection: ids });
  },

  updateClip: (id, fn, record = true) =>
    get().mutate((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (c) fn(c);
    }, record),

  // Keyframe-aware setter: when the property is animated, edit/add the keyframe under the playhead.
  setProp: (id, prop, value, record = true) => {
    const { time } = get();
    get().updateClip(
      id,
      (c) => {
        const kfs = c.keyframes[prop];
        if (kfs && kfs.length) {
          const lt = Math.max(0, Math.min(c.duration, time - c.start));
          const i = kfs.findIndex((k) => Math.abs(k.t - lt) < KF_EPS);
          if (i >= 0) kfs[i].v = value;
          else {
            kfs.push({ t: lt, v: value, ease: 'easeInOut' });
            kfs.sort((a, b) => a.t - b.t);
          }
        } else c.transform[prop] = value;
      },
      record,
    );
  },

  toggleKeyframe: (id, prop) => {
    const { time } = get();
    get().updateClip(id, (c) => {
      const lt = Math.max(0, Math.min(c.duration, time - c.start));
      const i = findKeyframe(c as Clip, prop, lt);
      const kfs = (c.keyframes[prop] ??= []);
      if (i >= 0) {
        const [removed] = kfs.splice(i, 1);
        if (!kfs.length) {
          delete c.keyframes[prop];
          c.transform[prop] = removed.v;
        }
      } else {
        kfs.push({ t: lt, v: propAt(c as Clip, prop, lt), ease: 'easeInOut' });
        kfs.sort((a, b) => a.t - b.t);
      }
    });
  },

  setSpeed: (id, speed) =>
    get().updateClip(id, (c) => {
      const s = Math.max(0.1, Math.min(8, speed));
      c.duration = Math.max(0.05, (c.duration * c.speed) / s);
      c.speed = s;
    }),
}));

export const selectedClip = (s: State): Clip | undefined =>
  s.selection.length === 1 ? s.project.clips.find((c) => c.id === s.selection[0]) : undefined;

export const totalDuration = (s: State) => projectDuration(s.project);

// ---- autosave -----------------------------------------------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p = useStore.getState().project;
    dbSet('projects', p.id, p).catch((e) => console.warn('autosave failed', e));
    localStorage.setItem('cutvid:last', p.id);
  }, 600);
});
