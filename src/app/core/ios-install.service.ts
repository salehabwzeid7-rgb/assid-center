import { Injectable, computed, signal } from '@angular/core';
import { isIosSafariTab } from './platform';

/**
 * حالة دعوة تثبيت PWA على iOS — مشتركة بين `IosInstallBannerComponent`
 * (يعرضها) وأيّ مكان آخر يريد إعادة إظهارها يدويًّا (زرّ في صفحة الحساب
 * مثلًا). لو بقي منطق «هل أُغلقت؟» و«أرِها مجدّدًا» محصورًا داخل المكوّن نفسه،
 * لَما قدر أيّ مكوّن آخر إعادة تشغيلها بعد إغلاقها — وهي دعوة تُغلَق نهائيًّا
 * عمدًا (v1.33 الأصليّة)، فمن أغلقها بالخطأ أو غيَّر رأيه لاحقًا لا يملك طريقة
 * لاستدعائها من جديد سوى مسح بيانات المتصفّح يدويًّا.
 */
const DISMISS_KEY = 'assid-center:ios-install-dismissed';

@Injectable({ providedIn: 'root' })
export class IosInstallService {
  /** هل المستخدم مؤهَّل لهذه الدعوة أصلًا؟ (سفاري على iOS، غير مثبَّت) — لا
   * علاقة له بحالة الإغلاق، يُستخدَم لإظهار/إخفاء مدخل «إعادة التثبيت» في
   * صفحة الحساب بصرف النظر عن كون الشريط مُغلقًا أم لا. */
  readonly eligible = isIosSafariTab();

  private readonly dismissedPermanently = signal(this.readDismissed());
  /** طلب إظهار صريح (من صفحة الحساب مثلًا) — يتجاوز الإغلاق السابق لمرّة. */
  private readonly forced = signal(false);

  readonly show = computed(() => this.eligible && (this.forced() || !this.dismissedPermanently()));

  /** إغلاق نهائيّ — لن تظهر الدعوة تلقائيًّا مجدّدًا على هذا الجهاز. */
  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* تخزين محليّ غير متاح (وضع خاص مثلًا) — الإخفاء يبقى لهذه الجلسة فقط */
    }
    this.dismissedPermanently.set(true);
    this.forced.set(false);
  }

  /** إعادة إظهار الدعوة يدويًّا (من صفحة الحساب) رغم إغلاقها سابقًا. */
  showAgain(): void {
    this.forced.set(true);
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
