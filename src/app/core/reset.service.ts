import { Injectable, inject } from '@angular/core';
import { signOut } from 'firebase/auth';
import { doc, deleteDoc, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { auth, db } from './firebase';
import { TEACHERS } from './models';
import { DataService } from './data.service';

/**
 * مسح شامل لبيانات التطبيق — لمرحلة الاختبار فقط.
 * يشمل: Firestore (كلّ مجموعات البيانات) + ملفّ المعلّم + التخزين المحلّيّ
 * (localStorage / sessionStorage) + ذاكرة Firestore المحلّيّة (IndexedDB).
 * لا يحذف حساب المصادقة نفسه — يُسجَّل الخروج فقط، ويمكن الدخول لاحقًا بحساب نظيف.
 */
@Injectable({ providedIn: 'root' })
export class ResetService {
  private data = inject(DataService);

  async wipeEverything(): Promise<number> {
    // ١) كلّ مستندات مجموعات البيانات
    const deleted = await this.data.wipeAllData();

    // ٢) ملفّ المعلّم الحاليّ
    const u = auth.currentUser;
    if (u) {
      try {
        await deleteDoc(doc(db, TEACHERS, u.uid));
      } catch {
        /* لا بأس */
      }
    }

    // ٣) تسجيل الخروج
    try {
      await signOut(auth);
    } catch {
      /* لا بأس */
    }

    // ٤) التخزين المحلّيّ على الجهاز
    try {
      localStorage.clear();
    } catch {
      /* محجوب */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* محجوب */
    }

    // ٥) قاعدة البيانات المحلّيّة (IndexedDB cache) — يجب إنهاء db أوّلًا.
    //    بعد هذه الخطوة يصبح db غير صالح، لذا تُنفَّذ أخيرًا ثمّ تُعاد الصفحة.
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch {
      /* تبويبات أخرى مفتوحة أو الذاكرة قيد الاستخدام — إعادة التحميل تكفي */
    }

    return deleted;
  }
}
