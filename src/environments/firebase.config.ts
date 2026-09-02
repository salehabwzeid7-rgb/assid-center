/* ==========================================================================
   إعداد مشروع Firebase — مركز أسيد
   ──────────────────────────────────────────────────────────────────────────
   يُملأ **مرة واحدة فقط** ثم يُودَع في Git، ولا يُلمَس بعد ذلك مع التحديثات.

   كيف تحصل على القيم:
   Firebase Console → إعدادات المشروع (⚙) → «تطبيقاتك» → تطبيق ويب →
   «إعداد SDK» → انسخ كائن firebaseConfig كما هو.

   هذه المفاتيح عامة (client-side) وليست سرّية؛ الحماية عبر قواعد
   firestore.rules (يجب نشرها: npm run firebase:rules).
   ========================================================================== */

export const firebaseConfig = {
  apiKey: 'ضع_API_KEY_هنا',
  authDomain: 'ضع_PROJECT_ID_هنا.firebaseapp.com',
  projectId: 'ضع_PROJECT_ID_هنا',
  storageBucket: 'ضع_PROJECT_ID_هنا.appspot.com',
  messagingSenderId: 'ضع_MESSAGING_SENDER_ID_هنا',
  appId: 'ضع_APP_ID_هنا',
};

/** يصير true تلقائيًا بمجرّد ملء القيم أعلاه (يُستخدم لإظهار تنبيه واضح إن لم تُملأ). */
export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith('ضع_') &&
  !firebaseConfig.projectId.startsWith('ضع_') &&
  !firebaseConfig.appId.startsWith('ضع_');
