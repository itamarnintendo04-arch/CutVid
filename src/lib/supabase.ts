import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '../types';
import { media } from '../engine/media';

const LS_KEY = 'cutvid:supabase';
const BUCKET = 'media';

export interface SupabaseConfig {
  url: string;
  key: string;
  fromEnv: boolean;
}

/** Build-time env vars win; otherwise the values entered in the in-app dialog are used. */
export function getConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return { url, key, fromEnv: true };
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved?.url && saved?.key) return { url: saved.url, key: saved.key, fromEnv: false };
  } catch {
    /* ignore corrupt value */
  }
  return null;
}

let client: SupabaseClient | null = null;
let clientFor = '';

export function setConfig(url: string, key: string) {
  localStorage.setItem(LS_KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), key: key.trim() }));
  client = null;
}

export function clearConfig() {
  localStorage.removeItem(LS_KEY);
  client = null;
}

export function supabase(): SupabaseClient | null {
  const cfg = getConfig();
  if (!cfg) return null;
  const id = cfg.url + cfg.key;
  if (!client || clientFor !== id) {
    client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    clientFor = id;
  }
  return client;
}

function need(): SupabaseClient {
  const c = supabase();
  if (!c) throw new Error('Supabase is not configured');
  return c;
}

async function userId(c: SupabaseClient): Promise<string> {
  const { data } = await c.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

export interface CloudProject {
  id: string;
  name: string;
  updated_at: string;
}

/** Upload missing media files to Storage, then upsert the project JSON. */
export async function cloudSave(project: Project, onProgress: (msg: string) => void) {
  const c = need();
  const uid = await userId(c);
  let i = 0;
  for (const asset of project.assets) {
    i++;
    const blob = media.blob(asset.id);
    if (!blob) continue;
    onProgress(`${i}/${project.assets.length} · ${asset.name}`);
    const { error } = await c.storage.from(BUCKET).upload(`${uid}/${asset.id}`, blob, { contentType: asset.mime || undefined, upsert: false });
    // "Duplicate" simply means this asset was uploaded on a previous save.
    if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`${asset.name}: ${error.message}`);
  }
  const { error } = await c.from('projects').upsert({ id: project.id, user_id: uid, name: project.name, data: project, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function cloudList(): Promise<CloudProject[]> {
  const { data, error } = await need().from('projects').select('id,name,updated_at').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Fetch a project and any media files that are not already on this device. */
export async function cloudLoad(id: string, onProgress: (msg: string) => void): Promise<Project> {
  const c = need();
  const uid = await userId(c);
  const { data, error } = await c.from('projects').select('data').eq('id', id).single();
  if (error) throw new Error(error.message);
  const project = data.data as Project;
  const missing = await media.restore(project.assets);
  let i = 0;
  for (const assetId of missing) {
    i++;
    const asset = project.assets.find((a) => a.id === assetId);
    onProgress(`${i}/${missing.length} · ${asset?.name ?? ''}`);
    const dl = await c.storage.from(BUCKET).download(`${uid}/${assetId}`);
    if (dl.error) throw new Error(`${asset?.name}: ${dl.error.message}`);
    await media.addBlob(assetId, dl.data);
  }
  return project;
}

export async function cloudDelete(id: string) {
  const { error } = await need().from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
