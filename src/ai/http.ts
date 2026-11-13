import { Capacitor, CapacitorHttp } from '@capacitor/core';

declare global {
  interface Window {
    /** Injected by the Electron preload script: performs the request in the main process. */
    cutvidHttp?: (req: { url: string; method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
  }
}

/**
 * fetch() that is not subject to browser CORS inside the desktop and mobile shells.
 * Many AI providers do not send CORS headers, so native shells route the call outside the web view.
 * In a plain browser this is ordinary fetch and the provider must allow cross-origin calls.
 */
export const universalFetch: typeof fetch = async (input, init) => {
  const native = Capacitor.isNativePlatform();
  if (!window.cutvidHttp && !native) return fetch(input, init);

  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
  const body = typeof init?.body === 'string' ? init.body : undefined;

  if (window.cutvidHttp) {
    const r = await window.cutvidHttp({ url, method, headers, body });
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  let data: unknown = body;
  try {
    if (body) data = JSON.parse(body);
  } catch {
    /* not JSON — send as is */
  }
  const r = await CapacitorHttp.request({ url, method, headers, data, responseType: 'text' });
  const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  // 204/304 must not carry a body in the Response constructor.
  return new Response(r.status === 204 || r.status === 304 ? null : text, { status: r.status, headers: r.headers });
};
