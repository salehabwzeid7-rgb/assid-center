import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import type { Circle } from './models';

/**
 * الجدولة التلقائية للحلقات:
 * يضمن وجود جلسات «مجدولة» للأيام المتكرّرة القادمة لكل حلقة ضمن أفق ثابت.
 * يُستدعى من اللوحة الرئيسية عند تحميل قائمة الحلقات.
 */
@Injectable({ providedIn: 'root' })
export class SchedulerService {
  private data = inject(DataService);

  private readonly HORIZON_DAYS = 30;
  private running = false;
  /** بصمة آخر مزامنة ناجحة (معرّفات الحلقات + أيامها) لتفادي التكرار */
  private lastSignature = '';

  /** مزامنة كسولة — تتخطّى إن لم تتغيّر الحلقات منذ آخر مرّة. */
  async sync(circles: readonly Circle[]): Promise<void> {
    const scheduled = circles.filter((c) => (c.weekdays?.length ?? 0) > 0);
    if (!scheduled.length) return;

    const signature = scheduled
      .map((c) => `${c.id}:${(c.weekdays ?? []).join('')}:${c.fromTime ?? ''}-${c.toTime ?? ''}`)
      .sort()
      .join('|');
    if (this.running || signature === this.lastSignature) return;

    await this.run(scheduled);
    this.lastSignature = signature;
  }

  /** مزامنة فوريّة لحلقات محدّدة (بعد الإنشاء/التعديل) — تتجاوز البصمة. */
  async forceSync(circles: readonly Circle[]): Promise<void> {
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
