import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { circleLabel, type Student } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';
import { QuranTrackerComponent } from '../../shared/quran-tracker';

/**
 * قسم «الطلاب» — صفحة مخصّصة بالكامل لإدارة الطلاب:
 *  · قائمة بكلّ الطلاب مع بحث فوريّ، وكلّ صفّ يفتح ملفّ الطالب.
 *  · زرّ عائم «＋ طالب» يفتح نافذة منبثقة تحوي كلّ حقول بيانات الطالب.
 */
@Component({
  selector: 'app-students',
  imports: [FormsModule, RouterLink, PageHeaderComponent, QuranTrackerComponent],
  template: `
    <app-page-header title="الطلاب" [back]="false" />

    <div class="page">
      <div class="row-between section-title">
        <span>كلّ الطلاب ({{ total() }})</span>
        @if (total() > 0) {
          <span class="muted">{{ activeCount() }} نشط</span>
        }
      </div>

      @if (students() === undefined) {
        <div class="spinner"></div>
      } @else if (total() === 0) {
        <div class="empty">
          <span class="icon">👤</span>
          لم يُسجَّل أيّ طالب بعد.
          <div style="margin-top:12px">
            <button class="btn btn-primary" type="button" (click)="openAdd()">＋ إضافة طالب</button>
          </div>
        </div>
      } @else {
        @if (total() > 5) {
          <div class="field" style="margin-bottom:10px">
            <input
              name="q"
              [ngModel]="q()"
              (ngModelChange)="q.set($event)"
              placeholder="ابحث باسم الطالب…"
              autocomplete="off"
              inputmode="search"
            />
          </div>
        }

        @if (filtered().length === 0) {
          <p class="muted" style="margin:2px">لا نتائج مطابقة للبحث.</p>
        } @else {
          @for (s of filtered(); track s.id) {
            <a
              class="list-item"
              [routerLink]="['/student', s.id]"
              [style.opacity]="s.active ? 1 : 0.55"
            >
              <span class="avatar">{{ s.name.charAt(0) }}</span>
              <span class="grow">
                <span class="primary">{{ s.name }}</span>
                <span class="secondary">
                  {{ circleLabelFor(s.circleId) }}
                  @if (s.level) {
                    · {{ s.level }}
                  }
                  @if (!s.active) {
                    · غير نشط
                  }
                </span>
              </span>
              <span class="chevron">‹</span>
            </a>
          }
        }
      }
    </div>

    <button class="fab" type="button" (click)="openAdd()">＋ طالب</button>

    <!-- نافذة إضافة طالب -->
    @if (adding()) {
      <div class="modal-backdrop" (click)="closeAdd()">
        <form class="modal add-modal" (click)="$event.stopPropagation()" (ngSubmit)="submitAdd()">
          <h3>إضافة طالب جديد</h3>

          @if (circles() !== undefined && circles()!.length === 0) {
            <p>لا توجد حلقات بعد — أنشئ حلقة أولًا لتتمكّن من تسجيل الطلاب.</p>
            <div class="modal-actions">
              <button class="btn btn-ghost" type="button" (click)="closeAdd()">إغلاق</button>
              <a class="btn btn-primary" routerLink="/circles/new">إنشاء حلقة</a>
            </div>
          } @else {
            <div class="field">
              <label for="m-name">اسم الطالب *</label>
              <input #nameInput id="m-name" name="m-name" [(ngModel)]="m.name" autocomplete="off" />
            </div>

            <div class="field">
              <label for="m-circle">الحلقة *</label>
              <select id="m-circle" name="m-circle" [(ngModel)]="m.circleId">
                <option value="" disabled>اختر الحلقة</option>
                @for (c of circles(); track c.id) {
                  <option [value]="c.id">{{ circleLabel(c) }}</option>
                }
              </select>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="m-level">المستوى / الصف</label>
                <input
                  id="m-level"
                  name="m-level"
                  [(ngModel)]="m.level"
                  placeholder="مثال: السادس"
                />
              </div>
              <div class="field">
                <label for="m-birth">تاريخ الميلاد</label>
                <input id="m-birth" name="m-birth" type="date" [(ngModel)]="m.birthDate" />
              </div>
            </div>

            <div class="field">
              <label for="m-guardian">جوال ولي الأمر</label>
              <input
                id="m-guardian"
                name="m-guardian"
                type="tel"
                inputmode="tel"
                dir="ltr"
                [(ngModel)]="m.guardianPhone"
              />
            </div>

            <div class="field">
              <label>المقرّر الحالي (المحفوظ من القرآن)</label>
              <app-quran-tracker [(value)]="m.memorizedSurahs" />
            </div>

            <div class="field">
              <label for="m-plan">ملاحظة على الخطّة (اختياري)</label>
              <textarea
                id="m-plan"
                name="m-plan"
                [(ngModel)]="m.currentPlan"
                placeholder="مثال: التركيز على إتقان جزء تبارك"
              ></textarea>
            </div>

            @if (error()) {
              <div class="alert alert-error">{{ error() }}</div>
            }

            <div class="modal-actions">
              <button class="btn btn-ghost" type="button" (click)="closeAdd()">إلغاء</button>
              <button class="btn btn-primary" type="submit" [disabled]="saving()">
                {{ saving() ? 'جارٍ الحفظ…' : 'إضافة الطالب' }}
              </button>
            </div>
          }
        </form>
      </div>
    }
  `,
  styles: [
    `
      .add-modal {
        max-width: 400px;
        max-height: 88vh;
        overflow-y: auto;
        text-align: start;
      }
      .add-modal h3 {
        margin-bottom: 14px;
      }
      .add-modal .modal-actions {
        margin-top: 8px;
      }
    `,
  ],
})
export class StudentsPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private notify = inject(NotifyService);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly circleLabel = circleLabel;
  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);

  readonly total = computed(() => this.students()?.length ?? 0);
  readonly activeCount = computed(() => this.students()?.filter((s) => s.active).length ?? 0);

  readonly q = signal('');
  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  m = {
    name: '',
    circleId: '',
    level: '',
    birthDate: '',
    guardianPhone: '',
    currentPlan: '',
    memorizedSurahs: [] as number[],
  };

  constructor() {
    // تركيز حقل الاسم فور فتح النافذة
    effect(() => {
      if (this.adding()) setTimeout(() => this.nameInput()?.nativeElement.focus(), 60);
    });
  }

  readonly filtered = computed<Student[]>(() => {
    const list = this.students() ?? [];
    const term = this.q().trim();
    return term ? list.filter((s) => s.name.includes(term)) : list;
  });

  circleLabelFor(id: string): string {
    return circleLabel(this.circles()?.find((c) => c.id === id));
  }

  openAdd(): void {
    this.m = {
      name: '',
      circleId: '',
      level: '',
      birthDate: '',
      guardianPhone: '',
      currentPlan: '',
      memorizedSurahs: [],
    };
    this.error.set('');
    this.adding.set(true);
  }

  closeAdd(): void {
    this.adding.set(false);
  }

  async submitAdd(): Promise<void> {
    const name = this.m.name.trim();
    if (!name) return void this.error.set('أدخل اسم الطالب');
    if (!this.m.circleId) return void this.error.set('اختر الحلقة');

    this.saving.set(true);
    this.error.set('');
    const id = await this.notify.run(
      () =>
        this.data.addStudent({
          name,
          circleId: this.m.circleId,
          level: this.m.level.trim() || undefined,
          birthDate: this.m.birthDate || undefined,
          guardianPhone: this.m.guardianPhone.trim() || undefined,
          currentPlan: this.m.currentPlan.trim() || undefined,
          memorizedSurahs: [...this.m.memorizedSurahs].sort((a, b) => a - b),
          active: true,
        }),
      { success: 'أُضيف الطالب', error: 'تعذّر إضافة الطالب' },
    );
    this.saving.set(false);
    if (id) this.adding.set(false);
  }
}
