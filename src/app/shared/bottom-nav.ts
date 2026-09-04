import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * شريط التنقّل السفلي — يظهر فقط في الوجهات الرئيسية الخمس بعد تسجيل الدخول.
 * (يختفي في شاشات النماذج والتفاصيل التي تملك زرّ رجوع خاصًّا بها.)
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (visible()) {
      <nav class="bottom-nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.7V21h14V9.7" />
          </svg>
          <span>الرئيسية</span>
        </a>
        <a routerLink="/circles" routerLinkActive="active">
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
              d="M12 6c-1.8-1.3-4.2-2-7-2v14c2.8 0 5.2.7 7 2 1.8-1.3 4.2-2 7-2V4c-2.8 0-5.2.7-7 2Z"
            />
            <path d="M12 6v14" />
          </svg>
          <span>الحلقات</span>
        </a>
        <a routerLink="/students" routerLinkActive="active">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.2 20c.8-3.4 3.3-5 5.8-5s5 1.6 5.8 5" />
            <path d="M16.5 4.3a3.2 3.2 0 0 1 0 6.1M18.4 20c-.5-2.2-1.4-3.7-2.7-4.6" />
          </svg>
          <span>الطلاب</span>
        </a>
        <a routerLink="/sard" routerLinkActive="active">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
            <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
            <path d="M9 8h6M9 11h4" />
          </svg>
          <span class="nav-dual">سرد واختبار</span>
        </a>
        <a routerLink="/profile" routerLinkActive="active">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20c1-3.6 3.6-5.2 6.5-5.2S17.5 16.4 18.5 20" />
          </svg>
          <span>الحساب</span>
        </a>
      </nav>
    }
  `,
})
export class BottomNavComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  private readonly tabs = ['/', '/circles', '/students', '/sard', '/profile'];

  readonly visible = computed(() => this.auth.isLoggedIn() && this.tabs.includes(this.path()));
}
