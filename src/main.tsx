import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Offline support for the installable web app; pointless (and unavailable) on file:// and native shells.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !Capacitor.isNativePlatform()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
