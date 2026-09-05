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
        <img class="auth-badge" src="logo.svg" alt="شعار الماهر" width="96" height="96" />
        <h1>الماهر لتحفيظ القرآن الكريم</h1>
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
              [attr.aria-pressed]="showPw()"
              (click)="showPw.set(!showPw())"
            >
              @if (showPw()) {
                <!-- عين مشطوبة — إخفاء -->
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.3 0 9.9 6.4 9.9 6.4a10.7 10.7 0 0 1-1.7 2.3"
                  />
                  <path
                    d="M6.6 6.6A10.7 10.7 0 0 0 2.1 11.4a1 1 0 0 0 0 .7A10.4 10.4 0 0 0 12 19a9.9 9.9 0 0 0 5.4-1.6"
                  />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  <path d="m2 2 20 20" />
                </svg>
              } @else {
                <!-- عين — إظهار -->
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M2.1 12.3a1 1 0 0 1 0-.7 10.4 10.4 0 0 1 19.8 0 1 1 0 0 1 0 .7 10.4 10.4 0 0 1-19.8 0Z"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              }
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
        الماهر لتحفيظ القرآن الكريم — واجهة المعلّم
      </p>
    </div>
  `,
  styles: [
    `
      .pw-wrap {
        position: relative;
      }
      /* حقل كلمة المرور LTR والأيقونة على الحافة اليمنى فيزيائيًّا؛
         نبعد نصّ الإدخال عنها بحشو أيمن كافٍ فلا يتداخل معها إطلاقًا. */
      .pw-wrap input {
        padding-right: 46px;
        padding-left: 12px;
      }
      .pw-toggle {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        background: none;
        border: none;
        border-radius: 8px;
        color: var(--text-soft);
        cursor: pointer;
        transition:
          color var(--ease),
          background var(--ease);
      }
      .pw-toggle:hover {
        color: var(--text);
        background: var(--surface-2);
      }
      .pw-toggle:active {
        transform: translateY(-50%) scale(0.92);
      }
      .pw-toggle svg {
        width: 20px;
        height: 20px;
        display: block;
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
