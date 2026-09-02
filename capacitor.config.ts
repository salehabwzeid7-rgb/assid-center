import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.assidcenter.teacher',
  appName: 'مركز أَصيد',
  webDir: 'dist/assid-center/browser',
  backgroundColor: '#0f6b3f',
  android: {
    allowMixedContent: false,
  },
};

export default config;
