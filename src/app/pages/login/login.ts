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
        <img class="auth-badge" src="logo.svg" alt="شعار مركز أسيد" width="96" height="96" />
        <h1>مركز أسيد لتحفيظ القرآن الكريم</h1>
        <p>واجهة المعلّم</p>
      </div>

      <form class="card" (ngSubmit)="submit()" novalidate>
        <div class="tabs" style="margin-bottom:16px">
          <button type="button" [class.active]="mode() === 'login'" (click)="setMode('login')">
            تسجيل الدخول
          </button>
          <button
            type="button"
            [class.active]="mode() === 'register'"
            (click)="setMode('register')"
          >
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
            <input id="name" name="name" [(ngModel)]="name" autocomplete="name" />
          </div>
        }

        <div class="field">
          <label for="identifier">البريد الإلكتروني أو اسم المستخدم</label>
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
          <div class="hint">
            يمكنك استخدام بريد إلكتروني كامل، أو اسمًا بسيطًا مثل <bdi>ahmad</bdi>
          </div>
        </div>

        <div class="field">
          <label for="password">كلمة المرور</label>
          <div class="pw-wrap">
            <input
              id="password"
              name="password"
              [type]="showPw() ? 'text' : 'password'"
              [autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
              dir="ltr"
              [(ngModel)]="password"
            />
            <button
              type="button"
              class="pw-toggle"
              [attr.aria-label]="showPw() ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
              (click)="showPw.set(!showPw())"
            >
              {{ showPw() ? '🙈' : '👁' }}
            </button>
          </div>
          <div class="hint">6 خانات على الأقل، أرقام أو حروف مثل <bdi>123456</bdi></div>
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
  styles: [
    `
      .pw-wrap {
        position: relative;
      }
      .pw-wrap input {
        padding-inline-end: 44px;
      }
      .pw-toggle {
        position: absolute;
        inset-inline-end: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        font-size: 1.15rem;
        line-height: 1;
        padding: 6px;
        cursor: pointer;
      }
    `,
  ],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly mode = signal<Mode>('login');
  name = '';
  identifier = '';
  password = '';
  readonly showPw = signal(false);
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
    if (!this.identifier.trim() || !this.password) {
      this.error.set('أدخل اسم المستخدم/البريد وكلمة المرور');
      return;
    }
    if (this.mode() === 'register' && !this.name.trim()) {
      this.error.set('أدخل الاسم الكامل');
      return;
    }
    if (this.mode() === 'register' && this.password.length < 6) {
      this.error.set('كلمة المرور يجب أن تكون 6 خانات على الأقل');
      return;
    }
    this.loading.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.identifier, this.password);
      } else {
        await this.auth.register(this.name, this.identifier, this.password);
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
    if (!this.identifier.trim()) {
      this.error.set('أدخل اسم المستخدم/البريد أولًا');
      return;
    }
    if (!this.identifier.includes('@')) {
      this.error.set('إعادة التعيين تحتاج بريدًا إلكترونيًا كاملًا');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.identifier);
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
      return 'صيغة اسم المستخدم/البريد غير مقبولة';
    case 'auth/user-disabled':
      return 'هذا الحساب موقوف، تواصل مع الإدارة';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'اسم المستخدم/البريد أو كلمة المرور غير صحيحة';
    case 'auth/email-already-in-use':
      return 'هذا الحساب مسجَّل مسبقًا، سجّل الدخول بدلًا من ذلك';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة (6 خانات على الأقل)';
    case 'auth/too-many-requests':
      return 'محاولات كثيرة، حاول لاحقًا';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت أو المحاكي';
    default:
      return 'تعذّر إتمام العملية، حاول مرة أخرى';
  }
}
