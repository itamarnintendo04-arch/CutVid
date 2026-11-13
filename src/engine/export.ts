import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { Clip, Project } from '../types';
import { projectDuration } from '../types';
import { media } from './media';
import { player } from './player';
import { drawFrame } from './render';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface ExportResult {
  blob: Blob;
  ext: string;
  hasAudio: boolean;
}

export const exportSupported = () => typeof VideoEncoder !== 'undefined';

function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(t, (isFinite(v.duration) ? v.duration : t) - 0.001));
    if (Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2 && !v.seeking) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 3000);
    v.addEventListener('seeked', finish);
    v.currentTime = target;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('Could not load a video for export'));
    v.src = url;
  });
}

/** Offline mix of every audible clip (audio clips and the sound of video clips). */
async function mixAudio(project: Project, duration: number): Promise<AudioBuffer | null> {
  const rate = 48000;
  const jobs: { clip: Clip; buf: AudioBuffer }[] = [];
  for (const clip of project.clips) {
    if ((clip.type !== 'audio' && clip.type !== 'video') || !clip.assetId || clip.volume <= 0) continue;
    if (project.tracks.find((t) => t.id === clip.trackId)?.muted) continue;
    const buf = await media.decode(clip.assetId);
    if (buf) jobs.push({ clip, buf });
  }
  if (!jobs.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  for (const { clip, buf } of jobs) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clip.speed;
    const gain = ctx.createGain();
    const end = clip.start + clip.duration;
    const g = gain.gain;
    if (clip.fadeIn > 0) {
      g.setValueAtTime(0, clip.start);
      g.linearRampToValueAtTime(clip.volume, Math.min(end, clip.start + clip.fadeIn));
    } else g.setValueAtTime(clip.volume, clip.start);
    if (clip.fadeOut > 0) {
      g.setValueAtTime(clip.volume, Math.max(clip.start + clip.fadeIn, end - clip.fadeOut));
      g.linearRampToValueAtTime(0, end);
    }
    src.connect(gain).connect(ctx.destination);
    // The third argument is measured in source seconds, hence the speed factor.
    src.start(clip.start, clip.offset, clip.duration * clip.speed);
  }
  return ctx.startRendering();
}

/**
 * Frame-accurate offline render: every frame is composited with the same drawFrame() the
 * preview uses, encoded with WebCodecs and muxed to MP4 (WebM when no MP4 codec is available).
 */
export async function exportProject(
  project: Project,
  opts: ExportOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (!exportSupported()) throw new Error('WebCodecs is not available on this device/browser');
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('The timeline is empty');

  // H.264 needs even dimensions.
  const width = Math.round(opts.width / 2) * 2;
  const height = Math.round(opts.height / 2) * 2;

  const pick = async () => {
    for (const format of [new Mp4OutputFormat(), new WebMOutputFormat()]) {
      const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height, bitrate: opts.bitrate });
      if (codec) return { format, codec };
    }
    return null;
  };
  const chosen = await pick();
  if (!chosen) throw new Error('No supported video encoder found on this device');

  player.suspended = true;
  media.pauseAll();
  const videos = new Map<string, HTMLVideoElement>();
  const output = new Output({ format: chosen.format, target: new BufferTarget() });
  try {
    for (const clip of project.clips) {
      if (clip.type !== 'video' || !clip.assetId) continue;
      const url = media.url(clip.assetId);
      if (url) videos.set(clip.id, await loadVideo(url));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const videoSource = new CanvasSource(canvas, { codec: chosen.codec, bitrate: opts.bitrate });
    output.addVideoTrack(videoSource, { frameRate: opts.fps });

    const mixed = await mixAudio(project, duration).catch(() => null);
    const audioCodec = mixed ? await getFirstEncodableAudioCodec(chosen.format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate: 48000 }) : null;
    let audioSource: AudioBufferSource | null = null;
    if (mixed && audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }

    await output.start();
    if (audioSource && mixed) await audioSource.add(mixed);

    const frames = Math.max(1, Math.ceil(duration * opts.fps));
    const scale = width / project.width;
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = i / opts.fps;
      const seeks: Promise<void>[] = [];
      for (const clip of project.clips) {
        const v = videos.get(clip.id);
        const lt = t - clip.start;
        if (v && lt >= 0 && lt < clip.duration) seeks.push(seekVideo(v, clip.offset + lt * clip.speed));
      }
      await Promise.all(seeks);
      drawFrame(ctx, project, t, { scale, video: (c) => videos.get(c.id) ?? null, image: (id) => media.image(id) });
      await videoSource.add(t, 1 / opts.fps);
      onProgress((i + 1) / frames);
      // Yield so the UI (progress bar, cancel button) stays responsive.
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('Export produced no data');
    const isMp4 = chosen.format instanceof Mp4OutputFormat;
    return { blob: new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' }), ext: isMp4 ? 'mp4' : 'webm', hasAudio: !!audioSource };
  } catch (e) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    throw e;
  } finally {
    for (const v of videos.values()) {
      v.removeAttribute('src');
      v.load();
    }
    player.suspended = false;
    player.invalidate();
  }
}
