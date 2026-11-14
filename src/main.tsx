import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { initNativeAuth, supabase } from './lib/supabase';
import './styles.css';

// Create the client early so a sign-in redirect (?code=…) is picked up on load.
supabase();
initNativeAuth();

createRoot(document.getElementById('root')!).render(<App />);

// Offline support for the installable web app; pointless (and unavailable) on file:// and native shells.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !Capacitor.isNativePlatform()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
