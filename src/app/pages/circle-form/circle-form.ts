import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { SchedulerService } from '../../core/scheduler.service';
import {
  CIRCLE_TYPE_LABELS,
  CIRCLE_TYPE_ORDER,
  TAJWEED_LEVEL_LABELS,
  TAJWEED_LEVEL_ORDER,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type CircleType,
  type TajweedLevel,
} from '../../core/models';
import { isValidHHMM, minutesOfDay } from '../../core/time';
import { PageHeaderComponent } from '../../shared/page-header';
import { TimeRangePickerComponent } from '../../shared/time-range-picker';

@Component({
  selector: 'app-circle-form',
  imports: [FormsModule, PageHeaderComponent, TimeRangePickerComponent],
  template: `
    <app-page-header [title]="editing() ? 'تعديل الحلقة' : 'حلقة جديدة'" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">اسم الحلقة *</label>
          <input id="name" name="name" [(ngModel)]="name" placeholder="مثال: حلقة الإمام نافع" />
        </div>

        <!-- نوع الحلقة -->
        <div class="field">
          <label>نوع الحلقة *</label>
          <div class="type-grid">
            @for (t of typeOrder; track t) {
              <button
                type="button"
                class="type-opt"
                [class.active]="type === t"
                (click)="pickType(t)"
              >
                <span class="type-ico" aria-hidden="true">
                  @if (t === 'memorization') {
                    <!-- مصحف مفتوح — الحفظ -->
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M12 6c-1.9-1.4-4.4-2.1-7.3-2.1v14.2c2.9 0 5.4.7 7.3 2.1 1.9-1.4 4.4-2.1 7.3-2.1V3.9C16.4 3.9 13.9 4.6 12 6Z"
                      />
                      <path d="M12 6v14.2" />
                    </svg>
                  } @else {
                    <!-- علامة مصحف — التجويد والتلاوة -->
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.8L5.5 20.5v-16a1 1 0 0 1 1-1Z" />
                      <path d="M9 8h6M9 11.5h4" />
                    </svg>
                  }
                </span>
                <span>{{ typeLabels[t] }}</span>
              </button>
            }
          </div>
        </div>

        <!-- مستوى حلقة التجويد -->
        @if (type === 'tajweed') {
          <div class="field">
            <label>مستوى حلقة التجويد *</label>
            <div class="lvl-grid">
              @for (l of levelOrder; track l) {
                <button
                  type="button"
                  class="lvl-opt"
                  [class.active]="tajweedLevel === l"
                  (click)="pickLevel(l)"
                >
                  {{ levelLabels[l] }}
                </button>
              }
            </div>
            @if (tajweedLevel) {
              <p class="hint" style="margin:8px 0 0">
                يظهر اسم الحلقة وجدولها بالمستوى: «{{ autoName() }}».
              </p>
            }
          </div>
        }

        <!-- أيام التكرار -->
        <div class="field">
          <label>أيام الحلقة الأسبوعية *</label>
          <p class="hint" style="margin:0 0 8px">
            تتكرّر الحلقة في هذه الأيام وتُجدوَل حصصها تلقائيًّا.
          </p>
          <div class="day-grid">
            @for (d of weekdayOrder; track d) {
              <button
                type="button"
                class="day-opt"
                [class.active]="days().includes(d)"
                (click)="toggleDay(d)"
              >
                {{ weekdayLabels[d] }}
              </button>
            }
          </div>
        </div>

        <!-- نافذة وقت الحصّة -->
        <div class="field">
          <label>وقت الحصّة *</label>
          <p class="hint" style="margin:0 0 8px">
            تُفتح الحصّة تلقائيًّا داخل هذا الموعد فقط، وتُقفل خارجه.
          </p>
          <app-time-range [(from)]="fromTime" [(to)]="toTime" />
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving()">
          {{ saving() ? 'جارٍ الحفظ…' : editing() ? 'حفظ التعديلات' : 'حفظ الحلقة' }}
        </button>
      </form>

      @if (editing()) {
        <div class="section-title">منطقة الخطر</div>
        <div class="card danger-zone">
          <p class="hint" style="margin-top:0">
            حذف نهائيّ للحلقة وكلّ حصصها وسجلّات الحضور والتسميع المرتبطة بها — من هذا الجهاز ومن
            Firebase معًا. لا يُحذف الطلاب (تُزال الحلقة من قوائمهم فقط). لا يمكن التراجع.
          </p>
          <button
            class="btn btn-danger btn-block"
            type="button"
            [disabled]="deleting()"
            (click)="remove()"
          >
            {{ deleting() ? 'جارٍ الحذف…' : '🗑️ حذف الحلقة نهائيًّا' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .type-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .type-opt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 16px 10px;
        border: 2px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        font-weight: 700;
        font-size: 0.92rem;
        cursor: pointer;
        transition:
          border-color var(--ease),
          box-shadow var(--ease);
      }
      .type-opt.active {
        border-color: var(--gold);
        box-shadow: var(--ring);
      }
      .type-opt.active .type-ico {
        color: var(--gold-deep);
      }
      .type-ico {
        color: var(--green);
        line-height: 0;
      }
      .type-ico svg {
        width: 26px;
        height: 26px;
      }
      .lvl-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .lvl-opt {
        padding: 12px 4px;
        border: 1.5px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        color: var(--text-soft);
        font-weight: 700;
        font-size: 0.86rem;
        cursor: pointer;
        transition: all var(--ease);
      }
      .lvl-opt.active {
        border-color: var(--gold);
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .day-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }
      .day-opt {
        padding: 10px 4px;
        border: 1.5px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        color: var(--text-soft);
        font-weight: 700;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all var(--ease);
      }
      .day-opt.active {
        border-color: var(--green);
        background: var(--green-tint);
        color: var(--green);
      }
      .danger-zone {
        border: 1px solid var(--danger);
      }
    `,
  ],
})
export class CircleFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private scheduler = inject(SchedulerService);
  private cdr = inject(ChangeDetectorRef);

  readonly id = this.route.snapshot.paramMap.get('id') ?? undefined;
  readonly editing = signal(false);

  readonly typeLabels = CIRCLE_TYPE_LABELS;
  readonly typeOrder = CIRCLE_TYPE_ORDER;
  readonly levelLabels = TAJWEED_LEVEL_LABELS;
  readonly levelOrder = TAJWEED_LEVEL_ORDER;
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly weekdayOrder = WEEKDAY_ORDER;

  name = '';
  type: CircleType | null = null;
  tajweedLevel: TajweedLevel | null = null;
  readonly days = signal<number[]>([]);
  fromTime = '';
  toTime = '';
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly error = signal('');

  /** آخر اسم مُقترَح تلقائيًّا — لمعرفة إن كان المعلّم عدّل الاسم يدويًّا. */
  private lastAutoName = '';

  /** الاسم المُقترَح حسب المستوى: «حلقة تجويد تمهيدية». */
  autoName(): string {
    return this.tajweedLevel ? `حلقة تجويد ${this.levelLabels[this.tajweedLevel]}` : '';
  }

  pickType(t: CircleType): void {
    this.type = t;
    if (t !== 'tajweed') this.tajweedLevel = null;
  }

  pickLevel(l: TajweedLevel): void {
    this.tajweedLevel = l;
    // يُطبَّق الاسم تلقائيًّا ما لم يكن المعلّم قد كتب اسمًا خاصًّا
    const auto = this.autoName();
    if (this.name.trim() === '' || this.name.trim() === this.lastAutoName) {
      this.name = auto;
      this.lastAutoName = auto;
    }
  }

  toggleDay(d: number): void {
    const cur = this.days();
    this.days.set(cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b));
  }

  async ngOnInit(): Promise<void> {
    if (!this.id) return;
    this.editing.set(true);
    const c = await this.data.getCircle(this.id);
    if (c) {
      this.name = c.name;
      this.type = c.type ?? null;
      this.tajweedLevel = c.tajweedLevel ?? null;
      this.days.set(c.weekdays ?? []);
      this.fromTime = c.fromTime ?? '';
      this.toTime = c.toTime ?? '';
    } else {
      this.error.set('لم يتم العثور على الحلقة');
    }
    this.cdr.markForCheck();
  }

  async submit(): Promise<void> {
    if (!this.name.trim()) return void this.error.set('أدخل اسم الحلقة');
    if (!this.type) return void this.error.set('اختر نوع الحلقة');
    if (this.type === 'tajweed' && !this.tajweedLevel)
      return void this.error.set('اختر مستوى حلقة التجويد');
    if (this.days().length === 0)
      return void this.error.set('اختر يومًا واحدًا على الأقل لتكرار الحلقة');
    if (
      !isValidHHMM(this.fromTime) ||
      !isValidHHMM(this.toTime) ||
      minutesOfDay(this.toTime) <= minutesOfDay(this.fromTime)
    )
      return void this.error.set('حدّد وقت بداية ونهاية صحيحين للحصّة');

    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.name.trim(),
      type: this.type,
      tajweedLevel: this.type === 'tajweed' ? (this.tajweedLevel ?? undefined) : undefined,
      weekdays: this.days(),
      fromTime: this.fromTime,
      toTime: this.toTime,
    };
    const editing = this.editing() && this.id;
    const res = await this.notify.run(
      () =>
        editing
          ? this.data.updateCircle(this.id!, payload).then(() => this.id!)
          : this.data.addCircle(payload),
      { success: editing ? 'حُفظت التعديلات' : 'أُنشئت الحلقة', error: 'تعذّر حفظ الحلقة' },
    );
    this.saving.set(false);
    if (!res) return;

    // توليد الحصص المجدولة فورًا وفق أيام التكرار
    await this.scheduler.forceSync([
      {
        id: res,
        name: payload.name,
        type: payload.type,
        weekdays: payload.weekdays,
        fromTime: payload.fromTime,
        toTime: payload.toTime,
        createdAt: Date.now(),
      },
    ]);

    // فتح واجهة الحلقة المتخصّصة حسب النوع
    await this.router.navigate(['/circle', res], { queryParams: { type: this.type } });
  }

  async remove(): Promise<void> {
    if (!this.id || this.deleting()) return;
    const ok = await this.notify.confirm('حذف هذه الحلقة نهائيًّا؟', {
      message:
        'سيُحذف نهائيًّا: الحلقة، وكلّ حصصها، وسجلّات الحضور والتسميع المرتبطة بها — من هذا ' +
        'الجهاز ومن Firebase معًا. لا يُحذف الطلاب (تُزال الحلقة من قوائمهم فقط). لا يمكن التراجع.',
      confirmText: 'حذف نهائيّ',
      danger: true,
    });
    if (!ok) return;
    this.deleting.set(true);
    const done = await this.notify.run(() => this.data.deleteCircle(this.id!).then(() => true), {
      loading: 'جارٍ حذف الحلقة…',
      success: 'حُذفت الحلقة نهائيًّا',
      error: 'تعذّر حذف الحلقة — أعِد المحاولة',
    });
    this.deleting.set(false);
    if (done) await this.router.navigateByUrl('/circles');
  }
}
