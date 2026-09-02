import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle-form',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="حلقة جديدة" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="name">اسم الحلقة *</label>
          <input id="name" name="name" [(ngModel)]="name" placeholder="مثال: حلقة الإمام نافع" required />
        </div>

        <div class="field">
          <label for="session">الفترة / التوقيت</label>
          <input
            id="session"
            name="session"
            [(ngModel)]="session"
            placeholder="مثال: بعد المغرب — من الأحد إلى الخميس"
          />
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving()">
          {{ saving() ? 'جارٍ الحفظ…' : 'حفظ الحلقة' }}
        </button>
      </form>
    </div>
  `,
})
export class CircleFormPage {
  private data = inject(DataService);
  private router = inject(Router);

  name = '';
  session = '';
  readonly saving = signal(false);
  readonly error = signal('');

  async submit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set('أدخل اسم الحلقة');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const id = await this.data.addCircle({ name: this.name, session: this.session });
      await this.router.navigate(['/circle', id]);
    } catch {
      this.error.set('تعذّر حفظ الحلقة، تحقق من الاتصال');
      this.saving.set(false);
    }
  }
}
