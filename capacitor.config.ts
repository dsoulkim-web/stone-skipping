import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dsoulkim.mulsujebi',
  appName: '퐁당퐁당',
  webDir: 'dist',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0b1d2a' },
};

export default config;
