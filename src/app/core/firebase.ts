/* ==========================================================================
   تهيئة Firebase — مركز أسيد
   المصادقة (Auth) + قاعدة بيانات Firestore مع مزامنة لحظية ودعم العمل دون اتصال.

   في التطوير (environment.useEmulator) يتصل التطبيق بـ Firebase Emulator Suite
   المحلي — مصادقة و Firestore حقيقيان على الجهاز. شغّل: npm run dev
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

export const firebaseApp: FirebaseApp = initializeApp(environment.firebase);

export const auth: Auth = getAuth(firebaseApp);

export const db: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (environment.useEmulator) {
  connectAuthEmulator(auth, environment.emulator.authUrl, { disableWarnings: true });
  connectFirestoreEmulator(
    db,
    environment.emulator.firestoreHost,
    environment.emulator.firestorePort,
  );
  console.info('%c[مركز أسيد] متصل بمحاكي Firebase المحلي', 'color:#0d5c3f;font-weight:bold');
}
