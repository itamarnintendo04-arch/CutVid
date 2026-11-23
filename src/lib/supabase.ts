import { APP_ID, IS_PAD } from './app';
import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '../types';
import { Capacitor } from '@capacitor/core';
import { media } from '../engine/media';

const LS_KEY = 'cutvid:supabase';
// The CutVid Supabase project. A publishable key is meant to ship inside client apps;
// row-level security is what protects the data. Build-time env vars override these.
const DEFAULT_URL = 'https://btrwboxwbinqewgvlcal.supabase.co';
const DEFAULT_KEY = 'sb_publishable_g2aYTfsQhep44Ta1VIIJfQ_GQnA5ODh';
const BUCKET = 'media';

export interface SupabaseConfig {
  url: string;
  key: string;
  fromEnv: boolean;
}

/** The app ships connected to the CutVid project; build-time env vars can point it elsewhere. */
export function getConfig(): SupabaseConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_KEY;
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

export const NATIVE_REDIRECT = `${APP_ID}://auth`;
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

/**
 * Public address of the CutVid web app, without a trailing slash (e.g. https://cutvid.example.com).
 * When set, the apps sign in through its /callback bridge page (public/auth.html), which shows a branded
 * "Returning to CutVid" screen and hands the result back to the app.
 */
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://cutvid.vercel.app').replace(/\/+$/, '');

/** Where Supabase should send the user back to. Each of these must be allowed under Auth → URL Configuration. */
export function redirectUrl(): string {
  const native = Capacitor.isNativePlatform();
  const desktop = !!window.cutvidAuth;
  if (native) return SITE_URL ? `${SITE_URL}/callback?to=${IS_PAD ? 'pad' : 'app'}` : NATIVE_REDIRECT;
  if (desktop) return SITE_URL ? `${SITE_URL}/callback?to=desktop` : DESKTOP_REDIRECT;
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
  awaitDesktopLink();
}

/** Desktop: wait for an emailed link (confirmation, reset) to be opened on this computer. */
function awaitDesktopLink() {
  if (window.cutvidAuth) window.cutvidAuth.start(null).then(completeAuth).catch(() => {});
}

/** Sign up. Returns true when Supabase requires the emailed confirmation link before signing in. */
export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await need().auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(error.message);
  if (data.session) return false;
  awaitDesktopLink();
  return true;
}

/**
 * Sign-in with email: check the password, then email a sign-in link. Opening the link on this device
 * (it comes back through ${SITE_URL}/callback) finishes signing in.
 * The password session is dropped so the app only stays signed in after the link is opened.
 * (This gate lives in the app; it is not server-enforced MFA.)
 */
export async function startEmailSignIn(email: string, password: string) {
  const c = need();
  const res = await c.auth.signInWithPassword({ email, password });
  if (res.error) throw new Error(res.error.message);
  await c.auth.signOut({ scope: 'local' });
  await sendSignInLink(email);
}

export async function sendSignInLink(email: string) {
  const { error } = await need().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(error.message);
  awaitDesktopLink();
}

/** iOS / Android: handle com.cutvid.app:// (or com.cutvid.pad://) links (Google sign-in, password reset). */
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

const uploadedKey = (uid: string) => `cutvid:uploaded:${uid}`;
function uploadedSet(uid: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(uploadedKey(uid)) || '[]'));
  } catch {
    return new Set();
  }
}

/** Id of the signed-in user, or null. Does not hit the network. */
export async function currentUserId(): Promise<string | null> {
  const c = supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Upload media files that are not in Storage yet, then upsert the project JSON.
 * Returns the names of files that could not be uploaded (e.g. over the size limit).
 */
export async function cloudSave(project: Project, onProgress: (msg: string) => void = () => {}): Promise<string[]> {
  const c = need();
  const uid = await userId(c);
  const done = uploadedSet(uid);
  const failed: string[] = [];
  let i = 0;
  for (const asset of project.assets) {
    i++;
    const blob = media.blob(asset.id);
    if (!blob || done.has(asset.id)) continue;
    onProgress(`${i}/${project.assets.length} · ${asset.name}`);
    const { error } = await c.storage.from(BUCKET).upload(`${uid}/${asset.id}`, blob, { contentType: asset.mime || undefined, upsert: false });
    // "Duplicate" simply means this asset was uploaded before (perhaps from another device).
    if (error && !/exist|duplicate/i.test(error.message)) failed.push(asset.name);
    else done.add(asset.id);
  }
  localStorage.setItem(uploadedKey(uid), JSON.stringify([...done]));
  const { error } = await c.from('projects').upsert({ id: project.id, user_id: uid, name: project.name, data: project, updated_at: new Date(project.updatedAt).toISOString() });
  if (error) throw new Error(error.message);
  return failed;
}

export async function cloudList(): Promise<CloudProject[]> {
  const { data, error } = await need().from('projects').select('id,name,updated_at').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The project document only; media is fetched when the project is opened. */
export async function cloudFetch(id: string): Promise<Project> {
  const { data, error } = await need().from('projects').select('data').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data.data as Project;
}

/** Download media files of a project that are not on this device yet. Returns how many are still missing. */
export async function downloadMissing(project: Project, onProgress: (msg: string) => void = () => {}): Promise<number> {
  const missing = await media.restore(project.assets);
  const uid = await currentUserId();
  if (!missing.length || !uid) return missing.length;
  const c = need();
  let left = missing.length;
  let i = 0;
  for (const assetId of missing) {
    i++;
    onProgress(`${i}/${missing.length}`);
    const dl = await c.storage.from(BUCKET).download(`${uid}/${assetId}`);
    if (dl.error) continue;
    await media.addBlob(assetId, dl.data);
    left--;
  }
  return left;
}

export async function cloudDelete(id: string) {
  const { error } = await need().from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- feedback -----------------------------------------------------------------------------

/** Anyone may send feedback (signed in or not); only the project owner can read it. */
export async function sendFeedback(message: string, rating: number | null, email: string, platform: string) {
  const { error } = await need()
    .from('feedback')
    .insert({ message: message.trim().slice(0, 4000), rating, email: email.trim().slice(0, 200) || null, platform });
  if (error) throw new Error(error.message);
}

/** Whether someone is signed in right now; updates on sign-in and sign-out. */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const c = supabase();
    if (!c) return;
    c.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = c.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}
