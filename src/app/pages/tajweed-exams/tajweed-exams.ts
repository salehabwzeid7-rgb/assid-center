import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12 } from '../../core/time';
import { circleLabel } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * قائمة اختبارات التجويد لحلقة تجويد معيّنة + نافذة إنشاء اختبار جديد.
 * مستقلّة تمامًا عن اختبارات أجزاء القرآن (`pages/exam`) — حدث اختبار واحد
 * يستهدف مجموعة طلّاب دفعة واحدة، لا سجلًّا فرديًّا لكلّ طالب على حدة.
 */
@Component({
  selector: 'app-tajweed-exams',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="'اختبارات — ' + (circle()?.name || 'الحلقة')" />

    <div class="page">
      @if (circle() === null) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الحلقة.</div>
      } @else {
        <button class="btn btn-primary btn-block btn-lg" type="button" (click)="openCreate()">
          ＋ اختبار جديد
        </button>

        <div class="section-title">الاختبارات</div>
        @if (exams() === undefined) {
          <div class="spinner"></div>
        } @else if (exams()!.length === 0) {
          <div class="empty">
            <span class="icon">🧪</span> لا توجد اختبارات بعد — أنشئ أوّل اختبار من الزرّ أعلاه.
          </div>
        } @else {
          @for (e of exams(); track e.id) {
            <a class="list-item" [routerLink]="['/circle', id, 'exams', e.id]">
              <span class="avatar">🧪</span>
              <span class="grow">
                <span class="primary">{{ e.name }}</span>
                <span class="secondary">
                  {{ weekdayAr(e.date) }} {{ dmy(e.date) }}
                  @if (e.time) {
                    · {{ fmt12(e.time) }}
                  }
                  · {{ e.studentIds.length }} طالبًا
                </span>
              </span>
              <span class="chevron">‹</span>
            </a>
          }
        }
      }
    </div>

    <!-- نافذة إنشاء اختبار جديد -->
    @if (creating()) {
      <div class="modal-backdrop" (click)="creating.set(false)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="submit()">
          <h3 style="margin:0 0 10px">اختبار تجويد جديد</h3>

          <div class="field">
            <label for="ex-name">اسم الاختبار / المبحث *</label>
            <input
              id="ex-name"
              name="ex-name"
              [(ngModel)]="m.name"
              placeholder="مثال: مخارج الحروف"
              required
            />
          </div>

          <div class="field-row">
            <div class="field">
              <label for="ex-date">التاريخ</label>
              <input id="ex-date" name="ex-date" type="date" [(ngModel)]="m.date" required />
            </div>
            <div class="field">
              <label for="ex-time">الوقت</label>
              <input id="ex-time" name="ex-time" type="time" [(ngModel)]="m.time" />
            </div>
          </div>

          <div class="field">
            <label for="ex-duration">مدّة الاختبار (بالدقائق)</label>
            <input
              id="ex-duration"
              name="ex-duration"
              type="number"
              inputmode="numeric"
              min="0"
              [(ngModel)]="m.durationMin"
              placeholder="مثال: 20"
            />
          </div>

          <div class="field">
            <div class="row-between" style="margin-bottom:6px">
              <label style="margin:0">الطلّاب المستهدَفون *</label>
              <button type="button" class="chip" (click)="toggleAll()">
                {{ allSelected() ? 'إلغاء اختيار الكلّ' : 'اختيار الكلّ' }}
              </button>
            </div>
            @if (students() && students()!.length === 0) {
              <p class="muted" style="margin:0">لا يوجد طلّاب نشطون في هذه الحلقة.</p>
            }
            <div class="student-picks">
              @for (st of students(); track st.id) {
                <label class="student-pick" [class.on]="m.studentIds.includes(st.id)">
                  <input
                    type="checkbox"
                    [checked]="m.studentIds.includes(st.id)"
                    (change)="toggleStudent(st.id)"
                  />
                  <span>{{ st.name }}</span>
                </label>
              }
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-ghost" type="button" (click)="creating.set(false)">إلغاء</button>
            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="saving() || !m.name.trim() || m.studentIds.length === 0"
            >
              {{ saving() ? 'جارٍ الإنشاء…' : 'إنشاء الاختبار' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [
    `
      .student-picks {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 260px;
        overflow-y: auto;
      }
      .student-pick {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        cursor: pointer;
        font-weight: 700;
      }
      .student-pick.on {
        background: var(--green-tint);
        border-color: var(--green);
      }
      .student-pick input {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class TajweedExamsPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = this.data.circleLive(this.id, this.destroyRef);
  readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  readonly exams = this.data.tajweedExamsByCircle(this.id, this.destroyRef);

  readonly circleLabel = circleLabel;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmt12 = fmt12;

  readonly creating = signal(false);
  readonly saving = signal(false);
  m = {
    name: '',
    date: today(),
    time: '',
    durationMin: undefined as number | undefined,
    studentIds: [] as string[],
  };

  readonly allSelected = computed(() => {
    const total = this.students()?.filter((s) => s.active).length ?? 0;
    return total > 0 && this.m.studentIds.length === total;
  });

  openCreate(): void {
    const c = this.circle();
    this.m = {
      name: '',
      date: today(),
      time: c?.fromTime ?? '',
      durationMin: undefined,
      studentIds: (this.students() ?? []).filter((s) => s.active).map((s) => s.id),
    };
    this.creating.set(true);
  }

  toggleStudent(studentId: string): void {
    const i = this.m.studentIds.indexOf(studentId);
    if (i >= 0) this.m.studentIds.splice(i, 1);
    else this.m.studentIds.push(studentId);
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.m.studentIds = [];
    } else {
      this.m.studentIds = (this.students() ?? []).filter((s) => s.active).map((s) => s.id);
    }
  }

  async submit(): Promise<void> {
    if (!this.m.name.trim() || this.m.studentIds.length === 0) return;
    this.saving.set(true);
    const examId = await this.notify.run(
      () =>
        this.data.addTajweedExam({
          circleId: this.id,
          name: this.m.name.trim(),
          date: this.m.date,
          time: this.m.time || undefined,
          durationMin: this.m.durationMin || undefined,
          studentIds: [...this.m.studentIds],
        }),
      { success: 'أُنشئ الاختبار', error: 'تعذّر إنشاء الاختبار' },
    );
    this.saving.set(false);
    if (examId) {
      this.creating.set(false);
      void this.router.navigate(['/circle', this.id, 'exams', examId]);
    }
  }
}
