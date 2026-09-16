import { Component, Input, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

/** الشريط العلوي الموحّد لكل الشاشات */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="app-header">
      @if (nav === 'back') {
        <button class="icon-btn" type="button" (click)="goBack()" aria-label="رجوع">›</button>
      } @else if (nav === 'home') {
        <button class="icon-btn" type="button" (click)="goHome()" aria-label="الرئيسية">☰</button>
      } @else {
        <!-- nav="none" — بلا أيّ زرّ تنقّل: لصفحات جذريّة معزولة (مثل لوحة
             المالك) حيث "الرئيسيّة"/"رجوع" يقودان لمسار مختلف تمامًا (تطبيق
             المعلّم العاديّ) بلا أيّ تأكيد — خطر تبديل حساب بالخطأ حقيقيّ
             (v1.26.3)، لا مجرّد تنقّل عاديّ. مساحة فارغة بنفس عرض الزرّ
             للحفاظ على توسيط العنوان. -->
        <span class="icon-btn-spacer" aria-hidden="true"></span>
      }
      <span class="title">{{ title }}</span>
      <ng-content select="[actions]"></ng-content>
    </header>
  `,
  styles: [
    `
      .icon-btn {
        font-size: 1.4rem;
        line-height: 1;
      }
      .icon-btn-spacer {
        display: inline-block;
        width: 1.4rem;
      }
    `,
  ],
})
export class PageHeaderComponent {
  @Input() title = '';
  /**
   * زرّ التنقّل في الزاوية: 'back' (افتراضي، سهم رجوع لآخر صفحة) | 'home'
   * (أيقونة ☰ تنقل مباشرة لصفحة المعلّم الرئيسيّة، بلا تأكيد) | 'none' (بلا
   * أيّ زرّ — للصفحات الجذريّة المعزولة التي لا ينبغي أن تقود منها أيّ نقرة
   * غير مقصودة خارج سياقها). يبقى `[back]` القديم يعمل توافقيًّا (true→back،
   * false→home) لأيّ استخدام سابق لم يُحدَّث بعد.
   */
  @Input() nav: 'back' | 'home' | 'none' = 'back';
  @Input() set back(v: boolean) {
    this.nav = v ? 'back' : 'home';
  }

  private location = inject(Location);
  private router = inject(Router);

  goBack(): void {
    if (history.length > 1) this.location.back();
    else this.router.navigateByUrl('/');
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
