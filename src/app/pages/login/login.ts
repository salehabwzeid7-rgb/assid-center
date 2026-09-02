import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <div class="auth-logo">
        <div class="mark quran-font">أَ</div>
        <h1>مركز أَصيد لتحفيظ القرآن الكريم</h1>
        <p>واجهة المعلّم</p>
      </div>

      <form class="card" (ngSubmit)="submit()">
        <h2 style="font-size:1.05rem">تسجيل دخول المعلّم</h2>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
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
            autocomplete="current-password"
            dir="ltr"
            [(ngModel)]="password"
            required
          />
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="loading()">
          {{ loading() ? 'جارٍ الدخول…' : 'دخول' }}
        </button>

        @if (preview) {
          <p class="hint" style="text-align:center;margin-top:14px">
            وضع المعاينة: أدخل أي بريد وكلمة مرور للدخول وتجربة الواجهة.
          </p>
        } @else {
          <p class="hint" style="text-align:center;margin-top:14px">
            يُنشئ مدير المركز حساب المعلّم. لأي مشكلة في الدخول تواصل مع الإدارة.
          </p>
        }
      </form>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  readonly preview = environment.preview;
  readonly loading = signal(false);
  readonly error = signal('');

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set('أدخل البريد وكلمة المرور');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/');
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
    case 'auth/too-many-requests':
      return 'محاولات كثيرة، حاول لاحقًا';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
    default:
      return 'تعذّر تسجيل الدخول، حاول مرة أخرى';
  }
}
