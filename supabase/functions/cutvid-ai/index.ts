// CutVid AI — the built-in assistant. Runs as a Supabase Edge Function so the provider key stays
// on the server. Only signed-in users can call it (JWT verification is on).
//
// Configure ONE of these in Supabase → Edge Functions → Secrets:
//   A) ANTHROPIC_API_KEY                      (optional CUTVID_AI_MODEL, default claude-opus-5-5)
//   B) AI_API_KEY                             a Google AI Studio key: uses Gemini 2.5 Flash.
//      Set AI_BASE_URL and AI_MODEL as well to use any other OpenAI-compatible provider.
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

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';

/** Accept the base URL in the shapes people paste it: with /chat/completions, without /openai, etc. */
function normalizeBase(raw: string | undefined): string {
  let base = (raw ?? '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  if (!base || /generativelanguage\.googleapis\.com/.test(base)) base = GEMINI;
  return base;
}

/** "models/gemini-2.5-flash" (how Google lists them) -> "gemini-2.5-flash". */
const normalizeModel = (m: string) => m.trim().replace(/^models\//, '');

async function listModels(base: string, key: string): Promise<string[]> {
  const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => null);
  const list: { id?: string }[] = Array.isArray(body?.data) ? body.data : [];
  return list.map((m) => normalizeModel(String(m?.id ?? ''))).filter(Boolean);
}

/** Stand-ins when the configured model does not exist (renamed or retired), best first: newest plain "flash" models, then other chat models. */
function fallbacks(models: string[], tried: string): string[] {
  const chatty = models.filter((m) => m !== tried && !/image|tts|audio|live|embed|vision|thinking-exp|aqa|learnlm|imagen|veo|robotics|computer-use/.test(m));
  const score = (m: string) => {
    const v = Number((m.match(/(\d+(?:\.\d+)?)/) ?? [])[1] ?? 0);
    return (/flash/.test(m) ? 100 : 0) + v * 10 - (/lite/.test(m) ? 3 : 0) - (/preview|exp/.test(m) ? 1 : 0);
  };
  return chatty.sort((a, b) => score(b) - score(a)).slice(0, 4);
}

/** The model that last worked, so later requests skip the failed lookups while this instance is warm. */
let workingModel: string | null = null;

function providerError(status: number, body: any, fallback: string) {
  // Google sometimes wraps the error in an array.
  const err = Array.isArray(body) ? body[0]?.error : body?.error;
  return `${status}: ${err?.message ?? body?.message ?? fallback}`;
}

async function viaOpenAiCompatible(system: string, messages: Msg[]): Promise<string> {
  const key = (Deno.env.get('AI_API_KEY') ?? '').trim();
  const base = normalizeBase(Deno.env.get('AI_BASE_URL'));
  let model = workingModel ?? normalizeModel(Deno.env.get('AI_MODEL') || 'gemini-2.5-flash');

  const call = (m: string) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: m, messages: [{ role: 'system', content: system }, ...messages] }),
    });

  let res = await call(model);
  let body = await res.json().catch(() => null);
  if (res.status === 404) {
    // Usually the model name: look at what this key can use and try the closest matches in turn.
    const first = model;
    const models = await listModels(base, key).catch(() => [] as string[]);
    const candidates = fallbacks(models, first);
    console.log(`model ${first} not found at ${base}; ${models.length} models available; trying ${candidates.join(', ')}`);
    if (!candidates.length) {
      throw new Error(
        models.length
          ? `AI model "${first}" was not found. Set AI_MODEL to one of: ${models.slice(0, 8).join(', ')}`
          : `AI provider 404 at ${base} — check AI_BASE_URL (or remove it to use Gemini) and AI_API_KEY`,
      );
    }
    for (const m of candidates) {
      model = m;
      res = await call(m);
      body = await res.json().catch(() => null);
      if (res.status !== 404) break;
    }
    if (res.status === 404) throw new Error(`AI model "${first}" was not found and none of ${candidates.join(', ')} answered. Set AI_MODEL to a model your key can use.`);
  }
  if (res.ok) workingModel = model;
  if (!res.ok) throw new Error(`AI provider error ${providerError(res.status, body, res.statusText)} (model ${model})`);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: { text?: string }) => p?.text ?? '').join('');
  throw new Error('The AI provider returned an empty reply');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { system?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
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
