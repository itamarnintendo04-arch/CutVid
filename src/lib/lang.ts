// Kept apart from i18n.ts (which imports the store) so the store can read it without an import cycle.

/** Every language the app speaks, by its own name. English is the fallback for anything missing. */
export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'he', name: 'עברית', rtl: true },
  { id: 'ar', name: 'العربية', rtl: true },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'pt', name: 'Português' },
  { id: 'it', name: 'Italiano' },
  { id: 'ru', name: 'Русский' },
  { id: 'tr', name: 'Türkçe' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
  { id: 'zh', name: '中文（简体）' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];
export const isRtl = (l: Lang) => LANGUAGES.some((x) => x.id === l && 'rtl' in x);
export const isLang = (v: unknown): v is Lang => LANGUAGES.some((x) => x.id === v);

/** Saved choice, else the device language when we have it, else English. */
export function initialLang(): Lang {
  const saved = localStorage.getItem('cutvid:lang');
  if (isLang(saved)) return saved;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = (l || '').toLowerCase().split('-')[0].replace('iw', 'he');
    if (isLang(code)) return code;
  }
  return 'en';
}

