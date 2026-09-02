/**
 * إعدادات بيئة الإنتاج — مركز أسيد (واجهة المعلّم)
 *
 * 1) أنشئ مشروع Firebase وفعّل Authentication (Email/Password) و Cloud Firestore.
 * 2) من إعدادات المشروع → تطبيقاتك → تطبيق ويب، انسخ القيم إلى `firebase` أدناه.
 * 3) انشر القواعد:  firebase deploy --only firestore:rules
 *
 * مفاتيح Firebase عامة (client-side) وليست سرية.
 */
export const environment = {
  production: true,
  useEmulator: false,
  emulator: {
    authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1',
    firestorePort: 8080,
  },
  firebase: {
    apiKey: 'ضع_API_KEY_هنا',
    authDomain: 'ضع_authDomain_هنا',
    projectId: 'ضع_projectId_هنا',
    storageBucket: 'ضع_storageBucket_هنا',
    messagingSenderId: 'ضع_messagingSenderId_هنا',
    appId: 'ضع_appId_هنا',
  },
};
