import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ResetService } from '../../core/reset.service';
import { UpdateService } from '../../core/update.service';
import { THEME_LABELS, THEME_ORDER, THEME_SWATCHES, ThemeService } from '../../core/theme.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="حساب المعلّم" />

    <div class="page">
      <div class="section-title">المظهر</div>
      <div class="card">
        <p class="muted" style="margin-top:0;font-size:.86rem">
          اختر خلفية الواجهة — التبديل فوريّ ويُحفَظ على جهازك.
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

      <div class="section-title">التحديثات</div>
      <div class="card">
        <p class="muted" style="margin-top:0;font-size:.86rem">
          يتحدّث التطبيق تلقائيًّا عند فتحه. اضغط للتحقّق الآن.
        </p>
        <button
          class="btn btn-ghost btn-block"
          type="button"
          [disabled]="checkingUpdate()"
          (click)="checkUpdate()"
        >
          {{ checkingUpdate() ? 'جارٍ التحقّق…' : 'التحقّق من وجود تحديث' }}
        </button>
      </div>

      <div class="card">
        <button class="btn btn-danger btn-block" type="button" (click)="logout()">
          تسجيل الخروج
        </button>
      </div>

      <!-- منطقة الخطر — حذف شامل (مرحلة الاختبار) -->
      <div class="section-title">منطقة الخطر</div>
      <div class="card danger-zone">
        <p class="muted" style="margin-top:0;font-size:.86rem">
          حذف كلّ بيانات التطبيق نهائيًّا: الحلقات، الطلاب، الجلسات، التسميع، السرد — من هذا الجهاز
          ومن Firebase. مخصّص لمسح البيانات التجريبيّة. لا يمكن التراجع.
        </p>
        <button
          class="btn btn-danger btn-block"
          type="button"
          [disabled]="wiping()"
          (click)="deleteAllData()"
        >
          {{ wiping() ? 'جارٍ الحذف…' : '🗑️ حذف الجميع' }}
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
        padding: 12px;
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
        border-color: var(--green);
        box-shadow: var(--ring);
      }
      .theme-swatch {
        display: flex;
        flex-shrink: 0;
        width: 48px;
        height: 34px;
        border-radius: 9px;
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
        color: var(--green);
        font-weight: 800;
      }
      .danger-zone {
        border: 1px solid var(--danger);
      }
    `,
  ],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly notify = inject(NotifyService);
  private reset = inject(ResetService);
  private update = inject(UpdateService);
  private router = inject(Router);

  readonly themes = THEME_ORDER;
  readonly labels = THEME_LABELS;
  readonly swatches = THEME_SWATCHES;
  readonly wiping = signal(false);
  readonly checkingUpdate = signal(false);

  /** تحقّق يدويّ من وجود تحديث مباشر (OTA). */
  async checkUpdate(): Promise<void> {
    this.checkingUpdate.set(true);
    try {
      await this.update.check(false);
    } finally {
      this.checkingUpdate.set(false);
    }
  }

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

  /** حذف شامل — بتأكيدين متتاليين قبل التنفيذ. */
  async deleteAllData(): Promise<void> {
    const step1 = await this.notify.confirm('حذف جميع البيانات؟', {
      message:
        'سيُحذف نهائيًّا كلّ شيء: الحلقات، الطلاب، الجلسات، سجلّات التسميع والتقييم والسرد — ' +
        'من هذا الجهاز ومن Firebase معًا. لا يمكن التراجع عن هذه الخطوة.',
      confirmText: 'متابعة',
      danger: true,
    });
    if (!step1) return;

    const step2 = await this.notify.confirm('تأكيد نهائيّ — لا رجعة', {
      message:
        'هذه آخر فرصة لإلغاء العمليّة. عند الضغط على «احذف الجميع» ستُمحى كلّ البيانات فورًا ' +
        'ويُسجَّل خروجك، ولن تُستعاد. تابِع فقط إن كنت متأكّدًا تمامًا.',
      confirmText: 'احذف الجميع',
      danger: true,
    });
    if (!step2) return;

    this.wiping.set(true);
    const count = await this.notify.run(() => this.reset.wipeEverything(), {
      loading: 'جارٍ حذف جميع البيانات…',
      success: 'حُذفت جميع البيانات',
      error: 'تعذّر إكمال الحذف — أُعيدي المحاولة',
    });
    this.wiping.set(false);

    if (count !== undefined) {
      // إعادة تحميل كاملة بعد إنهاء اتّصال Firestore
      window.location.href = window.location.origin + '/login';
    }
  }
}
