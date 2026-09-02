import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeService, THEME_LABELS, type AppTheme } from '../../core/theme.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="حساب المعلّم" />

    <div class="page">
      <div class="section-title">المظهر</div>
      <div class="card">
        <p class="muted" style="margin-top:0;font-size:.86rem">اختر سمة الواجهة</p>
        <div class="theme-grid">
          @for (t of themes; track t) {
            <button
              type="button"
              class="theme-card"
              [class.active]="theme.theme() === t"
              (click)="theme.set(t)"
            >
              <span class="theme-swatch" [attr.data-t]="t">
                <i></i><i></i><i></i>
              </span>
              <span class="theme-name">{{ labels[t] }}</span>
            </button>
          }
        </div>
      </div>

      <div class="section-title">بيانات المعلّم</div>
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

      <p class="hint" style="text-align:center">مركز أسيد لتحفيظ القرآن الكريم — واجهة المعلّم</p>
    </div>
  `,
  styles: [
    `
      .theme-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .theme-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border: 2px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        cursor: pointer;
        transition: all var(--ease);
      }
      .theme-card.active {
        border-color: var(--gold);
        box-shadow: var(--ring);
      }
      .theme-name {
        font-weight: 700;
        font-size: 0.9rem;
      }
      .theme-swatch {
        display: flex;
        width: 100%;
        height: 34px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--border);
      }
      .theme-swatch i {
        flex: 1;
      }
      .theme-swatch[data-t='default'] i:nth-child(1) {
        background: #0d5c3f;
      }
      .theme-swatch[data-t='default'] i:nth-child(2) {
        background: #c9a14a;
      }
      .theme-swatch[data-t='default'] i:nth-child(3) {
        background: #f6f4ec;
      }
      .theme-swatch[data-t='heritage'] i:nth-child(1) {
        background: #e0980f;
      }
      .theme-swatch[data-t='heritage'] i:nth-child(2) {
        background: #1f7a3a;
      }
      .theme-swatch[data-t='heritage'] i:nth-child(3) {
        background: #faf5e8;
      }
    `,
  ],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private router = inject(Router);

  readonly themes: AppTheme[] = ['default', 'heritage'];
  readonly labels = THEME_LABELS;

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
