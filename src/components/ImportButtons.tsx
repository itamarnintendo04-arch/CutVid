import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { useT } from '../lib/i18n';

/** Phones and tablets have a photo gallery; computers only have files. */
export const hasGallery = () => Capacitor.isNativePlatform() || (matchMedia('(pointer: coarse)').matches && !window.cutvidAuth);

const VISUAL = 'video/*,image/*,.mp4,.mov,.m4v,.webm,.mkv,.png,.jpg,.jpeg,.gif,.webp,.heic';
const ALL = `${VISUAL},audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac`;

/**
 * In the iOS / Android apps: "Gallery" opens the photo library and "Files" opens the Files app
 * (iCloud Drive, Downloads, …) — each directly, without the system's "choose a source" menu.
 * The picked files are read through the web view's file URL, so large videos are not copied into memory twice.
 */
async function pickNative(source: 'gallery' | 'files', visualOnly: boolean): Promise<File[]> {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  const res =
    source === 'gallery'
      ? await FilePicker.pickMedia({ limit: 0, skipTranscoding: true })
      : await FilePicker.pickFiles({ limit: 0, types: visualOnly ? ['image/*', 'video/*'] : ['image/*', 'video/*', 'audio/*'] });
  const out: File[] = [];
  for (const f of res.files) {
    const src = f.webPath ?? (f.path ? Capacitor.convertFileSrc(f.path) : null);
    if (!src) continue;
    const blob = await (await fetch(src)).blob();
    out.push(new File([blob], f.name, { type: f.mimeType || blob.type, lastModified: f.modifiedAt ?? Date.now() }));
  }
  return out;
}

/**
 * "Gallery" + "Files" on phones and tablets, a single "Import files" button on computers.
 * visualOnly: images and videos only (overlays).
 */
export function ImportButtons({ onFiles, visualOnly = false }: { onFiles: (files: File[]) => void; visualOnly?: boolean }) {
  const t = useT();
  const gallery = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles([...e.target.files]);
    e.target.value = '';
  };
  const open = async (source: 'gallery' | 'files') => {
    if (Capacitor.isNativePlatform()) {
      try {
        const picked = await pickNative(source, visualOnly);
        if (picked.length) onFiles(picked);
        return;
      } catch (e) {
        // Cancelling the picker is not an error; anything else falls back to the web picker below.
        if (/cancel/i.test(String((e as Error)?.message ?? e))) return;
      }
    }
    (source === 'gallery' ? gallery : files).current?.click();
  };
  const phone = hasGallery();
  return (
    <>
      <input ref={gallery} type="file" multiple accept="video/*,image/*" hidden onChange={pick} />
      <input ref={files} type="file" multiple accept={visualOnly ? VISUAL : ALL} hidden onChange={pick} />
      <div className={'import-row' + (phone ? '' : ' single')}>
        {phone && (
          <button className="import-btn" onClick={() => open('gallery')}>
            <ImageIcon size={18} />
            <b>{t('fromGallery')}</b>
            <small>{t('galleryHint')}</small>
          </button>
        )}
        <button className="import-btn" onClick={() => open('files')}>
          <Upload size={18} />
          <b>{phone ? t('fromFiles') : t('import')}</b>
          <small>{visualOnly ? t('galleryHint') : phone ? t('filesHint') : t('importHint')}</small>
        </button>
      </div>
    </>
  );
}
