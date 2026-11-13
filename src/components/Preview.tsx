import { useEffect, useRef } from 'react';
import { ChevronFirst, ChevronLast, Maximize, Pause, Play, RotateCw, SkipBack, SkipForward } from 'lucide-react';
import { useStore, totalDuration } from '../store';
import { player } from '../engine/player';
import { propAt } from '../engine/keyframes';
import { formatTime } from '../lib/i18n';
import { isVisual } from '../types';

export function togglePlay() {
  const st = useStore.getState();
  if (!st.playing && st.time >= totalDuration(st) - 0.01) st.setTime(0);
  st.setPlaying(!st.playing);
}

type Drag =
  | { mode: 'move'; id: string; sx: number; sy: number; x0: number; y0: number; moved: boolean }
  | { mode: 'scale'; id: string; cx: number; cy: number; d0: number; s0: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number; a0: number; r0: number };

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const width = useStore((s) => s.project.width);
  const height = useStore((s) => s.project.height);
  const fps = useStore((s) => s.project.fps);
  const playing = useStore((s) => s.playing);
  const time = useStore((s) => s.time);
  const duration = useStore(totalDuration);

  useEffect(() => {
    player.attach(canvasRef.current);
    return () => player.attach(null);
  }, []);

  // The selection box follows the renderer's layout every frame without re-rendering React.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const box = boxRef.current;
      const canvas = canvasRef.current;
      if (!box || !canvas) return;
      const st = useStore.getState();
      const id = st.selection.length === 1 ? st.selection[0] : null;
      const l = id ? player.layouts.get(id) : null;
      if (!l || st.playing) {
        box.style.display = 'none';
        return;
      }
      const k = canvas.clientWidth / st.project.width;
      box.style.display = 'block';
      box.style.width = `${Math.abs(l.w) * k}px`;
      box.style.height = `${Math.abs(l.h) * k}px`;
      box.style.transform = `translate(${l.cx * k}px, ${l.cy * k}px) translate(-50%, -50%) rotate(${l.rotation}deg)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Pointer position in project pixels. */
  const toProject = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  const hitTest = (px: number, py: number): string | null => {
    const st = useStore.getState();
    for (const track of st.project.tracks) {
      if (track.kind !== 'video' || track.hidden || track.locked) continue;
      for (const c of st.project.clips) {
        if (c.trackId !== track.id || !isVisual(c.type)) continue;
        const l = player.layouts.get(c.id);
        if (!l || st.time < c.start || st.time >= c.start + c.duration) continue;
        const a = (-l.rotation * Math.PI) / 180;
        const dx = px - l.cx;
        const dy = py - l.cy;
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(rx) <= Math.abs(l.w) / 2 && Math.abs(ry) <= Math.abs(l.h) / 2) return c.id;
      }
    }
    return null;
  };

  const localProp = (id: string, prop: 'x' | 'y' | 'scale' | 'rotation') => {
    const st = useStore.getState();
    const c = st.project.clips.find((x) => x.id === id)!;
    return propAt(c, prop, Math.max(0, Math.min(c.duration, st.time - c.start)));
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    if (st.playing) return;
    const p = toProject(e);
    const id = hitTest(p.x, p.y);
    if (!id) return st.select([]);
    st.select([id]);
    drag.current = { mode: 'move', id, sx: p.x, sy: p.y, x0: localProp(id, 'x'), y0: localProp(id, 'y'), moved: false };
    stageRef.current!.setPointerCapture(e.pointerId);
  };

  const onHandleDown = (mode: 'scale' | 'rotate') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const st = useStore.getState();
    const id = st.selection[0];
    const l = id && player.layouts.get(id);
    if (!l) return;
    const p = toProject(e);
    st.snapshot();
    if (mode === 'scale') drag.current = { mode, id, cx: l.cx, cy: l.cy, d0: Math.hypot(p.x - l.cx, p.y - l.cy) || 1, s0: localProp(id, 'scale') };
    else drag.current = { mode, id, cx: l.cx, cy: l.cy, a0: Math.atan2(p.y - l.cy, p.x - l.cx), r0: localProp(id, 'rotation') };
    stageRef.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const st = useStore.getState();
    const p = toProject(e);
    if (d.mode === 'move') {
      if (!d.moved) {
        if (Math.hypot(p.x - d.sx, p.y - d.sy) < 3) return;
        d.moved = true;
        st.snapshot();
      }
      let nx = d.x0 + (p.x - d.sx) / width;
      let ny = d.y0 + (p.y - d.sy) / height;
      // Magnetic centre guides.
      if (Math.abs(nx) < 0.012) nx = 0;
      if (Math.abs(ny) < 0.012) ny = 0;
      st.setProp(d.id, 'x', nx, false);
      st.setProp(d.id, 'y', ny, false);
    } else if (d.mode === 'scale') {
      st.setProp(d.id, 'scale', Math.max(0.02, (d.s0 * Math.hypot(p.x - d.cx, p.y - d.cy)) / d.d0), false);
    } else {
      let r = d.r0 + ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      const snapped = Math.round(r / 45) * 45;
      if (Math.abs(r - snapped) < 3) r = snapped;
      st.setProp(d.id, 'rotation', r, false);
    }
  };

  const step = (frames: number) => {
    const st = useStore.getState();
    st.setPlaying(false);
    st.setTime(Math.min(totalDuration(st), Math.max(0, Math.round(st.time * fps + frames) / fps)));
  };

  return (
    <div className="preview">
      <div className="stage-wrap">
        <div
          ref={stageRef}
          dir="ltr"
          className="stage"
          style={{ aspectRatio: `${width} / ${height}`, ['--ar' as string]: width / height }}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <canvas ref={canvasRef} onPointerDown={onCanvasDown} />
          <div ref={boxRef} className="sel-box">
            <span className="handle rot" onPointerDown={onHandleDown('rotate')}>
              <RotateCw size={11} />
            </span>
            {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
              <span key={c} className={'handle ' + c} onPointerDown={onHandleDown('scale')} />
            ))}
          </div>
        </div>
      </div>
      <div className="transport" dir="ltr">
        <span className="timecode">{formatTime(time, fps)}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => useStore.getState().setTime(0)} aria-label="start">
          <SkipBack size={17} />
        </button>
        <button className="icon-btn" onClick={() => step(-1)} aria-label="previous frame">
          <ChevronFirst size={17} />
        </button>
        <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'pause' : 'play'}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button className="icon-btn" onClick={() => step(1)} aria-label="next frame">
          <ChevronLast size={17} />
        </button>
        <button className="icon-btn" onClick={() => useStore.getState().setTime(duration)} aria-label="end">
          <SkipForward size={17} />
        </button>
        <span className="spacer" />
        <span className="timecode dim">{formatTime(duration, fps)}</span>
        <button className="icon-btn" onClick={() => stageRef.current?.requestFullscreen?.()} aria-label="fullscreen">
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
}
