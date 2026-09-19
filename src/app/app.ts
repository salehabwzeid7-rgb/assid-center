import { Component, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { filter, take } from 'rxjs';
import { App as CapApp } from '@capacitor/app';
import { AuthService } from './core/auth.service';
import { DataService } from './core/data.service';
import { NotifyService } from './core/notify.service';
import { ThemeService } from './core/theme.service';
import { UpdateService } from './core/update.service';
import { UpdateBannerComponent } from './shared/update-banner';
import { BottomNavComponent } from './shared/bottom-nav';
import { ToastHostComponent } from './shared/toast-host';

declare global {
  interface Window {
    /** يُعرَّف داخل index.html — يُخفي شاشة البدء (تلاشٍ ثمّ إزالة من DOM). */
    __hideSplash?: () => void;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, BottomNavComponent, UpdateBannerComponent],
  template: `
    <div class="app-shell">
      <!-- تنبيه تقادم القشرة الأصليّة — يخصّ التطبيق كلّه لا شاشة بعينها. -->
      <app-update-banner />
      <router-outlet />
      <app-bottom-nav />
    </div>
    <app-toast-host />
  `,
})
export class App {
  private location = inject(Location);
  private router = inject(Router);
  // تهيئة السمة مبكرًا (تُطبَّق على <html>)
  private theme = inject(ThemeService);
  // فحص التحديثات المباشرة (OTA) على أندرويد
  private update = inject(UpdateService);
  private auth = inject(AuthService);
  private data = inject(DataService);
  private notify = inject(NotifyService);

  constructor() {
    this.update.init();
    this.hideSplashWhenReady();
    this.autoUpgradeLegacyAccount();
    this.autoBackfillPlatformSummary();

    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && history.length > 1) {
        this.location.back();
      } else {
        CapApp.exitApp();
      }
    }).catch(() => {
      /* لا شيء على الويب */
    });
  }

  /**
   * إصلاح تلقائيّ صامت لحساب قديم/مشترك (v1.25.6) — كان يدويًّا (زرّ في صفحة
   * الحساب، v1.25.5) بطلب صريح من المستخدم بعد أن فهم ما تفعله العمليّة
   * بالضبط. يعمل مرّة واحدة فقط تلقائيًّا: يتحقّق أنّ الحساب مسجَّل الدخول
   * وليس تينانت بعد، يشغّل DataService.upgradeLegacyAccountToTenant() (يقرأ
   * من الذاكرة المحليّة المخبَّأة على هذا الجهاز فقط، لا يلمس الخادم إطلاقًا
   * حتى يكتب الترحيل)، ثمّ يُعيد تحميل الصفحة عند النجاح حتى تُعيد كل
   * مستمعي onSnapshot الاشتراك بالاستعلامات المُقيَّدة الصحيحة الآن (Firestore
   * لا يُعيد محاولة مستمع فشل بخطأ صلاحيّات تلقائيًّا، خلافًا لأخطاء الشبكة
   * العابرة). زرّ «إصلاح الحساب الآن» في profile.ts يبقى موجودًا كمسار
   * احتياطيّ يدويّ إن فشلت المحاولة التلقائيّة (مثلًا بلا اتصال عند الإقلاع).
   * لا تكرار غير ضروريّ: بمجرّد نجاحها يصبح الحساب تينانت فلا يُستدعى الشرط
   * مجدّدًا في أيّ إقلاع لاحق.
   */
  private autoUpgradeLegacyAccount(): void {
    void (async () => {
      await this.auth.readyPromise;
      if (!this.auth.isLoggedIn() || this.auth.isTenant()) return;
      try {
        const migrated = await this.data.upgradeLegacyAccountToTenant();
        if (migrated > 0) {
          this.notify.success('تمّ إصلاح الحساب — يُعاد تحميل التطبيق الآن');
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch {
        // فشل صامت — لا نزعج المستخدم بتوست خطأ عند كلّ إقلاع (قد يكون بلا
        // اتصال مثلًا)؛ زرّ profile.ts اليدويّ يبقى متاحًا للمحاولة يدويًّا.
      }
    })();
  }

  /**
   * يملأ ملخّص لوحة المالك لحساب معلّم موجود مسبقًا (v1.26.3) — أيّ حساب
   * سجَّل قبل شحن الميزة (أو أنشأ حلقات/طلّابًا يومًا قبلها) لن يظهر بشكل
   * صحيح في لوحة المالك بلا هذا؛ `backfillPlatformTeacherSummary()` محميّة
   * من إعادة العمل (تتوقّف فورًا إن كان الملخّص مكتملًا بالفعل) فآمنة الاستدعاء
   * في كل إقلاع بلا أيّ كلفة تُذكَر بعد أوّل مرّة.
   *
   * `effect()` تفاعليّ لا فحص لمرّة واحدة عبر `readyPromise` (خلل حقيقيّ
   * مُكتشَف أثناء الاختبار v1.26.3): ذلك الوعد يُحسَم مرّة واحدة فقط عند أوّل
   * استدعاء لـ onAuthStateChanged — وهو عادةً يحدث فور إقلاع التطبيق **قبل**
   * أن يُسجِّل المستخدم دخوله تفاعليًّا من صفحة /login (فيُحسَم بـ
   * isLoggedIn()=false، ولا تُشغَّل التعبئة إطلاقًا لأيّ تسجيل دخول تفاعليّ
   * ضمن نفس تحميل الصفحة — تعمل فقط لو كان المستخدم مسجَّلًا دخوله بالفعل
   * قبل تحميل التطبيق، كإعادة فتحه). الحلّ: تفاعل مع تغيّر `auth.user()` نفسه
   * (يتغيّر أيضًا عند تسجيل الدخول/التسجيل التفاعليّ لا فقط عند الإقلاع)،
   * مع حارس `backfilledUid` لمنع تكرار الاستدعاء لنفس الحساب أكثر من مرّة
   * في نفس جلسة التطبيق.
   */
  private backfilledUid: string | null = null;
  private autoBackfillPlatformSummary(): void {
    effect(() => {
      if (!this.auth.ready()) return;
      const u = this.auth.user();
      if (!u || this.auth.isOwnerAccount() || this.backfilledUid === u.uid) return;
      this.backfilledUid = u.uid;
      void this.data.backfillPlatformTeacherSummary().catch(() => {});
    });
  }

  /**
   * تُخفي شاشة بدء الويب (index.html #app-splash) بعد استقرار أوّل توجيه —
   * أي بعد أن يحسم authGuard/guestGuard وجهة الدخول أو الرئيسيّة وتُعرَض
   * فعليًّا، لا بعد مدّة مخمَّنة. إطاران متتاليان (rAF) لضمان اكتمال الرسم
   * قبل بدء التلاشي فلا يظهر أيّ وميض أو قفزة.
   */
  private hideSplashWhenReady(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.__hideSplash?.());
        });
      });
  }
}
