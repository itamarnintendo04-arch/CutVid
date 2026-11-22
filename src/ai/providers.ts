import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase';
import { universalFetch } from './http';

export type Wire = 'cutvid' | 'anthropic' | 'openai';

export interface ProviderDef {
  id: string;
  name: string;
  wire: Wire;
  baseUrl: string;
  needsKey: boolean;
  /** The user must type the base URL (self-hosted / unknown gateway). */
  customUrl?: boolean;
  keyHint?: string;
}

/** Everything except Anthropic speaks the OpenAI-compatible /chat/completions + /models dialect. */
export const PROVIDERS: ProviderDef[] = [
  { id: 'cutvid', name: 'CutVid AI', wire: 'cutvid', baseUrl: '', needsKey: false },
  { id: 'anthropic', name: 'Anthropic (Claude)', wire: 'anthropic', baseUrl: 'https://api.anthropic.com', needsKey: true, keyHint: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', wire: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, keyHint: 'sk-…' },
  { id: 'gemini', name: 'Google Gemini', wire: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, keyHint: 'AIza…' },
  { id: 'openrouter', name: 'OpenRouter', wire: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, keyHint: 'sk-or-…' },
  { id: 'groq', name: 'Groq', wire: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, keyHint: 'gsk_…' },
  { id: 'mistral', name: 'Mistral', wire: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true },
  { id: 'deepseek', name: 'DeepSeek', wire: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true },
  { id: 'xai', name: 'xAI (Grok)', wire: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true, keyHint: 'xai-…' },
  { id: 'together', name: 'Together AI', wire: 'openai', baseUrl: 'https://api.together.xyz/v1', needsKey: true },
  { id: 'fireworks', name: 'Fireworks AI', wire: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', needsKey: true },
  { id: 'cerebras', name: 'Cerebras', wire: 'openai', baseUrl: 'https://api.cerebras.ai/v1', needsKey: true },
  { id: 'ollama', name: 'Ollama (local)', wire: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, customUrl: true },
  { id: 'lmstudio', name: 'LM Studio (local)', wire: 'openai', baseUrl: 'http://localhost:1234/v1', needsKey: false, customUrl: true },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', wire: 'openai', baseUrl: '', needsKey: false, customUrl: true },
];

export interface ProviderConfig {
  key: string;
  model: string;
  baseUrl: string;
}

export interface AiSettings {
  provider: string;
  configs: Record<string, ProviderConfig>;
}

const LS_KEY = 'cutvid:ai';

/** API keys never leave the device except in requests to the provider they belong to. */
export function loadAiSettings(): AiSettings {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s?.provider && s.configs) return s;
  } catch {
    /* ignore corrupt value */
  }
  return { provider: 'cutvid', configs: {} };
}

export function saveAiSettings(s: AiSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export const providerDef = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export function configFor(s: AiSettings, id: string): ProviderConfig {
  const def = providerDef(id);
  const saved = s.configs[id];
  // Only self-hosted style providers let the user change the endpoint.
  return { key: saved?.key ?? '', model: saved?.model ?? '', baseUrl: def.customUrl ? (saved?.baseUrl ?? def.baseUrl) : def.baseUrl };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function anthropicClient(cfg: ProviderConfig) {
  // The key belongs to the person using the app and is stored on their own device,
  // which is the case the SDK's browser opt-in exists for.
  return new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true, fetch: universalFetch });
}

function anthropicError(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('Invalid API key');
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('This key is not allowed to use that model');
  if (e instanceof Anthropic.NotFoundError) return new Error('Model not found');
  if (e instanceof Anthropic.RateLimitError) return new Error('Rate limited — try again in a moment');
  if (e instanceof Anthropic.APIError) return new Error(`Anthropic API error ${e.status ?? ''}: ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
}

function openAiHeaders(cfg: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.key) h.authorization = `Bearer ${cfg.key}`;
  return h;
}

async function openAiJson(res: Response): Promise<any> {
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.message ?? (typeof json?.error === 'string' ? json.error : text.slice(0, 200));
    throw new Error(`${res.status}: ${msg || res.statusText}`);
  }
  return json;
}

const baseOf = (cfg: ProviderConfig) => cfg.baseUrl.trim().replace(/\/+$/, '');

/** Ask the provider which models this key can use. */
export async function listModels(providerId: string, cfg: ProviderConfig): Promise<string[]> {
  const def = providerDef(providerId);
  if (def.wire === 'cutvid') return [];
  if (def.wire === 'anthropic') {
    try {
      const ids: string[] = [];
      for await (const m of anthropicClient(cfg).models.list({ limit: 100 })) ids.push(m.id);
      return ids;
    } catch (e) {
      throw anthropicError(e);
    }
  }
  if (!baseOf(cfg)) throw new Error('Base URL is required');
  const json = await openAiJson(await universalFetch(`${baseOf(cfg)}/models`, { headers: openAiHeaders(cfg) }));
  const list: any[] = Array.isArray(json) ? json : (json?.data ?? json?.models ?? []);
  return list
    .map((m) => String(m?.id ?? m?.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort();
}

/** One non-streaming completion. Returns the assistant's text. */
export async function chat(providerId: string, cfg: ProviderConfig, system: string, messages: ChatMessage[]): Promise<string> {
  const def = providerDef(providerId);

  if (def.wire === 'cutvid') {
    const c = supabase();
    if (!c) throw new Error('CutVid AI is not available in this build');
    const { data: session } = await c.auth.getSession();
    if (!session.session) throw new Error('Sign in to your CutVid account to use CutVid AI');
    const { data, error } = await c.functions.invoke('cutvid-ai', { body: { system, messages } });
    if (error) {
      // FunctionsHttpError hides the body; surface what the function actually said.
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
    return String(data?.text ?? '');
  }

  if (!cfg.model) throw new Error('Choose a model first');

  if (def.wire === 'anthropic') {
    try {
      const res = await anthropicClient(cfg).messages.create({ model: cfg.model, max_tokens: 16000, system, messages });
      if (res.stop_reason === 'refusal') throw new Error('The model declined this request');
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      if (res.stop_reason === 'max_tokens' && !text.trim()) throw new Error('The reply was cut off before any output — try a simpler request');
      return text;
    } catch (e) {
      throw anthropicError(e);
    }
  }

  if (!baseOf(cfg)) throw new Error('Base URL is required');
  const json = await openAiJson(
    await universalFetch(`${baseOf(cfg)}/chat/completions`, {
      method: 'POST',
      headers: openAiHeaders(cfg),
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, ...messages] }),
    }),
  );
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  // Some gateways return an array of content parts.
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? '').join('');
  throw new Error('The provider returned an empty reply');
}

