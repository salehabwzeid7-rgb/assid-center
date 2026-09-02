import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-student-form',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header [title]="editing() ? 'تعديل بيانات الطالب' : 'إضافة طالب'" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">اسم الطالب *</label>
          <input id="name" name="name" [(ngModel)]="m.name" required />
        </div>

        <div class="field">
          <label for="circleId">الحلقة *</label>
          <select id="circleId" name="circleId" [(ngModel)]="m.circleId" required>
            <option value="" disabled>اختر الحلقة</option>
            @for (c of circles(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
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

        <div class="field-row">
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
            <label for="phone">جوال الطالب</label>
            <input id="phone" name="phone" type="tel" inputmode="tel" dir="ltr" [(ngModel)]="m.phone" />
          </div>
        </div>

        <div class="field">
          <label for="currentPlan">المقرر الحالي</label>
          <textarea
            id="currentPlan"
            name="currentPlan"
            [(ngModel)]="m.currentPlan"
            placeholder="مثال: حفظ جزء عمّ + مراجعة سورة البقرة"
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
    </div>
  `,
})
export class StudentFormPage implements OnInit {
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
  readonly error = signal('');
  readonly editing = signal(false);

  m = {
    name: '',
    circleId: '',
    level: '',
    birthDate: '',
    guardianPhone: '',
    phone: '',
    currentPlan: '',
    active: true,
  };

  async ngOnInit(): Promise<void> {
    if (this.id) {
      this.editing.set(true);
      const s = await this.data.getStudent(this.id);
      if (s) {
        this.m = {
          name: s.name,
          circleId: s.circleId,
          level: s.level ?? '',
          birthDate: s.birthDate ?? '',
          guardianPhone: s.guardianPhone ?? '',
          phone: s.phone ?? '',
          currentPlan: s.currentPlan ?? '',
          active: s.active,
        };
      } else {
        this.error.set('لم يتم العثور على الطالب');
      }
      this.cdr.markForCheck();
    } else if (this.circleParam) {
      this.m.circleId = this.circleParam;
    }
  }

  async submit(): Promise<void> {
    if (!this.m.name.trim() || !this.m.circleId) {
      this.error.set('أدخل اسم الطالب واختر الحلقة');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.m.name.trim(),
      circleId: this.m.circleId,
      level: this.m.level.trim() || undefined,
      birthDate: this.m.birthDate || undefined,
      guardianPhone: this.m.guardianPhone.trim() || undefined,
      phone: this.m.phone.trim() || undefined,
      currentPlan: this.m.currentPlan.trim() || undefined,
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
    if (targetId) await this.router.navigate(['/student', targetId]);
  }
}
