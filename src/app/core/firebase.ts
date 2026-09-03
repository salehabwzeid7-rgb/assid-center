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
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  type FirestoreSettings,
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

/**
 * تخزين محلي دائم (IndexedDB) متعدّد التبويبات → عمل كامل دون اتصال ومزامنة
 * لحظيّة تلقائية عند عودة الشبكة. عند تعذّر IndexedDB (تصفّح خاصّ/تخزين محجوب)
 * نرجع إلى ذاكرة الجلسة حتى لا يتعطّل التطبيق.
 */
function makeDb(): Firestore {
  // ضروري لموثوقية Firestore داخل WebView على أندرويد/الجوال
  const base: FirestoreSettings = { experimentalAutoDetectLongPolling: true };
  try {
    return initializeFirestore(firebaseApp, {
      ...base,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('[مركز أسيد] تعذّر تفعيل التخزين المحلي الدائم — العمل بذاكرة الجلسة فقط', e);
    return initializeFirestore(firebaseApp, { ...base, localCache: memoryLocalCache() });
  }
}

export const db: Firestore = makeDb();

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
