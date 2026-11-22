// Shared code for the developer pages: the CutVid account (Supabase Auth) and the developer-apps API.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';

const PROJECT = 'https://btrwboxwbinqewgvlcal.supabase.co';
const KEY = 'sb_publishable_g2aYTfsQhep44Ta1VIIJfQ_GQnA5ODh';

export const supabase = createClient(PROJECT, KEY, { auth: { detectSessionInUrl: true, persistSession: true } });

/** Calls the developer-apps function, as the signed-in user when there is one. */
export async function api(action, body = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? KEY;
  const res = await fetch(`${PROJECT}/functions/v1/developer-apps`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: KEY, authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}

export function setStatus(node, text, kind = '') {
  node.className = 'status ' + kind;
  node.textContent = text;
}

const GOOGLE_SVG =
  '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>';

/**
 * Sign-in box: Google, or a sign-in link emailed to an existing CutVid account.
 * `onSignedIn` runs once a session exists (also when the page loads already signed in).
 */
export function signInBox(root, intro, onSignedIn) {
  const status = el('p', { class: 'status', role: 'status' });
  const email = el('input', { type: 'email', autocomplete: 'email', required: true, dir: 'ltr' });
  const send = el('button', { class: 'btn ghost', type: 'submit' }, 'Email me a sign-in link');

  const google = el('button', { class: 'btn google', type: 'button' });
  google.innerHTML = GOOGLE_SVG + ' Continue with Google';
  google.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    if (error) setStatus(status, error.message, 'err');
  });

  const form = el(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        send.disabled = true;
        try {
          // The link comes back to this same page, which then finishes signing in.
          const { error } = await supabase.auth.signInWithOtp({ email: email.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.href } });
          if (error) throw new Error(/signup|not found|not allowed/i.test(error.message) ? 'There is no CutVid account with this email. Create one in the CutVid app first.' : error.message);
          send.textContent = 'Send the link again';
          setStatus(status, 'We emailed you a sign-in link. Open it in this browser to continue.', 'ok');
        } catch (err) {
          setStatus(status, err.message, 'err');
        } finally {
          send.disabled = false;
        }
      },
    },
    el('label', {}, 'Email of your CutVid account', email),
    send,
  );

  root.replaceChildren(el('div', { class: 'card stack' }, el('h2', {}, 'Sign in'), el('p', { class: 'muted', style: 'margin:0' }, intro), google, el('div', { class: 'divider' }, 'or with email'), form, status));

  let done = false;
  const check = (session) => {
    if (session && !done) {
      done = true;
      onSignedIn(session);
    }
  };
  supabase.auth.getSession().then(({ data }) => check(data.session));
  supabase.auth.onAuthStateChange((_e, session) => check(session));
}
