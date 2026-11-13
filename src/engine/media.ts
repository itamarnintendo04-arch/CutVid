import type { Clip, MediaAsset, MediaKind } from '../types';
import { uid } from '../types';
import { dbDel, dbGet, dbSet } from '../lib/db';

/**
 * Owns everything that is not serialisable project state: file blobs, object URLs,
 * the <video>/<audio>/<img> elements used for preview, decoded audio and waveforms.
 */
class MediaManager {
  private blobs = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private images = new Map<string, HTMLImageElement>();
  private videoEls = new Map<string, HTMLVideoElement>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private peaks = new Map<string, Float32Array>();
  private audioCtx: AudioContext | null = null;
  /** Called whenever a frame became available so the preview can redraw. */
  onFrame: () => void = () => {};

  static kindOf(file: { type: string; name: string }): MediaKind | null {
    const t = file.type;
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('image/')) return 'image';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp'].includes(ext)) return 'image';
    return null;
  }

  url(assetId: string): string | undefined {
    return this.urls.get(assetId);
  }
  blob(assetId: string): Blob | undefined {
    return this.blobs.get(assetId);
  }
  has(assetId: string): boolean {
    return this.blobs.has(assetId);
  }

  private register(id: string, blob: Blob) {
    this.blobs.set(id, blob);
    this.urls.set(id, URL.createObjectURL(blob));
  }

  /** Import a user file: probe it, create a thumbnail and persist the blob locally. */
  async importFile(file: File): Promise<MediaAsset | null> {
    const kind = MediaManager.kindOf(file);
    if (!kind) return null;
    const id = uid();
    this.register(id, file);
    const asset: MediaAsset = { id, name: file.name, kind, mime: file.type, size: file.size, duration: 0, width: 0, height: 0 };
    try {
      if (kind === 'image') await this.probeImage(asset);
      else if (kind === 'video') await this.probeVideo(asset);
      else await this.probeAudio(asset);
    } catch (e) {
      console.warn('probe failed', e);
      this.release(id);
      return null;
    }
    dbSet('media', id, file).catch((e) => console.warn('media persist failed', e));
    return asset;
  }

  /** Register a blob that came from the cloud (asset metadata already exists in the project). */
  async addBlob(id: string, blob: Blob) {
    this.register(id, blob);
    await dbSet('media', id, blob).catch(() => {});
  }

  /** Load persisted blobs for a project's assets. Returns ids that are missing. */
  async restore(assets: MediaAsset[]): Promise<string[]> {
    const missing: string[] = [];
    await Promise.all(
      assets.map(async (a) => {
        if (this.blobs.has(a.id)) return;
        const blob = await dbGet<Blob>('media', a.id).catch(() => undefined);
        if (blob) this.register(a.id, blob);
        else missing.push(a.id);
      }),
    );
    this.onFrame();
    return missing;
  }

  release(assetId: string, forget = false) {
    const u = this.urls.get(assetId);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(assetId);
    this.blobs.delete(assetId);
    this.images.delete(assetId);
    this.decoded.delete(assetId);
    this.peaks.delete(assetId);
    if (forget) dbDel('media', assetId).catch(() => {});
  }

  private probeImage(asset: MediaAsset): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        asset.width = img.naturalWidth || 1024;
        asset.height = img.naturalHeight || 1024;
        asset.thumb = thumbOf(img, asset.width, asset.height);
        this.images.set(asset.id, img);
        resolve();
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = this.urls.get(asset.id)!;
    });
  }

  private probeVideo(asset: MediaAsset): Promise<void> {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      const timer = setTimeout(() => finish(), 8000);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!asset.duration || !asset.width) reject(new Error('video metadata unavailable'));
        else resolve();
        v.removeAttribute('src');
        v.load();
      };
      v.onloadedmetadata = () => {
        asset.width = v.videoWidth;
        asset.height = v.videoHeight;
        if (!isFinite(v.duration)) {
          // MediaRecorder WebM files report Infinity until seeked to the end.
          v.currentTime = 1e7;
          v.ontimeupdate = () => {
            v.ontimeupdate = null;
            asset.duration = v.duration;
            v.currentTime = Math.min(0.5, asset.duration / 2);
          };
        } else {
          asset.duration = v.duration;
          v.currentTime = Math.min(0.5, asset.duration / 2);
        }
      };
      v.onseeked = () => {
        if (!isFinite(v.duration) || !asset.duration) return;
        try {
          asset.thumb = thumbOf(v, v.videoWidth, v.videoHeight);
        } catch {
          /* tainted or not decodable yet — thumbnail is optional */
        }
        finish();
      };
      v.onerror = () => {
        done = true;
        clearTimeout(timer);
        reject(new Error('video load failed'));
      };
      v.src = this.urls.get(asset.id)!;
    });
  }

  private probeAudio(asset: MediaAsset): Promise<void> {
    return new Promise((resolve, reject) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => {
        if (isFinite(a.duration)) {
          asset.duration = a.duration;
          resolve();
        } else {
          // Fall back to a full decode to learn the duration.
          this.decode(asset.id).then((buf) => {
            if (!buf) return reject(new Error('audio duration unavailable'));
            asset.duration = buf.duration;
            resolve();
          });
        }
      };
      a.onerror = () => reject(new Error('audio load failed'));
      a.src = this.urls.get(asset.id)!;
    });
  }

  image(assetId: string): HTMLImageElement | null {
    let img = this.images.get(assetId);
    if (!img) {
      const url = this.urls.get(assetId);
      if (!url) return null;
      img = new Image();
      img.onload = () => this.onFrame();
      img.src = url;
      this.images.set(assetId, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  video(clip: Clip): HTMLVideoElement | null {
    let v = this.videoEls.get(clip.id);
    if (!v) {
      const url = clip.assetId && this.urls.get(clip.assetId);
      if (!url) return null;
      v = document.createElement('video');
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      const redraw = () => this.onFrame();
      v.addEventListener('seeked', redraw);
      v.addEventListener('loadeddata', redraw);
      v.src = url;
      this.videoEls.set(clip.id, v);
    }
    return v;
  }

  audio(clip: Clip): HTMLAudioElement | null {
    let a = this.audioEls.get(clip.id);
    if (!a) {
      const url = clip.assetId && this.urls.get(clip.assetId);
      if (!url) return null;
      a = new Audio();
      a.preload = 'auto';
      a.src = url;
      this.audioEls.set(clip.id, a);
    }
    return a;
  }

  /** Drop preview elements whose clips no longer exist. */
  prune(liveClipIds: Set<string>) {
    for (const map of [this.videoEls, this.audioEls] as Map<string, HTMLMediaElement>[]) {
      for (const [id, el] of map) {
        if (!liveClipIds.has(id)) {
          el.pause();
          el.removeAttribute('src');
          el.load();
          map.delete(id);
        }
      }
    }
  }

  pauseAll() {
    for (const v of this.videoEls.values()) if (!v.paused) v.pause();
    for (const a of this.audioEls.values()) if (!a.paused) a.pause();
  }

  /** Decode an asset's audio track (cached). Resolves null when there is none. */
  decode(assetId: string): Promise<AudioBuffer | null> {
    let p = this.decoded.get(assetId);
    if (!p) {
      const blob = this.blobs.get(assetId);
      p = !blob
        ? Promise.resolve(null)
        : blob
            .arrayBuffer()
            .then((buf) => {
              this.audioCtx ??= new AudioContext();
              return this.audioCtx.decodeAudioData(buf);
            })
            .catch(() => null);
      this.decoded.set(assetId, p);
    }
    return p;
  }

  /** Waveform peaks (0..1), ~100 per second. Skipped for very large files to protect memory. */
  async waveform(asset: MediaAsset): Promise<Float32Array | null> {
    const cached = this.peaks.get(asset.id);
    if (cached) return cached;
    if (asset.size > 200 * 1024 * 1024) return null;
    const buf = await this.decode(asset.id);
    if (!buf) return null;
    const perSec = 100;
    const n = Math.max(1, Math.floor(buf.duration * perSec));
    const out = new Float32Array(n);
    const ch = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / n));
    for (let i = 0; i < n; i++) {
      let max = 0;
      const s = i * step;
      for (let j = 0; j < step; j += 8) {
        const v = Math.abs(ch[s + j] || 0);
        if (v > max) max = v;
      }
      out[i] = max;
    }
    this.peaks.set(asset.id, out);
    return out;
  }
}

function thumbOf(src: CanvasImageSource, w: number, h: number): string {
  const c = document.createElement('canvas');
  const s = 160 / Math.max(w, h, 1);
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export const media = new MediaManager();
