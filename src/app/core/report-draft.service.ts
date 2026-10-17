import { Injectable } from '@angular/core';
import type { ReportContent } from './report-content';
import type { ReportMarks } from './report-marks';
import type { ReportAudience } from './report-text';
import type { PeriodSnapshot } from './report-period';

/* ==========================================================================
   مسودّة التقرير — تبقى على الجهاز حتى ينشئ المعلّم تقريرًا أو يمسحها بنفسه.

   المشكلة التي تحلّها: المعلّم لا يرى بيانات الطالب وهو يُنشئ التقرير، فكان يخرج لينظر
   ثمّ يعود فيجد كلّ ما اختاره قد ضاع. الآن تُحفَظ حالة الصفحة والنافذة (المدى، الحلقات،
   الطلّاب، محتوى التقرير، الجمهور، النصّ المعدَّل، علامات المقرر والإنذار) في
   `localStorage`، وتُستعاد عند العودة — ولو أُغلق التطبيق بينهما.

   مفتاح مخزَّن لكلّ جهاز لا لكلّ حساب: التقارير تُنشأ داخل حساب مسجَّل واحد، وتسجيل
   الخروج يمسح المسودّة (راجع `clearOnSignOut` في الصفحة) كي لا تتسرّب أسماء حساب لآخر.
   ========================================================================== */

/** حالة نافذة «إنشاء تقرير». */
export interface DialogDraft {
  period: PeriodSnapshot;
  /** `null` = لم يضبط المعلّم الحلقات صراحةً (تُؤخَذ من الصفحة). */
  circleIds: string[] | null;
  /** `null` = كلّ طلّاب الحلقات المختارة. */
  studentIds: string[] | null;
  audience: ReportAudience;
  subject: 'circle' | 'students';
  /** `null` = الافتراضيّ المشتقّ من العلامات ومصدر فتح النافذة. */
  content: ReportContent | null;
  /** نصّ عدّله المعلّم يدويًّا، مقيَّد بمفتاح حالته. */
  textOverride: { key: string; text: string } | null;
  /** علامات المقرر والإنذار (مؤقّتة — تزول مع المسودّة بعد إنشاء التقرير). */
  marks: ReportMarks;
}

/** حالة صفحة التقارير كلّها. */
export interface ReportDraft {
  v: 1;
  period: PeriodSnapshot;
  circleIds: string[] | null;
  studentIds: string[] | null;
  /** هل كانت النافذة مفتوحة وقت الحفظ — تُعاد فتحها عند العودة من ملفّ الطالب. */
  dialogOpen: boolean;
  dialog: DialogDraft | null;
  savedAt: number;
}

const KEY = 'almaher:report-draft:v1';

@Injectable({ providedIn: 'root' })
export class ReportDraftService {
  load(): ReportDraft | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as ReportDraft;
      return d && d.v === 1 ? d : null;
    } catch {
      return null;
    }
  }

  save(d: ReportDraft): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* التخزين محجوب أو ممتلئ — المسودّة ميزة راحة لا يتوقّف عليها شيء. */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* محجوب */
    }
  }
}
