import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * بوّابة دخول مستقلّة تمامًا عن /login العاديّة — لحساب المالك فقط (v1.26.0).
 * لا رابط لها من أيّ تنقّل ظاهر في التطبيق (يُفتح بمعرفة الرابط مباشرة).
 * تستخدم نفس Firebase Auth (لا نظام مصادقة منفصل — قرار معماريّ متعمَّد)،
 * لكن أيّ حساب ينجح بتسجيل الدخول وبريده لا يطابق OWNER_EMAIL يُسجَّل خروجه
 * فورًا ويُعرَض له خطأ عامّ — لا يبقى مسجَّلًا للحظة واحدة على هذه الصفحة.
 */
@Component({
  selector: 'app-owner-login',
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <div class="auth-logo">
        <h1>لوحة المالك</h1>
        <p>وصول مقيَّد — حساب واحد فقط</p>
      </div>

      <form class="card" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <div class="field">
          <label for="identifier">اسم المستخدم</label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            inputmode="email"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            autocomplete="username"
            dir="ltr"
            [(ngModel)]="identifier"
          />
        </div>

        <div class="field">
          <label for="password">كلمة المرور</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            dir="ltr"
            [(ngModel)]="password"
          />
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="loading()">
          {{ loading() ? '…جارٍ التحقّق' : 'دخول' }}
        </button>
      </form>
    </div>
  `,
})
export class OwnerLoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  identifier = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    if (!this.identifier.trim() || !this.password) {
      this.error.set('أدخل اسم المستخدم وكلمة المرور');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.login(this.identifier, this.password);
      if (!this.auth.isOwnerAccount()) {
        await this.auth.logout();
        this.error.set('بيانات الدخول غير صحيحة');
        return;
      }
      await this.router.navigateByUrl('/sys');
    } catch {
      this.error.set('بيانات الدخول غير صحيحة');
    } finally {
      this.loading.set(false);
    }
  }
}
