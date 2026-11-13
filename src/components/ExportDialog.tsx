import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useStore, totalDuration } from '../store';
import { exportProject, exportSupported, type ExportResult } from '../engine/export';
import { saveBlob } from '../lib/save';
import { useT } from '../lib/i18n';
import { Dialog } from './ui';

const BPP = { low: 0.05, medium: 0.1, high: 0.18 } as const;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const duration = useStore(totalDuration);
  const [short, setShort] = useState(0); // 0 = project size, otherwise length of the short side
  const [fps, setFps] = useState(project.fps);
  const [quality, setQuality] = useState<keyof typeof BPP>('medium');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const k = short ? short / Math.min(project.width, project.height) : 1;
  const width = Math.round((project.width * k) / 2) * 2;
  const height = Math.round((project.height * k) / 2) * 2;
  const bitrate = Math.round(width * height * fps * BPP[quality]);
  const estMb = (bitrate * duration) / 8 / 1e6;
  const running = progress !== null && !result;

  const start = async () => {
    setError('');
    setResult(null);
    setProgress(0);
    useStore.getState().setPlaying(false);
    abort.current = new AbortController();
    try {
      setResult(await exportProject(project, { width, height, fps, bitrate }, setProgress, abort.current.signal));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      setProgress(null);
    }
  };

  const close = () => {
    abort.current?.abort();
    onClose();
  };

  const filename = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'cutvid'}.${result?.ext ?? 'mp4'}`;

  return (
    <Dialog title={t('exportTitle')} onClose={close}>
      {!exportSupported() ? (
        <p className="error">{t('exportUnsupported')}</p>
      ) : duration <= 0 ? (
        <p className="muted">{t('emptyTimeline')}</p>
      ) : result ? (
        <div className="stack">
          <p className="ok">
            {t('exportDone')} · {(result.blob.size / 1e6).toFixed(1)} MB · {result.ext.toUpperCase()}
          </p>
          {!result.hasAudio && project.clips.some((c) => c.type === 'audio' || c.type === 'video') && <p className="muted">{t('noAudioEncoder')}</p>}
          <button className="primary" onClick={() => saveBlob(result.blob, filename).catch((e) => setError(e.message))}>
            <Download size={16} /> {t('save')}
          </button>
        </div>
      ) : running ? (
        <div className="stack">
          <p>
            {t('exporting')} {Math.round((progress ?? 0) * 100)}%
          </p>
          <div className="progress">
            <div style={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
          <button onClick={() => abort.current?.abort()}>{t('cancel')}</button>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="field-label">{t('resolution')}</span>
            <select value={short} onChange={(e) => setShort(+e.target.value)}>
              <option value={0}>
                {t('project')} · {project.width}×{project.height}
              </option>
              <option value={480}>480p</option>
              <option value={720}>720p</option>
              <option value={1080}>1080p</option>
              <option value={1440}>1440p</option>
              <option value={2160}>4K</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('fps')}</span>
            <select value={fps} onChange={(e) => setFps(+e.target.value)}>
              {[24, 25, 30, 50, 60].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('quality')}</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value as keyof typeof BPP)}>
              <option value="low">{t('low')}</option>
              <option value="medium">{t('medium')}</option>
              <option value="high">{t('high')}</option>
            </select>
          </label>
          <p className="muted" dir="ltr">
            {width}×{height} · {fps} fps · ~{(bitrate / 1e6).toFixed(1)} Mbps · ~{estMb.toFixed(1)} MB
          </p>
          <button className="primary" onClick={start}>
            {t('start')}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
