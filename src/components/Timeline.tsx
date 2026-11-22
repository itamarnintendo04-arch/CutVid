import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Diamond, Eye, EyeOff, Lock, Magnet, Maximize2, Music, Plus, Scissors, Trash2, Unlock, Video, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-react';
import { resolveOverlap, totalDuration, useStore } from '../store';
import { media } from '../engine/media';
import { useT } from '../lib/i18n';
import type { Clip, MediaAsset, Track } from '../types';
import { ANIM_PROPS, clipEnd } from '../types';
import { KF_EPS, findKeyframe } from '../engine/keyframes';

const LANE_H = 54;
const RULER_H = 26;

function niceStep(zoom: number): number {
  const target = 90 / zoom; // seconds between labels
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s >= target) return s;
  return 1200;
}

const label = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${Number.isInteger(sec) ? sec : sec.toFixed(2).replace(/0$/, '')}`;
};

const Waveform = memo(function Waveform({ asset, clip, zoom }: { asset: MediaAsset; clip: Clip; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    media.waveform(asset).then((p) => alive && setPeaks(p));
    return () => void (alive = false);
  }, [asset]);
  const w = Math.max(1, Math.min(4000, Math.round(clip.duration * zoom)));
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    c.width = w;
    c.height = LANE_H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, LANE_H);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const perSec = peaks.length / Math.max(asset.duration, 0.001);
    for (let x = 0; x < w; x++) {
      const srcT = clip.offset + (x / w) * clip.duration * clip.speed;
      const v = peaks[Math.floor(srcT * perSec)] ?? 0;
      const h = Math.max(1, v * (LANE_H - 14));
      g.fillRect(x, (LANE_H - h) / 2, 1, h);
    }
  }, [peaks, w, clip.offset, clip.duration, clip.speed, asset.duration]);
  return <canvas ref={ref} className="wave" />;
});

type DragState = {
  kind: 'move' | 'trimL' | 'trimR';
  startX: number;
  startY: number;
  moved: boolean;
  origin: { id: string; start: number; duration: number; offset: number; trackId: string }[];
  primary: string;
};

export function Timeline() {
  const t = useT();
  const project = useStore((s) => s.project);
  const zoom = useStore((s) => s.zoom);
  const time = useStore((s) => s.time);
  const selection = useStore((s) => s.selection);
  const playing = useStore((s) => s.playing);
  const duration = useStore(totalDuration);
  const [snap, setSnap] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [guide, setGuide] = useState<number | null>(null);

  const contentW = Math.max((duration + 30) * zoom, 2000);
  const assetsById = new Map(project.assets.map((a) => [a.id, a]));

  // Keep the playhead in view during playback.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = time * zoom;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 60);
  }, [time, zoom, playing]);

  // Ctrl/⌘ + wheel zooms around the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useStore.getState();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const at = (el.scrollLeft + px) / st.zoom;
      st.setZoom(st.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      requestAnimationFrame(() => (el.scrollLeft = at * useStore.getState().zoom - px));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / useStore.getState().zoom);
  };

  // ---- playhead scrubbing -----------------------------------------------------------------
  const scrub = (e: React.PointerEvent) => {
    const st = useStore.getState();
    st.setPlaying(false);
    st.setTime(Math.min(timeAt(e.clientX), Math.max(totalDuration(st), 0)));
  };
  const onRulerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrub(e);
  };
  const onRulerMove = (e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) scrub(e);
  };

  // ---- clip dragging ----------------------------------------------------------------------
  const snapTime = (value: number, ignore: Set<string>): number => {
    if (!snap) {
      setGuide(null);
      return value;
    }
    const st = useStore.getState();
    const points = [0, st.time];
    for (const c of st.project.clips) if (!ignore.has(c.id)) points.push(c.start, clipEnd(c));
    let best = value;
    let bestD = 8 / st.zoom;
    for (const p of points) {
      const d = Math.abs(p - value);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setGuide(best !== value ? best : null);
    return best;
  };

  const onClipDown = (clip: Clip, kind: DragState['kind']) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const st = useStore.getState();
    const track = st.project.tracks.find((x) => x.id === clip.trackId);
    let sel = st.selection;
    if (e.shiftKey || e.metaKey || e.ctrlKey) sel = sel.includes(clip.id) ? sel.filter((x) => x !== clip.id) : [...sel, clip.id];
    else if (!sel.includes(clip.id)) sel = [clip.id];
    st.select(sel);
    if (track?.locked || !sel.includes(clip.id)) return;
    const ids = kind === 'move' ? sel : [clip.id];
    drag.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      primary: clip.id,
      origin: st.project.clips.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, start: c.start, duration: c.duration, offset: c.offset, trackId: c.trackId })),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onClipMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const st = useStore.getState();
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 4 && Math.abs(e.clientY - d.startY) < 4) return;
      d.moved = true;
      st.snapshot();
    }
    const delta = (e.clientX - d.startX) / st.zoom;
    const ignore = new Set(d.origin.map((o) => o.id));
    const prim = d.origin.find((o) => o.id === d.primary)!;

    if (d.kind === 'move') {
      // Snap either edge of the primary clip, then apply the same shift to the whole selection.
      let shift = delta;
      const s1 = snapTime(prim.start + delta, ignore);
      if (s1 !== prim.start + delta) shift = s1 - prim.start;
      else {
        const e1 = snapTime(prim.start + prim.duration + delta, ignore);
        if (e1 !== prim.start + prim.duration + delta) shift = e1 - prim.start - prim.duration;
      }
      shift = Math.max(shift, -Math.min(...d.origin.map((o) => o.start)));

      // Vertical movement re-parents a single clip to a compatible lane.
      let targetTrack: string | null = null;
      if (d.origin.length === 1) {
        const r = lanes.current!.getBoundingClientRect();
        const idx = Math.floor((e.clientY - r.top) / LANE_H);
        const tr = st.project.tracks[idx];
        const cur = st.project.tracks.find((x) => x.id === prim.trackId);
        if (tr && cur && tr.kind === cur.kind && !tr.locked) targetTrack = tr.id;
      }
      st.mutate((p) => {
        for (const o of d.origin) {
          const c = p.clips.find((x) => x.id === o.id);
          if (!c) continue;
          c.start = o.start + shift;
          if (targetTrack) c.trackId = targetTrack;
        }
      }, false);
    } else if (d.kind === 'trimL') {
      st.mutate((p) => {
        const c = p.clips.find((x) => x.id === prim.id);
        if (!c) return;
        let ns = snapTime(prim.start + delta, ignore);
        const timed = c.type === 'video' || c.type === 'audio';
        const minStart = timed ? prim.start - prim.offset / c.speed : 0;
        ns = Math.max(0, minStart, Math.min(ns, prim.start + prim.duration - 0.1));
        const moved = ns - prim.start;
        const prevShift = c.start - prim.start;
        c.start = ns;
        c.duration = prim.duration - moved;
        if (timed) c.offset = prim.offset + moved * c.speed;
        // Keyframes stay glued to their absolute time.
        for (const kfs of Object.values(c.keyframes)) kfs?.forEach((k) => (k.t -= moved - prevShift));
      }, false);
    } else {
      st.mutate((p) => {
        const c = p.clips.find((x) => x.id === prim.id);
        if (!c) return;
        let end = snapTime(prim.start + prim.duration + delta, ignore);
        const asset = c.assetId ? p.assets.find((a) => a.id === c.assetId) : null;
        if (asset && (c.type === 'video' || c.type === 'audio')) end = Math.min(end, c.start + (asset.duration - c.offset) / c.speed);
        c.duration = Math.max(0.1, end - c.start);
      }, false);
    }
  };

  const onClipUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuide(null);
    if (!d?.moved || d.kind !== 'move') return;
    useStore.getState().mutate((p) => {
      for (const o of [...d.origin].sort((a, b) => a.start - b.start)) {
        const c = p.clips.find((x) => x.id === o.id);
        if (c) resolveOverlap(p, c as Clip);
      }
    }, false);
  };

  const fit = () => {
    const el = scroller.current;
    if (!el || duration <= 0) return;
    useStore.getState().setZoom((el.clientWidth - 40) / duration);
    el.scrollLeft = 0;
  };

  // ---- ruler ticks ------------------------------------------------------------------------
  const stepS = niceStep(zoom);
  const ticks: number[] = [];
  for (let s = 0; s * zoom < contentW; s += stepS) ticks.push(+s.toFixed(3));

  const st = useStore.getState();
  // The keyframe diamond works on the selected picture/text/shape clip while the playhead is over it.
  const kfClip = project.clips.find((c) => c.id === selection[0] && c.type !== 'audio');
  const kfLocal = kfClip ? time - kfClip.start : -1;
  const kfUsable = !!kfClip && kfLocal >= -KF_EPS && kfLocal <= kfClip.duration + KF_EPS;
  const kfOn = kfUsable && ANIM_PROPS.some((prop) => findKeyframe(kfClip as Clip, prop, Math.max(0, Math.min(kfClip!.duration, kfLocal))) >= 0);
  const kfAnimated = !!kfClip && ANIM_PROPS.some((prop) => kfClip.keyframes[prop]?.length);
  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button className="tool" onClick={st.splitAtPlayhead} title={`${t('split')} (S)`}>
          <Scissors size={15} /> <span>{t('split')}</span>
        </button>
        <button className="tool" onClick={st.duplicateSelection} disabled={!selection.length} title={`${t('duplicate')} (Ctrl+D)`}>
          <Copy size={15} /> <span>{t('duplicate')}</span>
        </button>
        <button className="tool" onClick={st.deleteSelection} disabled={!selection.length} title={`${t('delete')} (Del)`}>
          <Trash2 size={15} /> <span>{t('delete')}</span>
        </button>
        <button
          className={'tool kf-tool' + (kfOn ? ' on' : kfAnimated ? ' animated' : '')}
          onClick={() => kfClip && st.toggleAllKeyframes(kfClip.id)}
          disabled={!kfUsable}
          title={kfUsable ? t('keyframe') : t('selectVisualClip')}
          aria-pressed={kfOn}
        >
          <Diamond size={15} fill={kfOn ? 'currentColor' : 'none'} /> <span>{t('keyframe')}</span>
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => st.addTrack('video')} title={t('addVideoTrack')}>
          <Plus size={13} />
          <Video size={15} />
        </button>
        <button className="tool" onClick={() => st.addTrack('audio')} title={t('addAudioTrack')}>
          <Plus size={13} />
          <Music size={15} />
        </button>
        <span className="spacer" />
        <button className={'tool' + (snap ? ' active' : '')} onClick={() => setSnap(!snap)} title={t('snap')}>
          <Magnet size={15} />
        </button>
        <button className="tool" onClick={() => st.setZoom(zoom / 1.4)} aria-label="zoom out">
          <ZoomOut size={15} />
        </button>
        <input className="zoom" type="range" min={Math.log(4)} max={Math.log(600)} step={0.01} value={Math.log(zoom)} onChange={(e) => st.setZoom(Math.exp(+e.target.value))} aria-label="zoom" />
        <button className="tool" onClick={() => st.setZoom(zoom * 1.4)} aria-label="zoom in">
          <ZoomIn size={15} />
        </button>
        <button className="tool" onClick={fit} title={t('fit')}>
          <Maximize2 size={15} />
        </button>
      </div>

      <div className="tl-body" dir="ltr">
        <div className="tl-heads" style={{ paddingTop: RULER_H }}>
          {project.tracks.map((tr) => (
            <TrackHead key={tr.id} track={tr} canRemove={project.tracks.filter((x) => x.kind === tr.kind).length > 1} />
          ))}
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-content" style={{ width: contentW }}>
            <div className="ruler" style={{ height: RULER_H }} onPointerDown={onRulerDown} onPointerMove={onRulerMove}>
              {ticks.map((s) => (
                <span key={s} className="tick" style={{ left: s * zoom }}>
                  {label(s)}
                </span>
              ))}
            </div>
            <div className="lanes" ref={lanes} onPointerDown={(e) => e.target === e.currentTarget && st.select([])}>
              {project.tracks.map((tr) => (
                <div
                  key={tr.id}
                  className={`lane ${tr.kind}${tr.locked ? ' locked' : ''}${tr.hidden ? ' hidden' : ''}`}
                  style={{ height: LANE_H }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    st.select([]);
                    if (e.pointerType === 'mouse') scrub(e);
                  }}
                >
                  {project.clips
                    .filter((c) => c.trackId === tr.id)
                    .map((c) => {
                      const asset = c.assetId ? assetsById.get(c.assetId) : undefined;
                      const selected = selection.includes(c.id);
                      const w = Math.max(4, c.duration * zoom);
                      return (
                        <div
                          key={c.id}
                          className={`clip ${c.type}${selected ? ' selected' : ''}`}
                          style={{
                            left: c.start * zoom,
                            width: w,
                            backgroundImage: asset?.thumb && c.type !== 'audio' ? `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)),url(${asset.thumb})` : undefined,
                          }}
                          onPointerDown={onClipDown(c, 'move')}
                          onPointerMove={onClipMove}
                          onPointerUp={onClipUp}
                          onPointerCancel={onClipUp}
                        >
                          {c.type === 'audio' && asset && <Waveform asset={asset} clip={c} zoom={zoom} />}
                          <span className="clip-name">
                            {c.speed !== 1 && <b>{c.speed.toFixed(2)}× </b>}
                            {c.name}
                          </span>
                          {selected &&
                            Object.values(c.keyframes).flatMap((kfs, i) =>
                              (kfs ?? []).filter((k) => k.t >= 0 && k.t <= c.duration).map((k) => <i key={`${i}-${k.t}`} className="kf" style={{ left: k.t * zoom }} />),
                            )}
                          {w > 18 && (
                            <>
                              <span className="trim l" onPointerDown={onClipDown(c, 'trimL')} onPointerMove={onClipMove} onPointerUp={onClipUp} onPointerCancel={onClipUp} />
                              <span className="trim r" onPointerDown={onClipDown(c, 'trimR')} onPointerMove={onClipMove} onPointerUp={onClipUp} onPointerCancel={onClipUp} />
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
              {guide !== null && <div className="snap-guide" style={{ left: guide * zoom }} />}
            </div>
            <div className="playhead" style={{ transform: `translateX(${time * zoom}px)` }}>
              <span className="playhead-grip" onPointerDown={onRulerDown} onPointerMove={onRulerMove} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackHead({ track, canRemove }: { track: Track; canRemove: boolean }) {
  const t = useT();
  const mutate = useStore((s) => s.mutate);
  const removeTrack = useStore((s) => s.removeTrack);
  const set = (fn: (tr: Track) => void) => mutate((p) => void fn(p.tracks.find((x) => x.id === track.id)!));
  return (
    <div className="tl-head" style={{ height: LANE_H }}>
      <b>{track.name}</b>
      <div className="tl-head-btns">
        {track.kind === 'video' && (
          <button className={'icon-btn small' + (track.hidden ? ' on' : '')} onClick={() => set((x) => void (x.hidden = !x.hidden))} title={t('hide')} aria-label={t('hide')}>
            {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button className={'icon-btn small' + (track.muted ? ' on' : '')} onClick={() => set((x) => void (x.muted = !x.muted))} title={t('mute')} aria-label={t('mute')}>
          {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <button className={'icon-btn small' + (track.locked ? ' on' : '')} onClick={() => set((x) => void (x.locked = !x.locked))} title={t('lock')} aria-label={t('lock')}>
          {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        {canRemove && (
          <button className="icon-btn small" onClick={() => removeTrack(track.id)} title={t('removeTrack')} aria-label={t('removeTrack')}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
