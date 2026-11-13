import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Hand a finished file to the user in the way each platform expects. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // iOS/Android web views cannot "download": write to the cache dir and open the share sheet
    // (Save to Photos / Files / other apps).
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const CHUNK = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
    for (let pos = 0, first = true; pos < blob.size || first; pos += CHUNK, first = false) {
      const data = await blobToBase64(blob.slice(pos, pos + CHUNK));
      if (first) await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      else await Filesystem.appendFile({ path: filename, data, directory: Directory.Cache });
    }
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri });
    return;
  }

  const touch = matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], filename, { type: blob.type });
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
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
}
