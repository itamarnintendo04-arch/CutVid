import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cutvid.app',
  appName: 'CutVid',
  webDir: 'dist',
  backgroundColor: '#0b0c10',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
