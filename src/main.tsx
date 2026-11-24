import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { initNativeAuth, supabase } from './lib/supabase';
import { watchPresets } from './lib/presets';
import { startSync } from './lib/sync';
import { configureBackgroundUpdates } from './lib/notify';
import { useSettings } from './lib/settings';
import { chosenLang, deviceLang } from './lib/lang';
import { useStore } from './store';
import './lib/fonts';
import './styles.css';

// Create the client early so a sign-in redirect (?code=…) is picked up on load.
supabase();
initNativeAuth();

// Until a language is picked in Settings, the app follows the device: ask the system (iOS web views
// only report languages the app declares) and pick up changes made while the app is open.
const followDevice = () => {
  if (!chosenLang()) deviceLang().then((lang) => !chosenLang() && useStore.setState({ lang }));
};
followDevice();
window.addEventListener('languagechange', followDevice);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && followDevice());
watchPresets();
startSync();
configureBackgroundUpdates(useSettings.getState().notifyUpdates);

createRoot(document.getElementById('root')!).render(<App />);

// Offline support for the installable web app; pointless (and unavailable) on file:// and native shells.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !Capacitor.isNativePlatform()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
