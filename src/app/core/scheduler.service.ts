import { Injectable, inject } from '@angular/core';
import { App as CapApp } from '@capacitor/app';
import { DataService, today } from './data.service';
import type { Circle } from './models';

/**
 * الجدولة التلقائية للحلقات — تحافظ على أفق شهريّ مُتدحرج ثابت (٣٠ يومًا
 * قادمة) من جلسات «مجدولة» لكلّ حلقة، فلا يقصر الأفق عن شهر أبدًا: كل يوم
 * يمرّ وتُغلق جلسته يُضاف تلقائيًّا يوم جديد في نهاية الجدول ليعوّضه.
 * يُستدعى من اللوحة الرئيسية/الحلقات/الجدول عند تحميل قائمة الحلقات، وأيضًا
 * فور العودة إلى التطبيق (استئناف من الخلفيّة) حتى لا يتجمّد الأفق عند
 * تاريخ الجلسة السابقة إن ظلّ التطبيق مفتوحًا في الخلفيّة عبر منتصف الليل.
 */
@Injectable({ providedIn: 'root' })
export class SchedulerService {
  private data = inject(DataService);

  private readonly HORIZON_DAYS = 30;
  private running = false;
  /** بصمة آخر مزامنة ناجحة (اليوم الحاليّ + معرّفات الحلقات وأيامها) */
  private lastSignature = '';
  /** آخر قائمة حلقات مُمرَّرة — لإعادة المزامنة عند الاستئناف دون مُستدعٍ خارجيّ */
  private lastCircles: readonly Circle[] = [];
  /** آخر تاريخ فُحص فيه تغيّر اليوم (للحارس الدوريّ أدناه) */
  private lastCheckedDate = today();

  constructor() {
    // العودة من الخلفيّة (أندرويد) — الحالة الشائعة لتطبيق أُغلق ثمّ أُعيد فتحه لاحقًا.
    CapApp.addListener('resume', () => this.recheckForNewDay()).catch(() => {
      /* لا شيء على الويب */
    });

    // حارس دوريّ إضافيّ: حتى لو ظلّ التطبيق مفتوحًا في المقدّمة دون أيّ استئناف
    // (تبويب ويب لم يُغلَق ولم يُخفَ) عبر منتصف الليل، يُعاد فحص الأفق كلّ نصف
    // ساعة فور تغيّر التاريخ الفعليّ — فلا يبقى الأفق مُتجمّدًا «عند أمس» أبدًا.
    setInterval(() => this.recheckForNewDay(), 30 * 60 * 1000);
  }

  /** يُعاد استدعاؤه من الاستئناف والحارس الدوريّ — يُعيد المزامنة فقط إن تبدّل اليوم فعلًا. */
  private recheckForNewDay(): void {
    const t = today();
    if (t === this.lastCheckedDate) return;
    this.lastCheckedDate = t;
    this.lastSignature = ''; // يوم جديد → أفق جديد، حتّى لو لم تتغيّر إعدادات الحلقات
    if (this.lastCircles.length) void this.sync(this.lastCircles);
  }

  /** مزامنة كسولة — تتخطّى إن لم يتغيّر التاريخ ولا إعدادات الحلقات منذ آخر مرّة. */
  async sync(circles: readonly Circle[]): Promise<void> {
    this.lastCircles = circles;
    const scheduled = circles.filter((c) => (c.weekdays?.length ?? 0) > 0);
    if (!scheduled.length) return;

    // اليوم الحاليّ جزء من البصمة عمدًا: نفس إعدادات الحلقات في يوم جديد
    // يعني أفقًا مختلفًا (يبدأ من اليوم الجديد) ويستحقّ مزامنة جديدة.
    const signature = [
      today(),
      ...scheduled
        .map((c) => `${c.id}:${(c.weekdays ?? []).join('')}:${c.fromTime ?? ''}-${c.toTime ?? ''}`)
        .sort(),
    ].join('|');
    if (this.running || signature === this.lastSignature) return;

    await this.run(scheduled);
    this.lastSignature = signature;
  }

  /** مزامنة فوريّة لحلقات محدّدة (بعد الإنشاء/التعديل) — تتجاوز البصمة. */
  async forceSync(circles: readonly Circle[]): Promise<void> {
    this.lastCircles = circles;
    const scheduled = circles.filter((c) => (c.weekdays?.length ?? 0) > 0);
    if (scheduled.length) await this.run(scheduled);
    this.lastSignature = '';
  }

  private async run(circles: readonly Circle[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const circle of circles) {
        await this.data.ensureScheduledSessions(circle, this.HORIZON_DAYS);
      }
    } catch (err) {
      console.error('تعذّرت الجدولة التلقائية:', err);
    } finally {
      this.running = false;
    }
  }
}
