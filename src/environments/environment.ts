/**
 * إعدادات البيئة (تطوير) — مركز أسيد (واجهة المعلّم)
 *
 * ── المحاكي المحلي (useEmulator) ────────────────────────────────────────
 * عندما يكون `useEmulator: true` يتصل التطبيق بـ Firebase Emulator Suite
 * المحلي (مصادقة + Firestore حقيقيان يعملان على جهازك بلا سحابة).
 * شغّل كل شيء بأمر واحد:  npm run dev
 * البيانات حقيقية وتُحفَظ في مجلد .emulator-data بين الجلسات.
 *
 * ── الإنتاج ────────────────────────────────────────────────────────────
 * لاستخدام مشروع Firebase حقيقي على السحابة: اجعل `useEmulator: false`
 * واملأ قيم `firebase` أدناه (من إعدادات مشروع Firebase → تطبيق ويب).
 * مفاتيح Firebase عامة وليست سرية؛ الحماية عبر قواعد firestore.rules.
 */
export const environment = {
  production: false,
  useEmulator: true,
  emulator: {
    authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1',
    firestorePort: 8080,
  },
  firebase: {
    apiKey: 'demo-assid-center',
    authDomain: 'demo-assid-center.firebaseapp.com',
    projectId: 'demo-assid-center',
    storageBucket: 'demo-assid-center.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
};
