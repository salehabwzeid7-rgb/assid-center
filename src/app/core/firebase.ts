/* ==========================================================================
   تهيئة Firebase — مركز أَصيد
   المصادقة (Auth) + قاعدة بيانات Firestore مع مزامنة لحظية ودعم العمل دون اتصال

   في وضع المعاينة (environment.preview) لا تُهيَّأ Firebase إطلاقًا،
   ويعمل التطبيق ببيانات تجريبية محلية (انظر preview-db.ts).
   ========================================================================== */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;

if (!environment.preview) {
  _app = initializeApp(environment.firebase);
  _auth = getAuth(_app);
  _db = initializeFirestore(_app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

/** كائنات Firebase — غير معرّفة في وضع المعاينة، ولا تُستخدَم حينها. */
export const firebaseApp = _app as FirebaseApp;
export const auth = _auth as Auth;
export const db = _db as Firestore;
