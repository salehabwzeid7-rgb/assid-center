import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import {
  ThemeService,
  THEME_DESC,
  THEME_LABELS,
  THEME_ORDER,
  THEME_SWATCHES,
} from '../../core/theme.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="حساب المعلّم" />

    <div class="page">
      <div class="row-between section-title">
        <span>المظهر</span>
        <span class="muted" style="font-weight:400;font-size:.78rem">{{ themes.length }} سمة</span>
      </div>
      <div class="card">
        <p class="muted" style="margin-top:0;font-size:.86rem">
          اختر سمة الواجهة — كلّها بالعربية RTL وتدعم الوضعين الفاتح والداكن، والتبديل فوريّ.
        </p>
        <div class="theme-list">
          @for (t of themes; track t) {
            <button
              type="button"
              class="theme-row"
              [class.active]="theme.theme() === t"
              (click)="theme.set(t)"
            >
              <span class="theme-swatch" aria-hidden="true">
                <i [style.background]="swatches[t][0]"></i>
                <i [style.background]="swatches[t][1]"></i>
                <i [style.background]="swatches[t][2]"></i>
              </span>
              <span class="theme-text">
                <span class="theme-name">{{ labels[t] }}</span>
                <span class="theme-desc">{{ descriptions[t] }}</span>
              </span>
              <span class="theme-check">{{ theme.theme() === t ? '✓' : '' }}</span>
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
          <label>معرّف الدخول</label>
          <input [value]="auth.teacher()?.email || ''" dir="ltr" disabled />
        </div>

        <button
          class="btn btn-primary btn-block"
          type="button"
          [disabled]="notify.syncing()"
          (click)="save()"
        >
          حفظ البيانات
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
      .theme-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .theme-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        text-align: right;
        padding: 10px 12px;
        border: 2px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
        transition:
          border-color var(--ease),
          box-shadow var(--ease),
          transform 0.1s ease;
      }
      .theme-row:active {
        transform: scale(0.99);
      }
      .theme-row.active {
        border-color: var(--gold);
        box-shadow: var(--ring);
      }
      .theme-swatch {
        display: flex;
        flex-shrink: 0;
        width: 46px;
        height: 34px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--border);
      }
      .theme-swatch i {
        flex: 1;
      }
      .theme-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .theme-name {
        font-weight: 700;
        font-size: 0.92rem;
      }
      .theme-desc {
        color: var(--text-soft);
        font-size: 0.76rem;
        line-height: 1.5;
      }
      .theme-check {
        flex-shrink: 0;
        width: 20px;
        text-align: center;
        color: var(--gold-deep);
        font-weight: 800;
      }
    `,
  ],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly notify = inject(NotifyService);
  private router = inject(Router);

  readonly themes = THEME_ORDER;
  readonly labels = THEME_LABELS;
  readonly descriptions = THEME_DESC;
  readonly swatches = THEME_SWATCHES;

  name = this.auth.teacher()?.name ?? '';
  phone = this.auth.teacher()?.phone ?? '';

  async save(): Promise<void> {
    await this.notify.run(
      () => this.auth.updateTeacher({ name: this.name.trim(), phone: this.phone.trim() }),
      { loading: 'جارٍ حفظ البيانات…', success: 'تم حفظ بيانات المعلّم', error: 'تعذّر الحفظ' },
    );
  }

  async logout(): Promise<void> {
    if (!(await this.notify.confirm('تسجيل الخروج؟', { confirmText: 'خروج', danger: true })))
      return;
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
