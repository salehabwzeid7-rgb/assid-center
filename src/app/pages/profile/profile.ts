import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="حساب المعلّم" />

    <div class="page">
      <div class="card">
        <div class="field">
          <label for="name">الاسم</label>
          <input id="name" name="name" [(ngModel)]="name" />
        </div>
        <div class="field">
          <label for="phone">رقم الجوال</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" dir="ltr" [(ngModel)]="phone" />
        </div>
        <div class="field">
          <label>البريد الإلكتروني</label>
          <input [value]="auth.teacher()?.email || ''" dir="ltr" disabled />
        </div>

        @if (saved()) {
          <div class="alert alert-ok">تم حفظ البيانات</div>
        }

        <button class="btn btn-primary btn-block" type="button" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'جارٍ الحفظ…' : 'حفظ' }}
        </button>
      </div>

      <div class="card">
        <button class="btn btn-danger btn-block" type="button" (click)="logout()">
          تسجيل الخروج
        </button>
      </div>

      <p class="hint" style="text-align:center">مركز أَصيد لتحفيظ القرآن الكريم — واجهة المعلّم</p>
    </div>
  `,
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  name = this.auth.teacher()?.name ?? '';
  phone = this.auth.teacher()?.phone ?? '';
  readonly saving = signal(false);
  readonly saved = signal(false);

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    try {
      await this.auth.updateTeacher({ name: this.name.trim(), phone: this.phone.trim() });
      this.saved.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
