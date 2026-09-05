import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.assidcenter.teacher',
  appName: 'الماهر',
  webDir: 'dist/assid-center/browser',
  backgroundColor: '#0f6b3f',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // تحديث مباشر (OTA) — الفحص والتفعيل يُداران يدويًّا من UpdateService
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: true,
      appReadyTimeout: 15000,
    },
  },
};

export default config;
