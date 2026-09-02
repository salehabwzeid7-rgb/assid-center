import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle-form',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header [title]="editing() ? 'تعديل الحلقة' : 'حلقة جديدة'" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">اسم الحلقة *</label>
          <input
            id="name"
            name="name"
            [(ngModel)]="name"
            placeholder="مثال: حلقة الإمام نافع"
          />
        </div>

        <div class="field">
          <label for="schedule">الفترة / التوقيت</label>
          <input
            id="schedule"
            name="schedule"
            [(ngModel)]="schedule"
            placeholder="مثال: بعد المغرب — من الأحد إلى الخميس"
          />
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving()">
          {{ saving() ? 'جارٍ الحفظ…' : editing() ? 'حفظ التعديلات' : 'حفظ الحلقة' }}
        </button>
      </form>

      @if (editing()) {
        <div class="card">
          <button class="btn btn-danger btn-block" type="button" (click)="remove()">
            حذف الحلقة
          </button>
          <p class="hint">لا يُحذف طلاب الحلقة، لكن تختفي من قائمتك.</p>
        </div>
      }
    </div>
  `,
})
export class CircleFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  readonly id = this.route.snapshot.paramMap.get('id') ?? undefined;
  readonly editing = signal(false);

  name = '';
  schedule = '';
  readonly saving = signal(false);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    if (this.id) {
      this.editing.set(true);
      const c = await this.data.getCircle(this.id);
      if (c) {
        this.name = c.name;
        this.schedule = c.schedule ?? '';
      } else {
        this.error.set('لم يتم العثور على الحلقة');
      }
      this.cdr.markForCheck();
    }
  }

  async submit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set('أدخل اسم الحلقة');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const editing = this.editing() && this.id;
    const res = await this.notify.run(
      () =>
        editing
          ? this.data
              .updateCircle(this.id!, { name: this.name.trim(), schedule: this.schedule.trim() })
              .then(() => this.id!)
          : this.data.addCircle({ name: this.name, schedule: this.schedule }),
      { success: editing ? 'حُفظت التعديلات' : 'أُنشئت الحلقة', error: 'تعذّر حفظ الحلقة' },
    );
    this.saving.set(false);
    if (res) await this.router.navigate(['/circle', res]);
  }

  async remove(): Promise<void> {
    if (!this.id) return;
    const ok = await this.notify.confirm('حذف هذه الحلقة؟', {
      message: 'لا يُحذف طلاب الحلقة، لكنها تختفي من قائمتك.',
      confirmText: 'حذف',
      danger: true,
    });
    if (!ok) return;
    const done = await this.notify.run(() => this.data.deleteCircle(this.id!).then(() => true), {
      success: 'حُذفت الحلقة',
    });
    if (done) await this.router.navigateByUrl('/');
  }
}
