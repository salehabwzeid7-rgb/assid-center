/* ==========================================================================
   تهيئة Firebase — مركز أسيد
   المصادقة (Auth) + Firestore سحابي مع تخزين محلي دائم ومزامنة تلقائية.

   • الإعداد الحقيقي في:  src/environments/firebase.config.ts  (يُملأ مرة واحدة)
   • useEmulator في environment*.ts يحدّد: محاكٍ محلي أم سحابة حقيقية.
   • experimentalAutoDetectLongPolling لضمان عمل Firestore داخل WebView (Capacitor).
   ========================================================================== */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { isFirebaseConfigured } from '../../environments/firebase.config';

/**
 * في وضع المحاكي نفرض مشروعًا وهميًا صالحًا (demo-assid-center) بغضّ النظر عمّا
 * في firebase.config.ts — حتى يعمل `npm run dev` دون أيّ إعداد سحابي.
 * يجب أن يطابق --project في scripts/emulators.mjs.
 */
const appConfig = environment.useEmulator
  ? {
      apiKey: 'demo-key',
      authDomain: 'demo-assid-center.firebaseapp.com',
      projectId: 'demo-assid-center',
      storageBucket: 'demo-assid-center.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:demo',
    }
  : environment.firebase;

export const firebaseApp: FirebaseApp = initializeApp(appConfig);

export const auth: Auth = getAuth(firebaseApp);

export const db: Firestore = initializeFirestore(firebaseApp, {
  // تخزين محلي دائم (IndexedDB) → عمل دون اتصال + مزامنة تلقائية عند العودة
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // ضروري لموثوقية Firestore داخل WebView على أندرويد/الجوال
  experimentalAutoDetectLongPolling: true,
});

if (environment.useEmulator) {
  connectAuthEmulator(auth, environment.emulator.authUrl, { disableWarnings: true });
  connectFirestoreEmulator(
    db,
    environment.emulator.firestoreHost,
    environment.emulator.firestorePort,
  );
  console.info('%c[مركز أسيد] متصل بمحاكي Firebase المحلي', 'color:#0d6b3f;font-weight:bold');
} else if (!isFirebaseConfigured) {
  console.warn(
    '[مركز أسيد] لم تُملأ إعدادات Firebase بعد — عدّل src/environments/firebase.config.ts',
  );
}

/** هل التطبيق جاهز للعمل (محاكٍ أو إعداد سحابي مكتمل)؟ */
export const firebaseReady = environment.useEmulator || isFirebaseConfigured;
