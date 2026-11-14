import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '../types';
import { Capacitor } from '@capacitor/core';
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

declare global {
  interface Window {
    /** Electron only: opens the system browser (when a URL is given) and resolves with the loopback callback URL. */
    cutvidAuth?: { start: (url: string | null) => Promise<string> };
  }
}

export const NATIVE_REDIRECT = 'com.cutvid.app://auth';
export const DESKTOP_REDIRECT = 'http://127.0.0.1:47823/callback';

/** True after a password-reset link was opened; the cloud dialog then asks for a new password. */
export let recoveryPending = false;
export const clearRecovery = () => void (recoveryPending = false);

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
    // PKCE: redirects come back with ?code=…, which works for web, deep links and the desktop loopback alike.
    client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true } });
    clientFor = id;
    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryPending = true;
        window.dispatchEvent(new Event('cutvid:recovery'));
      }
    });
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

// ---- sign-in ------------------------------------------------------------------------------

/** Where Supabase should send the user back to. Each of these must be allowed under Auth → URL Configuration. */
export function redirectUrl(): string {
  if (Capacitor.isNativePlatform()) return NATIVE_REDIRECT;
  if (window.cutvidAuth) return DESKTOP_REDIRECT;
  return location.origin + location.pathname;
}

/** Finish a redirect that came back to the app (deep link or desktop loopback). */
export async function completeAuth(url: string) {
  const u = new URL(url);
  const params = new URLSearchParams(u.search || u.hash.replace(/^#/, ''));
  const problem = params.get('error_description') ?? params.get('error');
  if (problem) throw new Error(problem);
  const code = params.get('code');
  if (!code) throw new Error('The sign-in link did not contain a code');
  const { error } = await need().auth.exchangeCodeForSession(code);
  if (error) throw new Error(error.message);
}

export async function signInWithGoogle() {
  const c = need();
  const native = Capacitor.isNativePlatform();
  const desktop = !!window.cutvidAuth;
  const { data, error } = await c.auth.signInWithOAuth({
    provider: 'google',
    // In a plain browser Supabase navigates the page itself; the shells open an external browser instead.
    options: { redirectTo: redirectUrl(), skipBrowserRedirect: native || desktop },
  });
  if (error) throw new Error(error.message);
  if (native) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url }); // the appUrlOpen listener completes the flow
  } else if (desktop) {
    await completeAuth(await window.cutvidAuth!.start(data.url));
  }
}

export async function sendPasswordReset(email: string) {
  const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw new Error(error.message);
  // On desktop, wait for the emailed link to be opened on this computer.
  if (window.cutvidAuth) window.cutvidAuth.start(null).then(completeAuth).catch(() => {});
}

/** iOS / Android: handle com.cutvid.app:// links (Google sign-in, password reset). */
export async function initNativeAuth() {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');
  App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    Browser.close().catch(() => {});
    completeAuth(url).catch((e) => window.dispatchEvent(new CustomEvent('cutvid:auth-error', { detail: (e as Error).message })));
  });
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
