import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import {
  LUXURY_THEME_GROUPS,
  THEME_DESC,
  THEME_GROUP_LABELS,
  THEME_LABELS,
  THEME_ORDER,
  THEME_PREVIEW,
  ThemeService,
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
        <span class="muted" style="font-weight:400;font-size:.78rem">{{ totalCount }} سمة</span>
      </div>
      <div class="card">
        <div class="lux-section-head" style="margin-top:0;padding-top:0;border:0">
          <span class="lux-section-title">{{ groupLabels.luxury }}</span>
          <span class="theme-group-hint">
            سطح كامل فاخر + إطارات معدنية تحيط بالبطاقات والأزرار والتواريخ. التبديل فوريّ.
          </span>
        </div>

        @for (g of groups; track g.key) {
          <div class="theme-group-label" style="margin-top:16px">{{ g.label }}</div>
          <div class="theme-list">
            @for (t of g.themes; track t) {
              <button
                type="button"
                class="theme-row"
                [class.active]="theme.theme() === t"
                (click)="theme.set(t)"
              >
                <span
                  class="theme-swatch grad"
                  aria-hidden="true"
                  [style.background]="previews[t]"
                ></span>
                <span class="theme-text">
                  <span class="theme-name">{{ labels[t] }}</span>
                  <span class="theme-desc">{{ descriptions[t] }}</span>
                </span>
                <span class="theme-check">{{ theme.theme() === t ? '✓' : '' }}</span>
              </button>
            }
          </div>
        }
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
        <button class="btn btn-logout btn-block btn-lg" type="button" (click)="logout()">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            <path d="M10 17 5 12l5-5M5 12h11" />
          </svg>
          تسجيل الخروج
        </button>
        <p class="hint" style="text-align:center;margin-top:8px">
          إنهاء الجلسة والعودة إلى شاشة الدخول.
        </p>
      </div>

      <p class="hint" style="text-align:center">مركز أسيد لتحفيظ القرآن الكريم — واجهة المعلّم</p>
    </div>
  `,
  styles: [
    `
      .theme-group-label {
        font-weight: 700;
        font-size: 0.86rem;
        color: var(--text-soft);
        margin: 10px 2px 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .theme-group-hint {
        font-weight: 400;
        font-size: 0.75rem;
        color: var(--text-soft);
        opacity: 0.85;
      }
      .lux-section-head {
        margin: 22px 0 2px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .lux-section-title {
        font-weight: 800;
        font-size: 0.98rem;
        color: var(--gold-deep);
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .lux-section-title::before {
        content: '✦';
        color: var(--gold);
        font-size: 0.9rem;
      }
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

  readonly labels = THEME_LABELS;
  readonly descriptions = THEME_DESC;
  readonly previews = THEME_PREVIEW;
  readonly groupLabels = THEME_GROUP_LABELS;
  readonly groups = LUXURY_THEME_GROUPS;

  readonly totalCount = THEME_ORDER.length;

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
