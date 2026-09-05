/**
 * إعدادات بيئة الإنتاج — الماهر (تُستخدَم في بناء APK)
 *
 * إعداد Firebase في src/environments/firebase.config.ts (يُملأ مرة واحدة).
 * الإنتاج يتّصل دائمًا بالسحابة الحقيقية: useEmulator = false ثابتًا.
 */
import { firebaseConfig } from './firebase.config';

export const environment = {
  production: true,
  useEmulator: false,
  emulator: {
    authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1',
    firestorePort: 8080,
  },
  firebase: firebaseConfig,
};
