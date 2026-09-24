import { Component, signal } from '@angular/core';

/**
 * شريط إرشاد التثبيت لزوّار سفاري على آيفون/آيباد (PWA).
 *
 * لماذا يلزم أصلًا: أندرويد/كروم يعرضان نافذة «تثبيت» تلقائيّة (حدث
 * `beforeinstallprompt`) — سفاري لا يُطلق هذا الحدث إطلاقًا ولا يعرض أيّ
 * دعوة، فالمستخدم لا يعرف أصلًا أنّ الصفحة قابلة للتثبيت ما لم نخبره صراحةً
 * بالخطوات اليدويّة (زرّ المشاركة ← إضافة إلى الشاشة الرئيسية).
 *
 * يظهر فقط حين: المتصفّح سفاري على iOS/iPadOS حقيقيّ (لا أندرويد ولا سطح
 * مكتب)، والصفحة مفتوحة داخل تبويب متصفّح عاديّ لا مثبَّتة أصلًا (فحص
 * `navigator.standalone` ومطابقة `display-mode`)، ولم يُغلقه المستخدم من
 * قبل على هذا الجهاز (تخزين محليّ دائم — هذه دعوة لمرّة واحدة لا تنبيه حالة
 * متكرّرة مثل `UpdateBannerComponent`، فإغلاقها نهائيّ لا لهذه الجلسة فقط).
 */
const DISMISS_KEY = 'assid-center:ios-install-dismissed';

@Component({
  selector: 'app-ios-install-banner',
  template: `
    @if (show()) {
      <div class="iib" role="status">
        <div class="iib-body">
          <div class="iib-title">ثبّت الماهر على شاشتك الرئيسية</div>
          <div class="iib-text">
            اضغط زرّ المشاركة
            <span class="iib-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v13" stroke-linecap="round" />
                <path d="M7 8 12 3l5 5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke-linecap="round" />
              </svg>
            </span>
            في سفاري، ثمّ اختر «إضافة إلى الشاشة الرئيسية».
          </div>
        </div>
        <button type="button" class="iib-x" (click)="dismiss()" aria-label="إخفاء">✕</button>
      </div>
    }
  `,
  styles: [
    `
      .iib {
        position: fixed;
        inset-inline: 10px;
        bottom: calc(10px + var(--safe-bottom));
        z-index: 85;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 12px 12px 14px;
        border-radius: var(--radius-sm);
        background: var(--green-deep);
        color: #fff;
        box-shadow: var(--shadow-lg);
        border: 1px solid rgba(255, 255, 255, 0.14);
      }
      .iib-body {
        flex: 1;
        min-width: 0;
      }
      .iib-title {
        font-weight: 800;
        font-size: 0.9rem;
        margin-bottom: 3px;
      }
      .iib-text {
        font-size: 0.82rem;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.86);
      }
      .iib-ico {
        display: inline-flex;
        vertical-align: -6px;
        width: 18px;
        height: 18px;
        margin: 0 2px;
        color: #ffe08a;
      }
      .iib-ico svg {
        width: 100%;
        height: 100%;
      }
      .iib-x {
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        font-size: 0.95rem;
        cursor: pointer;
      }
    `,
  ],
})
export class IosInstallBannerComponent {
  private readonly dismissed = signal(this.readDismissed());

  readonly show = signal(this.computeShow());

  constructor() {
    // إعادة الحساب مرّة واحدة بعد الإقلاع تكفي — لا حالة تتغيّر لاحقًا تستحقّ
    // تتبّعًا تفاعليًّا (لا شيء في القياسات المستخدَمة يتبدّل أثناء الجلسة).
    this.show.set(this.computeShow());
  }

  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* تخزين محليّ غير متاح (وضع خاص مثلًا) — الإخفاء يبقى لهذه الجلسة فقط */
    }
    this.dismissed.set(true);
    this.show.set(false);
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  private computeShow(): boolean {
    if (this.dismissed()) return false;
    if (!this.isIosSafari()) return false;
    if (this.isStandalone()) return false;
    return true;
  }

  /** iOS/iPadOS حقيقيّ (لا أندرويد، ولا سطح مكتب). iPadOS 13+ يُعرِّف نفسه
   * كـ macOS في userAgent، فيُميَّز بدعم اللمس بدل ذلك. */
  private isIosSafari(): boolean {
    const ua = navigator.userAgent;
    const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isIPhoneOrIPad || isIPadOS13Plus;
  }

  /** مثبَّت أصلًا على الشاشة الرئيسية — لا داعي للدعوة. */
  private isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }
}
