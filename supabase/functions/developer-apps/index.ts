// "Sign in with CutVid" for other developers.
//
//   apply   (public)        a developer sends the form → stored as pending, emailed to the owner and the developer
//   review  (signed link)   the owner approves or rejects from the email → the developer gets a welcome or a "maybe next time" email
//   mine    (signed in)     the developer's applications, matched by their verified account email
//   secret  (signed in)     an approved developer creates (or replaces) the OAuth Client ID + Secret
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SMTP_USER, SMTP_PASS   the Gmail address and its app password (the same ones used for Auth emails)
//   ADMIN_EMAIL            where applications are sent (defaults to SMTP_USER)
//   SMTP_HOST              optional, default smtp.gmail.com (port 465)
// Needs Authentication → OAuth Server turned on, so OAuth clients can be created.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import nodemailer from 'npm:nodemailer@6.9.16';

const SITE = (Deno.env.get('SITE_URL') ?? 'https://cutvid.vercel.app').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
class Fail extends Error {
  constructor(msg: string, public status = 400) {
    super(msg);
  }
}

// ---- helpers ------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:') return ['localhost', '127.0.0.1'].includes(url.hostname);
    return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && url.protocol.includes('.'); // app schemes like com.example.app:
  } catch {
    return false;
  }
}

async function sign(id: string, decision: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('REVIEW_SECRET') || SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`developer-app:${id}:${decision}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function layout(title: string, body: string, button?: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#0b0c10;padding:32px 12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#14161c;border:1px solid #262a35;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<div style="font-size:20px;font-weight:700;color:#e8eaf0;margin-bottom:18px">CutVid</div>
<h1 style="font-size:21px;color:#e8eaf0;margin:0 0 12px">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:#b4b9c8">${body}</div>
${button ? `<p style="margin:24px 0 0"><a href="${button.href}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px">${button.label}</a></p>` : ''}
</td></tr></table>
<p style="color:#6b7080;font-size:12px;margin-top:16px">CutVid developer program</p>
</td></tr></table></body></html>`;
}

async function sendMail(to: string, subject: string, html: string) {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass) {
    console.log(`email not sent (SMTP_USER / SMTP_PASS missing): ${subject} → ${to}`);
    return false;
  }
  const transport = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  try {
    await transport.sendMail({ from: `CutVid <${user}>`, to, subject, html });
    return true;
  } catch (e) {
    console.error('email failed', subject, (e as Error).message);
    return false;
  }
}

function details(app: Record<string, any>) {
  const row = (k: string, v: string) => `<tr><td style="color:#8b90a0;padding:4px 12px 4px 0;vertical-align:top">${k}</td><td style="color:#e8eaf0;padding:4px 0">${v}</td></tr>`;
  return `<table role="presentation" style="font-size:14px;margin:14px 0">${row('App', esc(app.name))}${app.website ? row('Website', esc(app.website)) : ''}${row('Email', esc(app.contact_email))}${row('Redirect URLs', app.redirect_uris.map(esc).join('<br>'))}${row('About', esc(app.description).replace(/\n/g, '<br>'))}</table>`;
}

async function signedInUser(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Fail('Sign in first', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email) throw new Fail('Sign in first', 401);
  const u = data.user;
  // Only an address the account has proven it owns counts.
  if (!u.email_confirmed_at && !(u.app_metadata?.providers ?? []).includes('google')) throw new Fail('Confirm your email address first', 403);
  return u;
}

async function ownedApp(id: unknown, email: string) {
  if (typeof id !== 'string') throw new Fail('Missing application');
  const { data } = await db.from('developer_apps').select('*').eq('id', id).maybeSingle();
  if (!data || data.contact_email.toLowerCase() !== email.toLowerCase()) throw new Fail('This application does not belong to the account you are signed in with', 403);
  return data;
}

// ---- actions ------------------------------------------------------------------------------

async function apply(b: Record<string, unknown>) {
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const website = String(b.website ?? '').trim();
  const description = String(b.description ?? '').trim();
  const uris = (Array.isArray(b.redirect_uris) ? b.redirect_uris : String(b.redirect_uris ?? '').split(/\s+/)).map((u) => String(u).trim()).filter(Boolean);
  if (name.length < 2 || name.length > 60) throw new Fail('App name must be 2–60 characters');
  if (!EMAIL.test(email) || email.length > 200) throw new Fail('Enter a valid email address');
  if (website && !/^https?:\/\/\S+$/.test(website)) throw new Fail('Website must start with https://');
  if (description.length < 10 || description.length > 2000) throw new Fail('Describe your app in 10–2000 characters');
  if (!uris.length || uris.length > 10) throw new Fail('Add 1–10 redirect URLs');
  const bad = uris.find((u) => !validUri(u));
  if (bad) throw new Fail(`Redirect URL not allowed: ${bad} (use https://, http://localhost or an app scheme like com.example.app://)`);

  const { count } = await db.from('developer_apps').select('id', { count: 'exact', head: true }).ilike('contact_email', email).eq('status', 'pending');
  if ((count ?? 0) >= 3) throw new Fail('You already have 3 applications waiting for review');

  const { data: app, error } = await db
    .from('developer_apps')
    .insert({ name, contact_email: email, website: website || null, description, redirect_uris: uris })
    .select('*')
    .single();
  if (error) throw new Fail(error.message, 500);

  const admin = Deno.env.get('ADMIN_EMAIL') || Deno.env.get('SMTP_USER');
  const link = async (d: string) => `${SITE}/developers/review?id=${app.id}&decision=${d}&sig=${await sign(app.id, d)}`;
  if (admin) {
    await sendMail(
      admin,
      `New CutVid app request: ${name}`,
      layout('New app request', `Someone asked to use Sign in with CutVid.${details(app)}<p><a href="${await link('reject')}" style="color:#ff5c7a">Reject</a></p>`, { href: await link('approve'), label: 'Approve' }),
    );
  }
  await sendMail(
    email,
    'We received your CutVid app request',
    layout('Request received', `Thanks for applying to use Sign in with CutVid for <b style="color:#e8eaf0">${esc(name)}</b>. We will review it and email you the answer.${details(app)}`),
  );
  return { ok: true };
}

async function review(b: Record<string, unknown>) {
  const id = String(b.id ?? '');
  const decision = String(b.decision ?? '');
  if (!['approve', 'reject'].includes(decision)) throw new Fail('Unknown decision');
  if (!timingSafeEqual(String(b.sig ?? ''), await sign(id, decision))) throw new Fail('This review link is not valid', 403);
  const { data: app } = await db.from('developer_apps').select('*').eq('id', id).maybeSingle();
  if (!app) throw new Fail('Application not found', 404);
  if (app.status !== 'pending') return { status: app.status, name: app.name, already: true };

  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { error } = await db.from('developer_apps').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) throw new Fail(error.message, 500);
  if (status === 'approved') {
    await sendMail(
      app.contact_email,
      `Welcome! ${app.name} is approved for Sign in with CutVid`,
      layout(
        `Congratulations — ${esc(app.name)} is approved!`,
        `Your app can now use Sign in with CutVid. Open the developer console, sign in with this email address (<b style="color:#e8eaf0">${esc(app.contact_email)}</b>) and create your Client ID and Client Secret.`,
        { href: `${SITE}/developers/console`, label: 'Create my keys' },
      ),
    );
  } else {
    await sendMail(
      app.contact_email,
      `About your CutVid app request: ${app.name}`,
      layout(
        'Not this time',
        `Thank you for your interest in Sign in with CutVid. We can't approve <b style="color:#e8eaf0">${esc(app.name)}</b> right now. Maybe next time — you are welcome to apply again with more details about your app.`,
        { href: `${SITE}/developers`, label: 'Apply again' },
      ),
    );
  }
  return { status, name: app.name };
}

async function mine(req: Request) {
  const user = await signedInUser(req);
  const { data, error } = await db
    .from('developer_apps')
    .select('id, name, website, redirect_uris, status, oauth_client_id, created_at')
    .ilike('contact_email', user.email!)
    .order('created_at', { ascending: false });
  if (error) throw new Fail(error.message, 500);
  return { email: user.email, apps: data };
}

async function secret(req: Request, b: Record<string, unknown>) {
  const user = await signedInUser(req);
  const app = await ownedApp(b.id, user.email!);
  if (app.status !== 'approved') throw new Fail('This app is not approved yet', 403);
  const oauth = db.auth.admin.oauth;
  const res = app.oauth_client_id
    ? await oauth.regenerateClientSecret(app.oauth_client_id)
    : await oauth.createClient({
        client_name: app.name,
        client_uri: app.website ?? undefined,
        redirect_uris: app.redirect_uris,
        token_endpoint_auth_method: 'client_secret_basic',
      });
  if (res.error || !res.data) {
    const msg = res.error?.message ?? 'Could not create keys';
    throw new Fail(/not.*enabled|oauth server|404/i.test(msg) ? 'Sign in with CutVid is not switched on yet. Please try again later.' : msg, 500);
  }
  if (!app.oauth_client_id) await db.from('developer_apps').update({ oauth_client_id: res.data.client_id }).eq('id', app.id);
  return { client_id: res.data.client_id, client_secret: res.data.client_secret };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  try {
    switch (b.action) {
      case 'apply':
        return json(await apply(b));
      case 'review':
        return json(await review(b));
      case 'mine':
        return json(await mine(req));
      case 'secret':
        return json(await secret(req, b));
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    if (status === 500) console.error(e);
    return json({ error: (e as Error).message }, status);
  }
});
