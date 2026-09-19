import { DestroyRef, Injectable, Signal, computed, inject } from '@angular/core';
import { DataService } from './data.service';
import { EMPTY_SOURCE, type ReportSource } from './reports';

/* ==========================================================================
   طبقة جلب بيانات التقارير — **الموضع الوحيد** الذي يعرف من أين تأتي السجلّات.

   طبقة الحساب (`reports.ts`) والواجهة لا تعرفان شيئًا عن Firestore، فاستبدال
   طريقة الجلب لاحقًا لا يمسّ سطرًا واحدًا فيهما. وهذا العزل مقصود ومُثبَت من
   أوّل يوم، لأنّ الاستبدال متوقَّع فعلًا:

   **اليوم:** اشتراك حيّ في المجموعات كاملة (نفس مستمعي بقيّة التطبيق)، ثمّ
   ترشيح المدى داخل طبقة الحساب. لا فهارس مركّبة ولا استعلامات جديدة — أقلّ
   المسارات مخاطرةً، ويستفيد من المستمعات المفتوحة أصلًا ومن ذاكرة Firestore
   المحلّيّة (فالتقارير تعمل دون اتّصال).

   **لاحقًا، إن كبرت البيانات:** يُستبدَل الجسد هنا بقراءة واحدة
   (`getDocs`) بشرطَي مدًى على حقل `date`، مع فهارس مركّبة (`ownerId` + `date`)
   لكلّ مجموعة. عندها تتغيّر واجهة هذا الملفّ من إشارات حيّة إلى وعدٍ يُنتظَر،
   وهو تغيير محصور في مُستهلِك واحد (صفحة التقارير) لا في الحساب.

   ملاحظة أداء قائمة: «تاريخ الطالب الكامل» في التقرير المرجعيّ هو أثقل
   استعمال هنا، لأنّه يمسح كلّ السجلّات بلا حدّ زمنيّ. مقبول بالحجم الحاليّ،
   وهو أوّل ما سيدفع نحو الاستبدال أعلاه.
   ========================================================================== */

/** حزمة التقارير: المصدر المجمَّع + حالة تحميله. */
export interface ReportBundle {
  /** كلّ السجلّات المتاحة — يبقى `EMPTY_SOURCE` حتى يكتمل التحميل. */
  source: Signal<ReportSource>;
  /** `true` ما دام أيّ جزء من البيانات لم يصل بعد. */
  loading: Signal<boolean>;
}

@Injectable({ providedIn: 'root' })
export class ReportDataService {
  private readonly data = inject(DataService);

  /**
   * يفتح الاشتراكات اللازمة ويجمعها في مصدر واحد. يُنادى مرّة واحدة في
   * `constructor` الصفحة، ويُمرَّر `destroyRef` حتى تُغلَق كلّ المستمعات عند
   * مغادرتها.
   */
  bundle(destroyRef: DestroyRef): ReportBundle {
    const circles = this.data.circles(destroyRef);
    const students = this.data.allStudents(destroyRef);
    const sessions = this.data.allSessions(destroyRef);
    const attendance = this.data.allAttendance(destroyRef);
    const recitations = this.data.allRecitations(destroyRef);
    const serd = this.data.allSerds(destroyRef);
    const exams = this.data.allExams(destroyRef);
    const tajweedExams = this.data.allTajweedExams(destroyRef);
    const tajweedResults = this.data.allTajweedExamResults(destroyRef);

    const loading = computed(
      () =>
        circles() === undefined ||
        students() === undefined ||
        sessions() === undefined ||
        attendance() === undefined ||
        recitations() === undefined ||
        serd() === undefined ||
        exams() === undefined ||
        tajweedExams() === undefined ||
        tajweedResults() === undefined,
    );

    const source = computed<ReportSource>(() => {
      // نُبقي المصدر فارغًا حتى تصل كلّ الأجزاء: تقرير محسوب من بيانات ناقصة
      // يعرض أرقامًا تنقص ثمّ تقفز أمام المستخدم، وقد تُصدَّر صورةً في أثناء ذلك.
      if (loading()) return EMPTY_SOURCE;
      return {
        circles: circles()!,
        students: students()!,
        sessions: sessions()!,
        attendance: attendance()!,
        recitations: recitations()!,
        serd: serd()!,
        exams: exams()!,
        tajweedExams: tajweedExams()!,
        tajweedResults: tajweedResults()!,
      };
    });

    return { source, loading };
  }
}
