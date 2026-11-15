/// <reference types="@capacitor/background-runner" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cutvid.app',
  appName: 'CutVid',
  webDir: 'dist',
  backgroundColor: '#0b0c10',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
  plugins: {
    // Checks for new versions while the app is closed (see public/runners/background.js).
    // The label must match BGTaskSchedulerPermittedIdentifiers in Info.plist.
    BackgroundRunner: {
      label: 'com.cutvid.app.update',
      src: 'runners/background.js',
      event: 'checkUpdate',
      repeat: true,
      interval: 240,
      autoStart: true,
    },
  },
};

export default config;
