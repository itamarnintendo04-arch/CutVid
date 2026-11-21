import { Capacitor } from '@capacitor/core';
import { ICON_STYLES } from './appIconStyles.mjs';

export { ICON_STYLES };

declare global {
  interface Window {
    /** Electron only: change the window / dock icon (see electron/main.cjs). */
    cutvidAppIcon?: { set: (id: string) => Promise<void>; get: () => Promise<string> };
  }
}

const KEY = 'cutvid:app-icon';

/** Whether this build can change its icon (phone apps and the desktop app; not a browser). */
export const canChangeAppIcon = () => Capacitor.isNativePlatform() || !!window.cutvidAppIcon;

export async function currentAppIcon(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { AppIcon } = await import('@capawesome/capacitor-app-icon');
      const { icon } = await AppIcon.getCurrentIcon();
      return icon && icon !== 'AppIconDefault' ? icon : 'Default';
    }
    if (window.cutvidAppIcon) return await window.cutvidAppIcon.get();
  } catch {
    /* fall back to the remembered choice */
  }
  return localStorage.getItem(KEY) || 'Default';
}

/**
 * Switch the app icon. iOS shows a system alert confirming the change; Android restarts the
 * app so the launcher picks up the new icon; desktop changes the window and dock icon.
 */
export async function setAppIcon(id: string) {
  if (!ICON_STYLES.some((s) => s.id === id)) throw new Error('Unknown icon');
  localStorage.setItem(KEY, id);
  if (Capacitor.isNativePlatform()) {
    const { AppIcon } = await import('@capawesome/capacitor-app-icon');
    const relaunch = Capacitor.getPlatform() === 'android';
    if (id === 'Default') await AppIcon.resetIcon({ relaunch });
    else await AppIcon.setIcon({ icon: id, relaunch });
  } else if (window.cutvidAppIcon) {
    await window.cutvidAppIcon.set(id);
  }
}
