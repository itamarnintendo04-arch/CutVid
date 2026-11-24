// Pictures from CutVid AI (Gemini, through the cutvid-ai Edge Function so the key stays on the server):
// creating an image from a description, and removing the background of an image clip. Background
// removal asks the model to put the subject on flat pure green; the clip's green-screen key then
// makes that green transparent, so it works with the compositor CutVid already has.
import { supabase } from '../lib/supabase';
import { media } from '../engine/media';
import { useStore } from '../store';
import type { Clip, MediaAsset } from '../types';
import { importFiles } from '../components/Library';

/** The key settings that clear the pure-green background the model paints. */
export const GREEN_KEY = { enabled: true, color: '#00ff00', similarity: 0.32, smoothness: 0.08 } as const;

async function callImage(prompt: string, image?: { data: string; mime: string }): Promise<Blob> {
  const c = supabase();
  if (!c) throw new Error('CutVid AI is not available in this build');
  const { data: session } = await c.auth.getSession();
  if (!session.session) throw new Error('Sign in to your CutVid account to use CutVid AI');
  const { data, error } = await c.functions.invoke('cutvid-ai', { body: { action: 'image', prompt, image } });
  if (error) {
    let detail = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) detail = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  if (typeof data?.data !== 'string') throw new Error('The AI did not return an image');
  const bytes = Uint8Array.from(atob(data.data), (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: data.mime || 'image/png' });
}

/** Shrink a picture so the request stays small, and return it as base64 PNG. */
async function encode(blob: Blob, maxSide = 1536): Promise<{ data: string; mime: string }> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL('image/png');
  return { data: url.slice(url.indexOf(',') + 1), mime: 'image/png' };
}

const orientation = () => {
  const { width, height } = useStore.getState().project;
  return width > height * 1.1 ? 'a wide landscape (16:9)' : height > width * 1.1 ? 'a tall portrait (9:16)' : 'a square (1:1)';
};

async function toAsset(blob: Blob, name: string): Promise<MediaAsset> {
  const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
  const [asset] = await importFiles([new File([blob], `${name}.${ext}`, { type: blob.type })]);
  if (!asset) throw new Error('The picture could not be added to the project');
  return asset;
}

/** A new picture from a description, added to the project's media (not yet to the timeline). */
export async function generateImage(prompt: string): Promise<MediaAsset> {
  const blob = await callImage(`Create ${orientation()} image for a video: ${prompt}. No text or watermarks unless asked.`);
  const name = prompt.trim().slice(0, 32).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'AI image';
  return toAsset(blob, name);
}

/** A copy of the clip's picture with the background replaced by flat pure green. */
export async function greenBackground(clip: Clip): Promise<MediaAsset> {
  if (clip.type !== 'image' || !clip.assetId) throw new Error('Background removal works on pictures. For videos with a green screen, turn on the green-screen key.');
  const blob = media.blob(clip.assetId);
  if (!blob) throw new Error('The picture is not on this device');
  const result = await callImage(
    'Keep the main subject exactly as it is — same shape, pose, colours, details, size and position. Replace everything else, including the background and any floor or shadows, with a perfectly flat, solid, pure green #00FF00. No green on the subject itself, no gradient, no outline.',
    await encode(blob),
  );
  return toAsset(result, `${clip.name.replace(/\.[^.]+$/, '') || 'picture'} (no background)`);
}

/** Removes the background of a picture clip: swaps in the green version and keys it out. One undo step. */
export async function removeBackground(clipId: string) {
  const clip = useStore.getState().project.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const asset = await greenBackground(clip);
  useStore.getState().updateClip(clipId, (c) => {
    c.assetId = asset.id;
    c.chroma = { ...GREEN_KEY };
  });
}
