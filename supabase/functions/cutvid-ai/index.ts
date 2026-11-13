// CutVid AI — the built-in assistant. Runs as a Supabase Edge Function so the Anthropic API key
// stays on the server. Only signed-in users can call it (JWT verification is on by default).
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy cutvid-ai
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const MODEL = Deno.env.get('CUTVID_AI_MODEL') ?? 'claude-opus-5-5';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { system?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((m): m is { role: 'user' | 'assistant'; content: string } => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
        .slice(-12)
    : [];
  if (!messages.length || typeof body.system !== 'string') return json({ error: 'system and messages are required' }, 400);

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, let the API retry on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: body.system,
      messages,
    });
    if (res.stop_reason === 'refusal') return json({ error: 'The model declined this request' });
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment' });
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status ?? ''}: ${e.message}` });
    return json({ error: e instanceof Error ? e.message : 'Unknown error' });
  }
});
