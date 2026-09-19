import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  customPeriod,
  dayPeriod,
  monthPeriod,
  periodLabel,
  shiftPeriod,
  todayISO,
  weekPeriod,
  type Period,
  type PeriodKind,
} from '../core/report-period';

/* ==========================================================================
   مُنتقي المدى الزمنيّ — حالة + عرض، مستقلّان.

   `PeriodState` صنف عاديّ (لا مكوّن) يحمل الحالة ويشتقّ المدى. يُنشئه كلّ
   مُستهلِك لنفسه، فتكون لوحة المعلّم ونافذة إنشاء التقرير مدَياهما مستقلّان
   بلا تداخل، مع منطق اشتقاق واحد لا نسختين تتباعدان.
   ========================================================================== */

export class PeriodState {
  readonly kind = signal<PeriodKind>('month');
  /** تاريخ مرجعيّ داخل المدى — تُشتقّ منه حدوده. */
  readonly anchor = signal(todayISO());
  readonly from = signal(todayISO().slice(0, 8) + '01');
  readonly to = signal(todayISO());

  readonly period = computed<Period>(() => {
    const a = this.anchor();
    switch (this.kind()) {
      case 'day':
        return dayPeriod(a);
      case 'week':
        return weekPeriod(a);
      case 'year':
        return { kind: 'year', from: `${a.slice(0, 4)}-01-01`, to: `${a.slice(0, 4)}-12-31` };
      case 'custom':
        return customPeriod(this.from(), this.to());
      default:
        return monthPeriod(a.slice(0, 7));
    }
  });

  readonly label = computed(() => periodLabel(this.period()));

  step(delta: number): void {
    this.anchor.set(shiftPeriod(this.period(), delta).from);
  }

  /** نسخة مستقلّة بنفس الحالة — لفتح النافذة مبدئيًّا على مدى اللوحة. */
  cloneFrom(other: PeriodState): void {
    this.kind.set(other.kind());
    this.anchor.set(other.anchor());
    this.from.set(other.from());
    this.to.set(other.to());
  }
}

@Component({
  selector: 'app-period-picker',
  imports: [FormsModule],
  template: `
    <div class="chips">
      @for (k of kinds; track k.id) {
        <button
          type="button"
          class="chip"
          [class.active]="state().kind() === k.id"
          (click)="state().kind.set(k.id)"
        >
          {{ k.label }}
        </button>
      }
    </div>

    @if (state().kind() === 'custom') {
      <div class="field-row" style="margin-top:10px">
        <div class="field">
          <label [attr.for]="idPrefix() + '-from'">من</label>
          <input
            [id]="idPrefix() + '-from'"
            type="date"
            [ngModel]="state().from()"
            (ngModelChange)="$event && state().from.set($event)"
          />
        </div>
        <div class="field">
          <label [attr.for]="idPrefix() + '-to'">إلى</label>
          <input
            [id]="idPrefix() + '-to'"
            type="date"
            [ngModel]="state().to()"
            (ngModelChange)="$event && state().to.set($event)"
          />
        </div>
      </div>
    } @else {
      <div class="pp-nav">
        <button type="button" class="chip" (click)="state().step(-1)" aria-label="السابق">›</button>
        <span class="pp-label">{{ state().label() }}</span>
        <button type="button" class="chip" (click)="state().step(1)" aria-label="التالي">‹</button>
      </div>
    }
  `,
  styles: [
    `
      .pp-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
      }
      .pp-label {
        flex: 1;
        text-align: center;
        font-weight: 800;
        font-size: 0.95rem;
      }
    `,
  ],
})
export class PeriodPickerComponent {
  readonly state = input.required<PeriodState>();
  /** بادئة مُعرّفات الحقول — تمنع تكرار `id` حين يظهر المُنتقيان معًا. */
  readonly idPrefix = input<string>('pp');

  readonly kinds: { id: PeriodKind; label: string }[] = [
    { id: 'day', label: 'يوم' },
    { id: 'week', label: 'أسبوع' },
    { id: 'month', label: 'شهر' },
    { id: 'year', label: 'سنة' },
    { id: 'custom', label: 'مخصّص' },
  ];
}
