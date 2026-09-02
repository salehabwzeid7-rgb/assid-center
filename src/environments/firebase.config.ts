/* ==========================================================================
   إعداد مشروع Firebase — مركز أسيد
   ──────────────────────────────────────────────────────────────────────────
   مُعبّأ من Firebase Console (مشروع assid-center). يُودَع في Git ولا يُلمَس
   بعد ذلك مع التحديثات. هذه المفاتيح عامة (client-side) وليست سرّية؛
   الحماية عبر قواعد firestore.rules (تُنشَر بـ: npm run firebase:rules).
   ========================================================================== */

export const firebaseConfig = {
  apiKey: 'AIzaSyAGa1s436AtD6Et8ugOA73KtwJOdO6dyTo',
  authDomain: 'assid-center.firebaseapp.com',
  projectId: 'assid-center',
  storageBucket: 'assid-center.firebasestorage.app',
  messagingSenderId: '155072677831',
  appId: '1:155072677831:web:7604d4e78390552960bbe2',
};

/** يصير true تلقائيًا بمجرّد ملء القيم أعلاه (يُستخدم لإظهار تنبيه واضح إن لم تُملأ). */
export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith('ضع_') &&
  !firebaseConfig.projectId.startsWith('ضع_') &&
  !firebaseConfig.appId.startsWith('ضع_');
