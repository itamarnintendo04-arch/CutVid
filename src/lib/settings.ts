import { create } from 'zustand';

export interface Settings {
  /** Notify when the AI finished editing. */
  notifyAi: boolean;
  notifyExport: boolean;
  /** Tell me about new versions, also while the app is closed (phones). */
  notifyUpdates: boolean;
  /** Save a finished export without asking. */
  autoSave: boolean;
  /** Default export size: length of the frame's short side. */
  exportShort: number;
  /** Default export frame rate; 0 = same as the project. */
  exportFps: number;
  exportQuality: 'low' | 'medium' | 'high';
}

const KEY = 'cutvid:settings';
const DEFAULTS: Settings = { notifyAi: true, notifyExport: true, notifyUpdates: true, autoSave: true, exportShort: 1080, exportFps: 0, exportQuality: 'medium' };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<Settings>(() => load());

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  useSettings.setState({ [key]: value } as Pick<Settings, K>);
  localStorage.setItem(KEY, JSON.stringify(useSettings.getState()));
}
