/**
 * إعدادات البيئة (تطوير) — مركز أسيد
 *
 * إعداد Firebase موحّد في ملف واحد: src/environments/firebase.config.ts
 * (يُملأ مرة واحدة). هنا نختار فقط أين يتّصل التطبيق:
 *
 *   useEmulator: true   → محاكي Firebase المحلي (npm run dev) — بلا سحابة.
 *   useEmulator: false  → مشروع Firebase الحقيقي على السحابة.
 */
import { firebaseConfig } from './firebase.config';

export const environment = {
  production: false,
  // التطوير يتّصل بمحاكي Firebase المحلّيّ (يُشغّله `npm run dev`) — لا يمسّ السحابة.
  // لتصحيح بيانات الإنتاج محليًّا: بدّلها مؤقّتًا إلى false.
  useEmulator: true,
  emulator: {
    authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1',
    firestorePort: 8080,
  },
  firebase: firebaseConfig,
};
