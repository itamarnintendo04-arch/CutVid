import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { useT } from '../lib/i18n';

/** Phones and tablets have a photo gallery; computers only have files. */
export const hasGallery = () => Capacitor.isNativePlatform() || (matchMedia('(pointer: coarse)').matches && !window.cutvidAuth);

const VISUAL = 'video/*,image/*,.mp4,.mov,.m4v,.webm,.mkv,.png,.jpg,.jpeg,.gif,.webp,.heic';
const ALL = `${VISUAL},audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac`;

/**
 * "Gallery" + "Files" on phones, a single "Files" button on computers.
 * visualOnly: images and videos only (overlays).
 */
export function ImportButtons({ onFiles, visualOnly = false }: { onFiles: (files: FileList) => void; visualOnly?: boolean }) {
  const t = useT();
  const gallery = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = '';
  };
  const phone = hasGallery();
  return (
    <>
      {/* accept="video/*,image/*" opens the photo library on phones; the second input browses files. */}
      <input ref={gallery} type="file" multiple accept="video/*,image/*" hidden onChange={pick} />
      <input ref={files} type="file" multiple accept={visualOnly ? VISUAL : ALL} hidden onChange={pick} />
      <div className={'import-row' + (phone ? '' : ' single')}>
        {phone && (
          <button className="import-btn" onClick={() => gallery.current?.click()}>
            <ImageIcon size={18} />
            <b>{t('fromGallery')}</b>
            <small>{t('galleryHint')}</small>
          </button>
        )}
        <button className="import-btn" onClick={() => files.current?.click()}>
          <Upload size={18} />
          <b>{phone ? t('fromFiles') : t('import')}</b>
          <small>{visualOnly ? t('galleryHint') : phone ? t('filesHint') : t('importHint')}</small>
        </button>
      </div>
    </>
  );
}
