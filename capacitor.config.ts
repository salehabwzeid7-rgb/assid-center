/// <reference types="@capacitor-firebase/authentication" />
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
    // دخول Google الأصليّ على أندرويد — الويب يستخدم signInWithPopup مباشرةً.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
