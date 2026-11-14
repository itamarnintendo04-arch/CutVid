import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export type SaveResult = 'gallery' | 'shared' | 'downloaded';

export const savesToGallery = () => Capacitor.isNativePlatform();

/** Hand a finished file to the user in the way each platform expects. */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    // Web views cannot "download": write the file to the cache dir first.
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const CHUNK = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
    for (let pos = 0, first = true; pos < blob.size || first; pos += CHUNK, first = false) {
      const data = await blobToBase64(blob.slice(pos, pos + CHUNK));
      if (first) await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      else await Filesystem.appendFile({ path: filename, data, directory: Directory.Cache });
    }
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

    // Preferred: straight into the Photos / Gallery app.
    try {
      const { Media } = await import('@capacitor-community/media');
      let albumIdentifier: string | undefined;
      if (Capacitor.getPlatform() === 'android') {
        // Android requires an album to save into.
        const find = async () => (await Media.getAlbums()).albums.find((a) => a.name === 'CutVid')?.identifier;
        albumIdentifier = await find();
        if (!albumIdentifier) {
          await Media.createAlbum({ name: 'CutVid' });
          albumIdentifier = await find();
        }
      }
      await Media.saveVideo({ path: uri, albumIdentifier });
      return 'gallery';
    } catch (e) {
      console.warn('gallery save failed, falling back to the share sheet', e);
    }
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: filename, url: uri });
    return 'shared';
  }

  const touch = matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], filename, { type: blob.type });
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
