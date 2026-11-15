// CutVid AI — the built-in assistant. Runs as a Supabase Edge Function so the provider key stays
// on the server. Only signed-in users can call it (JWT verification is on).
//
// Configure ONE of these in Supabase → Edge Functions → Secrets:
//   A) ANTHROPIC_API_KEY                      (optional CUTVID_AI_MODEL, default claude-opus-5-5)
//   B) AI_API_KEY + AI_BASE_URL + AI_MODEL    any OpenAI-compatible provider, e.g. a free-tier one
// Pictures (optional): AI_IMAGE_MODEL, plus AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL when the image
// provider differs from the chat provider (they default to AI_API_KEY / AI_BASE_URL).
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

type Msg = { role: 'user' | 'assistant'; content: string };

async function viaAnthropic(system: string, messages: Msg[]): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.beta.messages.create({
    model: Deno.env.get('CUTVID_AI_MODEL') ?? 'claude-opus-5-5',
    max_tokens: 16000,
    // If a safety classifier declines, let the API retry on its default fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages,
  });
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request');
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

async function viaOpenAiCompatible(system: string, messages: Msg[]): Promise<string> {
  const base = (Deno.env.get('AI_BASE_URL') ?? '').replace(/\/+$/, '');
  const model = Deno.env.get('AI_MODEL');
  if (!base || !model) throw new Error('CutVid AI is not fully set up: AI_BASE_URL and AI_MODEL are required with AI_API_KEY');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('AI_API_KEY')}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`AI provider error ${res.status}: ${body?.error?.message ?? body?.message ?? res.statusText}`);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: { text?: string }) => p?.text ?? '').join('');
  throw new Error('The AI provider returned an empty reply');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function makeImage(prompt: string, size: string): Promise<{ b64: string; mime: string }> {
  const model = Deno.env.get('AI_IMAGE_MODEL');
  const key = Deno.env.get('AI_IMAGE_API_KEY') ?? Deno.env.get('AI_API_KEY');
  const base = (Deno.env.get('AI_IMAGE_BASE_URL') ?? Deno.env.get('AI_BASE_URL') ?? '').replace(/\/+$/, '');
  if (!model || !key || !base) throw new Error('Picture generation is not set up yet: the owner has not added AI_IMAGE_MODEL in Supabase.');
  const call = (withSize: boolean) =>
    fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, n: 1, ...(withSize ? { size } : {}) }),
    });
  let res = await call(true);
  if (res.status === 400) res = await call(false); // size names differ between providers
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Image provider error ${res.status}: ${body?.error?.message ?? body?.message ?? res.statusText}`);
  const item = body?.data?.[0];
  if (item?.b64_json) return { b64: item.b64_json, mime: 'image/png' };
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`Could not download the generated image (${img.status})`);
    return { b64: toBase64(new Uint8Array(await img.arrayBuffer())), mime: img.headers.get('content-type') ?? 'image/png' };
  }
  throw new Error('The image provider returned no image');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { system?: unknown; messages?: unknown; image?: { prompt?: unknown; size?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (body.image) {
    const prompt = typeof body.image.prompt === 'string' ? body.image.prompt.trim().slice(0, 4000) : '';
    const size = typeof body.image.size === 'string' && /^\d{3,4}x\d{3,4}$/.test(body.image.size) ? body.image.size : '1024x1024';
    if (!prompt) return json({ error: 'image.prompt is required' }, 400);
    try {
      return json(await makeImage(prompt, size));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Unknown error' });
    }
  }

  const messages: Msg[] = Array.isArray(body.messages)
    ? body.messages.filter((m): m is Msg => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string').slice(-12)
    : [];
  if (!messages.length || typeof body.system !== 'string') return json({ error: 'system and messages are required' }, 400);

  try {
    if (Deno.env.get('ANTHROPIC_API_KEY')) return json({ text: await viaAnthropic(body.system, messages) });
    if (Deno.env.get('AI_API_KEY')) return json({ text: await viaOpenAiCompatible(body.system, messages) });
    return json({ error: 'CutVid AI is not set up yet: the owner has not added an AI provider key in Supabase.' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment' });
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status ?? ''}: ${e.message}` });
    return json({ error: e instanceof Error ? e.message : 'Unknown error' });
  }
});
