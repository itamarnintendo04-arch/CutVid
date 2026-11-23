/// <reference types="@capacitor/background-runner" />
import type { CapacitorConfig } from '@capacitor/cli';

// CUTVID_PAD=1 builds CutVid Pad: the iPad app with the computer layout, installable next to CutVid.
const PAD = process.env.CUTVID_PAD === '1';
const APP_ID = PAD ? 'com.cutvid.pad' : 'com.cutvid.app';

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: PAD ? 'CutVid Pad' : 'CutVid',
  webDir: 'dist',
  backgroundColor: '#0b0c10',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
  plugins: {
    // Checks for new versions while the app is closed (see public/runners/background.js).
    // The label must match BGTaskSchedulerPermittedIdentifiers in Info.plist.
    BackgroundRunner: {
      label: `${APP_ID}.update`,
      src: 'runners/background.js',
      event: 'checkUpdate',
      repeat: true,
      interval: 240,
      autoStart: true,
    },
  },
};

export default config;
