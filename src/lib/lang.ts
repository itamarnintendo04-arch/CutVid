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

const LANG_KEY = 'cutvid:lang';

/** The language picked in Settings, or null when the app follows the device ("Automatic"). */
export const chosenLang = (): Lang | null => {
  const saved = localStorage.getItem(LANG_KEY);
  return isLang(saved) ? saved : null;
};

export function rememberLang(lang: Lang | null) {
  if (lang) localStorage.setItem(LANG_KEY, lang);
  else localStorage.removeItem(LANG_KEY);
}

/** First supported language in a list like ['he-IL', 'en-US'], or null. */
function matchLang(codes: readonly string[]): Lang | null {
  for (const l of codes) {
    const code = (l || '').toLowerCase().split(/[-_]/)[0].replace('iw', 'he');
    if (isLang(code)) return code;
  }
  return null;
}

/** The device language as the web view reports it (correct in browsers, Electron and Android). */
export const browserLang = (): Lang => matchLang(navigator.languages ?? [navigator.language]) ?? 'en';

/**
 * The device language from the operating system itself. iOS web views only report languages the app
 * declares, so the apps ask the system directly; elsewhere this is the same as browserLang().
 */
export async function deviceLang(): Promise<Lang> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Device } = await import('@capacitor/device');
      const [{ value: tag }, { value: code }] = await Promise.all([Device.getLanguageTag(), Device.getLanguageCode()]);
      const found = matchLang([tag, code]);
      if (found) return found;
    }
  } catch {
    /* fall back to what the web view says */
  }
  return browserLang();
}

/** Saved choice, else the device language as far as we can tell synchronously, else English. */
export function initialLang(): Lang {
  return chosenLang() ?? browserLang();
}

