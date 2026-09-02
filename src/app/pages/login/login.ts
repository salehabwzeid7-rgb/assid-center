import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <div class="auth-logo">
        <div class="mark quran-font">أ</div>
        <h1>مركز أسيد لتحفيظ القرآن الكريم</h1>
        <p>واجهة المعلّم</p>
      </div>

      <form class="card" (ngSubmit)="submit()">
        <div class="tabs" style="margin-bottom:16px">
          <button type="button" [class.active]="mode() === 'login'" (click)="setMode('login')">
            تسجيل الدخول
          </button>
          <button type="button" [class.active]="mode() === 'register'" (click)="setMode('register')">
            حساب جديد
          </button>
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }
        @if (info()) {
          <div class="alert alert-ok">{{ info() }}</div>
        }

        @if (mode() === 'register') {
          <div class="field">
            <label for="name">الاسم الكامل</label>
            <input id="name" name="name" [(ngModel)]="name" autocomplete="name" required />
          </div>
        }

        <div class="field">
          <label for="email">البريد الإلكتروني</label>
          <input
            id="email"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="username"
            dir="ltr"
            [(ngModel)]="email"
            required
          />
        </div>

        <div class="field">
          <label for="password">كلمة المرور</label>
          <input
            id="password"
            name="password"
            type="password"
            [autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
            dir="ltr"
            [(ngModel)]="password"
            required
          />
          @if (mode() === 'register') {
            <div class="hint">6 أحرف على الأقل</div>
          }
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="loading()">
          {{ loading() ? '…جارٍ التنفيذ' : mode() === 'login' ? 'دخول' : 'إنشاء الحساب' }}
        </button>

        @if (mode() === 'login') {
          <button
            class="btn btn-ghost btn-block"
            type="button"
            style="margin-top:8px"
            [disabled]="loading()"
            (click)="forgotPassword()"
          >
            نسيت كلمة المرور؟
          </button>
        }
      </form>

      <p class="hint" style="text-align:center;margin-top:16px">
        مركز أسيد لتحفيظ القرآن الكريم — واجهة المعلّم
      </p>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly mode = signal<Mode>('login');
  name = '';
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');
  readonly info = signal('');

  setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set('');
    this.info.set('');
  }

  async submit(): Promise<void> {
    this.error.set('');
    this.info.set('');
    if (!this.email.trim() || !this.password) {
      this.error.set('أدخل البريد وكلمة المرور');
      return;
    }
    if (this.mode() === 'register' && !this.name.trim()) {
      this.error.set('أدخل الاسم الكامل');
      return;
    }
    if (this.mode() === 'register' && this.password.length < 6) {
      this.error.set('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    this.loading.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.register(this.name, this.email, this.password);
      }
      await this.router.navigateByUrl('/');
    } catch (e: unknown) {
      this.error.set(mapAuthError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async forgotPassword(): Promise<void> {
    this.error.set('');
    this.info.set('');
    if (!this.email.trim()) {
      this.error.set('أدخل بريدك الإلكتروني أولًا');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.email);
      this.info.set('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك');
    } catch (e: unknown) {
      this.error.set(mapAuthError(e));
    } finally {
      this.loading.set(false);
    }
  }
}

function mapAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة';
    case 'auth/user-disabled':
      return 'هذا الحساب موقوف، تواصل مع الإدارة';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'البريد أو كلمة المرور غير صحيحة';
    case 'auth/email-already-in-use':
      return 'هذا البريد مسجَّل مسبقًا، سجّل الدخول بدلًا من ذلك';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة (6 أحرف على الأقل)';
    case 'auth/too-many-requests':
      return 'محاولات كثيرة، حاول لاحقًا';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
    default:
      return 'تعذّر إتمام العملية، حاول مرة أخرى';
  }
}
