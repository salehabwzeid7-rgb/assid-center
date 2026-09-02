/**
 * إعدادات البيئة — مركز أَصيد (واجهة المعلّم)
 *
 * ── وضع المعاينة (preview) ──────────────────────────────────────────────
 * عندما يكون `preview: true` يعمل التطبيق ببيانات تجريبية محليًا (localStorage)
 * دون أي اتصال بـ Firebase — لمعاينة الواجهة وتجربتها فورًا.
 * بعد إنشاء مشروع Firebase وإدخال إعداداته أدناه، اجعل `preview: false`.
 *
 * ملاحظة: مفاتيح Firebase عامة (client-side) وليست سرية، والحماية عبر
 * قواعد أمان Firestore في ملف firestore.rules.
 */
export const environment = {
  production: false,
  preview: true,
  firebase: {
    apiKey: 'ضع_API_KEY_هنا',
    authDomain: 'assid-center.firebaseapp.com',
    projectId: 'assid-center',
    storageBucket: 'assid-center.appspot.com',
    messagingSenderId: 'ضع_SENDER_ID_هنا',
    appId: 'ضع_APP_ID_هنا',
  },
};
