import { Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

/**
 * مسارات التبويبات الخمسة في الشريط السفليّ، بترتيب ظهورها فيه — مصدر واحد
 * يستعمله الشريط نفسه (لتقرير ظهوره) وحاسب اتّجاه الانتقال أدناه (لتقرير جهة
 * الانزلاق بين تبويب وآخر). كانت هذه القائمة محصورة داخل `BottomNavComponent`،
 * فنقلها إلى هنا يمنع نسختين متباعدتين تصفان الشيء نفسه.
 */
export const TAB_PATHS: string[] = ['/', '/circles', '/students', '/sard', '/profile'];

/** اتّجاه الانتقال بين شاشتين: تقدّم إلى الداخل، أو رجوع إلى الخلف. */
export type NavDirection = 'forward' | 'back';

/**
 * اتّجاه انتقال الشاشات — يكتب `data-nav="forward|back"` على `<html>` قبل كلّ
 * تنقّل، فتقرأه أنماط View Transitions في `styles.css` لتقرّر جهة الانزلاق.
 *
 * لماذا يُحسَب الاتّجاه أصلًا: انزلاق بجهة واحدة دائمًا يشعر المستخدم بأنّه
 * «يغوص» حتى وهو راجع للخلف — وهو بالضبط ما يجعل انتقالات الويب تبدو غير
 * أصليّة. الجهة الصحيحة هي أهمّ ما يميّز الإحساس الأصليّ عن الانزلاق المزخرف.
 *
 * التطبيق RTL دائمًا (لا يقلب اتجاهه إطلاقًا)، فالجهات هنا مكتوبة بمنطق RTL
 * صراحةً: **التقدّم** = الشاشة الجديدة تدخل من اليسار والقديمة تنزاح يمينًا،
 * و**الرجوع** عكسه تمامًا — نفس سلوك التطبيقات الأصليّة بالعربيّة.
 */
@Injectable({ providedIn: 'root' })
export class NavTransitionService {
  private readonly router = inject(Router);
  private path = this.router.url.split(/[?#]/)[0];

  init(): void {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        // زرّ الرجوع (في النظام أو المتصفّح) يصل دائمًا كـ popstate — أوثق
        // إشارة على الرجوع، ولها الأولويّة على أيّ استنتاج من المسارات.
        //
        // يُكتب الاتّجاه عند البدء لا عند الانتهاء، لأنّ المتصفّح يلتقط لقطة
        // الشاشة قبل تغيّر الـDOM مباشرةً — فأيّ تأخير يجعل الانزلاق يبدأ بالجهة السابقة.
        const to = e.url.split(/[?#]/)[0];
        document.documentElement.dataset['nav'] =
          e.navigationTrigger === 'popstate' ? 'back' : this.compare(this.path, to);
      } else if (e instanceof NavigationEnd) {
        // المسار المرجعيّ يُحدّث عند **نجاح** التنقّل فقط، وبالمسار بعد أيّ
        // تحويل. تحديثه عند البدء يُفسِد حساب الاتّجاه التالي كلّما ألغى حارِس التنقّل
        // أو حوّله (مثلاً authGuard يردّ الزائر إلى /login): يُخزّن وجهة لم تُفتَح قطّ.
        this.path = e.urlAfterRedirects.split(/[?#]/)[0];
      }
    });
  }

  /**
   * الاتّجاه حين لا يكون الانتقال رجوعًا صريحًا:
   *  • بين تبويبين → حسب ترتيبهما في الشريط السفليّ (فيتّسق الانزلاق مع حركة
   *    الإصبع المتوقَّعة بين التبويبات، لا مع عمق التنقّل).
   *  • من شاشة داخليّة إلى تبويب → رجوع (صعود إلى جذر).
   *  • ما عدا ذلك → تقدّم (فتح تفصيل أو نموذج).
   */
  private compare(from: string, to: string): NavDirection {
    const fromTab = TAB_PATHS.indexOf(from);
    const toTab = TAB_PATHS.indexOf(to);
    if (fromTab >= 0 && toTab >= 0) return toTab > fromTab ? 'forward' : 'back';
    if (toTab >= 0) return 'back';
    return 'forward';
  }
}
