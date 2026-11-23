import { APP_ID } from './app';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '../version';

export type NotifyState = 'granted' | 'denied' | 'prompt' | 'unsupported';

const native = () => Capacitor.isNativePlatform();

export async function notifyState(): Promise<NotifyState> {
  try {
    if (native()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    }
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/** Ask the OS / browser for permission. Must be called from a tap. */
export async function requestNotify(): Promise<NotifyState> {
  try {
    if (native()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { display } = await LocalNotifications.requestPermissions();
      // The background update check posts through its own channel; ask for that too.
      try {
        const { BackgroundRunner } = await import('@capacitor/background-runner');
        await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
      } catch {
        /* background checks are optional */
      }
      return display === 'granted' ? 'granted' : 'denied';
    }
    if (!('Notification' in window)) return 'unsupported';
    const res = await Notification.requestPermission();
    return res === 'default' ? 'prompt' : res;
  } catch {
    return 'unsupported';
  }
}

/** Best-effort local notification (export finished, update available). Silent when not permitted. */
export async function notify(title: string, body: string, onlyWhenHidden = false) {
  try {
    // While the user is looking at the app the result is already on screen.
    if (onlyWhenHidden && !document.hidden) return;
    if ((await notifyState()) !== 'granted') return;
    if (native()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title, body }] });
    } else if (document.hidden) {
      new Notification(title, { body, icon: './icon-512.png' });
    }
  } catch {
    /* notifications are a nicety */
  }
}

/** Compare this build with the latest published one. Returns the newer version number, if any. */
export async function checkForUpdate(siteUrl: string): Promise<number | null> {
  // The web app is always the latest build already.
  if (!siteUrl || (!native() && !window.cutvidAuth)) return null;
  try {
    const res = await fetch(`${siteUrl}/version.json`, { cache: 'no-store' });
    const { version } = await res.json();
    return typeof version === 'number' && version > APP_VERSION ? version : null;
  } catch {
    return null;
  }
}

/** Tell the background task which build is installed and whether update notifications are wanted. */
export async function configureBackgroundUpdates(enabled: boolean) {
  if (!native()) return;
  try {
    const { BackgroundRunner } = await import('@capacitor/background-runner');
    await BackgroundRunner.dispatchEvent({ label: `${APP_ID}.update`, event: 'configure', details: { version: APP_VERSION, enabled } });
  } catch {
    /* not available on this device */
  }
}
