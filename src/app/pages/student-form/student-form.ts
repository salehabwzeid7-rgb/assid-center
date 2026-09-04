import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { circleLabel, studentCircleIds } from '../../core/models';
import { completedJuz } from '../../core/quran-data';
import { PageHeaderComponent } from '../../shared/page-header';
import { QuranTrackerComponent } from '../../shared/quran-tracker';

@Component({
  selector: 'app-student-form',
  imports: [FormsModule, PageHeaderComponent, QuranTrackerComponent],
  template: `
    <app-page-header [title]="editing() ? 'تعديل بيانات الطالب' : 'إضافة طالب'" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">اسم الطالب *</label>
          <input id="name" name="name" [(ngModel)]="m.name" required />
        </div>

        <div class="field">
          <label>الحلقات * — يمكن اختيار أكثر من حلقة (تحفيظ + تجويد معًا)</label>
          @if (circles() && circles()!.length === 0) {
            <p class="muted" style="margin:0">لا توجد حلقات بعد — أنشئ حلقة أوّلًا.</p>
          }
          <div class="circle-picks">
            @for (c of circles(); track c.id) {
              <label class="circle-pick" [class.on]="m.circleIds.includes(c.id)">
                <input
                  type="checkbox"
                  [checked]="m.circleIds.includes(c.id)"
                  (change)="toggleCircle(c.id)"
                />
                <span>{{ circleLabel(c) }}</span>
              </label>
            }
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="level">المستوى / الصف</label>
            <input id="level" name="level" [(ngModel)]="m.level" placeholder="مثال: الصف السادس" />
          </div>
          <div class="field">
            <label for="birthDate">تاريخ الميلاد</label>
            <input id="birthDate" name="birthDate" type="date" [(ngModel)]="m.birthDate" />
          </div>
        </div>

        <div class="field">
          <label for="guardianPhone">جوال ولي الأمر</label>
          <input
            id="guardianPhone"
            name="guardianPhone"
            type="tel"
            inputmode="tel"
            dir="ltr"
            [(ngModel)]="m.guardianPhone"
          />
        </div>

        <div class="field">
          <label>المقرر الحالي (المحفوظ من القرآن)</label>
          <app-quran-tracker [(value)]="m.memorizedSurahs" />
        </div>

        <div class="field">
          <label for="currentPlan">ملاحظة على الخطّة (اختياري)</label>
          <textarea
            id="currentPlan"
            name="currentPlan"
            [(ngModel)]="m.currentPlan"
            placeholder="مثال: التركيز على إتقان جزء تبارك قبل الانتقال"
          ></textarea>
        </div>

        @if (editing()) {
          <label class="row-between" style="cursor:pointer">
            <span>الطالب نشط في الحلقة</span>
            <input type="checkbox" name="active" [(ngModel)]="m.active" />
          </label>
          <div class="divider"></div>
        }

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving()">
          {{ saving() ? 'جارٍ الحفظ…' : editing() ? 'حفظ التعديلات' : 'إضافة الطالب' }}
        </button>
      </form>

      @if (editing()) {
        <div class="section-title">منطقة الخطر</div>
        <div class="card danger-zone">
          <p class="hint" style="margin-top:0">
            حذف نهائيّ للطالب وكلّ سجلّاته (الحضور، التسميع، التقييم، السرد، الاختبار) — من هذا
            الجهاز ومن Firebase معًا. لا يمكن التراجع. للاحتفاظ بسجلّاته مع إخفائه فقط، ألغِ تفعيل
            «الطالب نشط» أعلاه بدل الحذف.
          </p>
          <button
            class="btn btn-danger btn-block"
            type="button"
            [disabled]="deleting()"
            (click)="remove()"
          >
            {{ deleting() ? 'جارٍ الحذف…' : '🗑️ حذف الطالب نهائيًّا' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .danger-zone {
        border: 1px solid var(--danger);
      }
      .circle-picks {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .circle-pick {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        cursor: pointer;
        font-weight: 700;
      }
      .circle-pick.on {
        background: var(--green-tint);
        border-color: var(--green);
      }
      .circle-pick input {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class StudentFormPage implements OnInit {
  readonly circleLabel = circleLabel;
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  readonly id = this.route.snapshot.paramMap.get('id') ?? undefined;
  readonly circleParam = this.route.snapshot.queryParamMap.get('circle') ?? undefined;

  readonly circles = this.data.circles(this.destroyRef);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly error = signal('');
  readonly editing = signal(false);

  m = {
    name: '',
    circleIds: [] as string[],
    level: '',
    birthDate: '',
    guardianPhone: '',
    currentPlan: '',
    memorizedSurahs: [] as number[],
    active: true,
  };

  toggleCircle(id: string): void {
    this.m.circleIds = this.m.circleIds.includes(id)
      ? this.m.circleIds.filter((x) => x !== id)
      : [...this.m.circleIds, id];
  }

  async ngOnInit(): Promise<void> {
    if (this.id) {
      this.editing.set(true);
      const s = await this.data.getStudent(this.id);
      if (s) {
        this.m = {
          name: s.name,
          circleIds: studentCircleIds(s),
          level: s.level ?? '',
          birthDate: s.birthDate ?? '',
          guardianPhone: s.guardianPhone ?? '',
          currentPlan: s.currentPlan ?? '',
          memorizedSurahs: [...(s.memorizedSurahs ?? [])],
          active: s.active,
        };
      } else {
        this.error.set('لم يتم العثور على الطالب');
      }
      this.cdr.markForCheck();
    } else if (this.circleParam) {
      this.m.circleIds = [this.circleParam];
    }
  }

  async submit(): Promise<void> {
    if (!this.m.name.trim() || this.m.circleIds.length === 0) {
      this.error.set('أدخل اسم الطالب واختر حلقة واحدة على الأقلّ');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.m.name.trim(),
      circleIds: [...this.m.circleIds],
      level: this.m.level.trim() || undefined,
      birthDate: this.m.birthDate || undefined,
      guardianPhone: this.m.guardianPhone.trim() || undefined,
      currentPlan: this.m.currentPlan.trim() || undefined,
      memorizedSurahs: [...this.m.memorizedSurahs].sort((a, b) => a - b),
      active: this.m.active,
    };
    const editing = this.editing() && this.id;
    const targetId = await this.notify.run(
      () =>
        editing
          ? this.data.updateStudent(this.id!, payload).then(() => this.id!)
          : this.data.addStudent(payload),
      { success: editing ? 'حُفظت بيانات الطالب' : 'أُضيف الطالب', error: 'تعذّر حفظ الطالب' },
    );
    this.saving.set(false);
    if (!targetId) return;

    // طالب جديد لديه أجزاء محفوظة مسبقًا → شاشة إعداد سجلّ السرد
    if (!editing && completedJuz(this.m.memorizedSurahs).length > 0) {
      await this.router.navigate(['/student', targetId, 'serd'], { queryParams: { setup: 1 } });
      return;
    }
    await this.router.navigate(['/student', targetId]);
  }

  /** حذف نهائيّ للطالب وكلّ سجلّاته — بتأكيد قبل التنفيذ. */
  async remove(): Promise<void> {
    if (!this.id || this.deleting()) return;
    const ok = await this.notify.confirm('حذف هذا الطالب نهائيًّا؟', {
      message:
        `سيُحذف نهائيًّا «${this.m.name.trim() || 'الطالب'}» وكلّ سجلّاته: الحضور، التسميع، ` +
        'التقييم اليوميّ، السرد، والاختبار — من هذا الجهاز ومن Firebase معًا. لا يمكن التراجع.',
      confirmText: 'حذف نهائيّ',
      danger: true,
    });
    if (!ok) return;
    this.deleting.set(true);
    const done = await this.notify.run(() => this.data.deleteStudent(this.id!).then(() => true), {
      loading: 'جارٍ حذف الطالب…',
      success: 'حُذف الطالب نهائيًّا',
      error: 'تعذّر حذف الطالب — أعِد المحاولة',
    });
    this.deleting.set(false);
    if (done) await this.router.navigateByUrl('/students');
  }
}
