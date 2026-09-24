import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './auth.service';
import { TAB_PATHS } from './nav-transition.service';

/**
 * هل شريط التنقّل السفليّ ظاهر الآن؟ إشارة واحدة مشتركة يقرؤها كلّ من
 * `BottomNavComponent` نفسه (لعرضه) و`App` (ليضع صنف `has-bottom-nav` على
 * `.app-shell`، والذي تعتمد عليه أنماط الحشو/التموضع أسفل الصفحة).
 *
 * سُحبت هذه الإشارة إلى خدمة مستقلّة بدل حسابها مرّتين (خلل تكرار حقيقيّ)
 * أو الاعتماد على `:has(.bottom-nav)` في CSS وحده — تلك الخاصّية غير مدعومة
 * قبل iOS 15.4/Safari 15.4، فأجهزة آيفون أقدم كانت ستفقد الحشو أسفل الصفحة
 * بالكامل وتُخفي شريط التنقّل خلف المحتوى. صنف CSS عاديّ مدعوم في كلّ متصفّح
 * منذ عقود، فلا اعتماد على دعم متصفّح حديث لعنصر واجهة أساسيّ كهذا.
 */
@Injectable({ providedIn: 'root' })
export class BottomNavVisibilityService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  readonly visible = computed(() => this.auth.isLoggedIn() && TAB_PATHS.includes(this.path()));
}
