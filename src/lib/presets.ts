import { create } from 'zustand';
import type { ClipEffect, Easing, Filters } from '../types';
import { supabase } from './supabase';

export type PresetKind = 'curve' | 'filter' | 'effect';
export interface PresetData {
  curve: Easing;
  filter: Filters;
  effect: ClipEffect[];
}

export interface Preset<K extends PresetKind = PresetKind> {
  id: string;
  kind: K;
  name: string;
  data: PresetData[K];
}

interface PresetState {
  signedIn: boolean;
  presets: Preset[];
  loaded: boolean;
}

const CACHE = 'cutvid:presets';

/** Custom presets live in the user's account; a local copy keeps them usable offline. */
export const usePresets = create<PresetState>(() => {
  let presets: Preset[] = [];
  try {
    presets = JSON.parse(localStorage.getItem(CACHE) || '[]');
  } catch {
    /* ignore corrupt cache */
  }
  return { signedIn: false, presets, loaded: false };
});

const commit = (presets: Preset[]) => {
  localStorage.setItem(CACHE, JSON.stringify(presets));
  usePresets.setState({ presets, loaded: true });
};

export async function refreshPresets() {
  const c = supabase();
  if (!c) return;
  const { data: session } = await c.auth.getSession();
  usePresets.setState({ signedIn: !!session.session });
  if (!session.session) return;
  const { data, error } = await c.from('presets').select('id,kind,name,data').order('created_at', { ascending: false });
  if (!error && data) commit(data as Preset[]);
}

export async function savePreset<K extends PresetKind>(kind: K, name: string, data: PresetData[K]) {
  const c = supabase();
  const { data: session } = c ? await c.auth.getSession() : { data: { session: null } };
  if (!c || !session.session) throw new Error('SIGN_IN_REQUIRED');
  const { data: row, error } = await c.from('presets').insert({ kind, name: name.trim().slice(0, 60) || 'Untitled', data }).select('id,kind,name,data').single();
  if (error) throw new Error(error.message);
  commit([row as Preset, ...usePresets.getState().presets]);
}

export async function deletePreset(id: string) {
  const c = supabase();
  if (!c) return;
  const { error } = await c.from('presets').delete().eq('id', id);
  if (error) throw new Error(error.message);
  commit(usePresets.getState().presets.filter((p) => p.id !== id));
}

let watching = false;
/** Keep the preset list in step with sign-in / sign-out. */
export function watchPresets() {
  const c = supabase();
  if (!c || watching) return;
  watching = true;
  c.auth.onAuthStateChange((_e, session) => {
    usePresets.setState({ signedIn: !!session });
    // Defer: Supabase forbids awaiting its own client inside this callback.
    if (session) setTimeout(refreshPresets, 0);
  });
  refreshPresets();
}
