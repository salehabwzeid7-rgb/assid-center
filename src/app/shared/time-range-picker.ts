import { Component, OnInit, computed, model, signal } from '@angular/core';
import {
  MINUTE_STEPS,
  fmt12,
  isValidHHMM,
  minutesOfDay,
  to12,
  to24,
  type Clock12,
  type Period,
} from '../core/time';

/**
 * منتقي مدى زمنيّ مزدوج (من / إلى):
 *  - الساعة 1..12
 *  - الدقائق بخطوات دقيقة: 00 / 15 / 30 / 45
 *  - الفترة: صباحي (ص) / مسائي (م)
 * القيمتان الخارجيتان دائمًا «HH:MM» بصيغة 24 ساعة.
 */
@Component({
  selector: 'app-time-range',
  template: `
    <div class="trp">
      @for (side of sides; track side.key) {
        <div class="trp-row">
          <div class="trp-top">
            <span class="trp-cap">{{ side.label }}</span>
            <span class="trp-val">{{ preview(side.key) }}</span>
          </div>
          <div class="trp-grid">
            <label class="trp-sub">الساعة</label>
            <select
              class="trp-hour"
              [value]="clock(side.key).h"
              (change)="set(side.key, 'h', +asValue($event))"
              [attr.aria-label]="'ساعة ' + side.label"
            >
              @for (h of hours; track h) {
                <option [value]="h">{{ h }}</option>
              }
            </select>

            <label class="trp-sub">الدقائق</label>
            <div class="trp-chips">
              @for (m of minutes; track m) {
                <button
                  type="button"
                  [class.active]="clock(side.key).m === m"
                  (click)="set(side.key, 'm', m)"
                >
                  {{ pad(m) }}
                </button>
              }
            </div>

            <label class="trp-sub">الفترة</label>
            <div class="trp-chips trp-period">
              <button
                type="button"
                [class.active]="clock(side.key).period === 'am'"
                (click)="set(side.key, 'period', 'am')"
              >
                ص
              </button>
              <button
                type="button"
                [class.active]="clock(side.key).period === 'pm'"
                (click)="set(side.key, 'period', 'pm')"
              >
                م
              </button>
            </div>
          </div>
        </div>
      }

      @if (error()) {
        <p class="trp-err">{{ error() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .trp {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .trp-row {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 12px;
        background: var(--surface);
      }
      .trp-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .trp-cap {
        font-weight: 800;
        font-size: 0.95rem;
      }
      .trp-val {
        font-weight: 700;
        color: var(--green);
        font-size: 1.05rem;
      }
      .trp-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 8px 10px;
      }
      .trp-sub {
        font-size: 0.8rem;
        color: var(--text-soft);
        font-weight: 700;
      }
      .trp-hour {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
      }
      .trp-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .trp-chips button {
        flex: 1;
        min-width: 44px;
        padding: 9px 4px;
        border: 1.5px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        color: var(--text-soft);
        font-weight: 700;
        cursor: pointer;
        transition: all var(--ease);
      }
      .trp-chips button.active {
        border-color: var(--green);
        background: var(--green-tint);
        color: var(--green);
      }
      .trp-period button {
        flex: 1;
      }
      .trp-err {
        margin: 0;
        color: var(--danger);
        font-size: 0.85rem;
        font-weight: 700;
      }
    `,
  ],
})
export class TimeRangePickerComponent implements OnInit {
  /** «HH:MM» 24h */
  readonly from = model<string>('');
  readonly to = model<string>('');

  readonly hours = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly minutes = [...MINUTE_STEPS];
  readonly pad = (n: number) => String(n).padStart(2, '0');
  readonly sides = [
    { key: 'from' as const, label: 'من' },
    { key: 'to' as const, label: 'إلى' },
  ];

  private readonly f = signal<Clock12>({ h: 6, m: 0, period: 'pm' });
  private readonly t = signal<Clock12>({ h: 7, m: 0, period: 'pm' });

  readonly error = computed(() => {
    const a = minutesOfDay(to24(this.f()));
    const b = minutesOfDay(to24(this.t()));
    return b <= a ? 'وقت النهاية يجب أن يكون بعد وقت البداية.' : '';
  });

  ngOnInit(): void {
    const fv = this.from();
    const tv = this.to();
    if (isValidHHMM(fv)) this.f.set(to12(fv));
    else this.from.set(to24(this.f()));
    if (isValidHHMM(tv)) this.t.set(to12(tv));
    else this.to.set(to24(this.t()));
  }

  clock(key: 'from' | 'to'): Clock12 {
    return key === 'from' ? this.f() : this.t();
  }
  preview(key: 'from' | 'to'): string {
    return fmt12(to24(this.clock(key)));
  }
  asValue(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }

  set(key: 'from' | 'to', part: 'h' | 'm' | 'period', value: number | Period): void {
    const sig = key === 'from' ? this.f : this.t;
    sig.update((c) => ({ ...c, [part]: value }));
    if (key === 'from') this.from.set(to24(this.f()));
    else this.to.set(to24(this.t()));
  }
}
