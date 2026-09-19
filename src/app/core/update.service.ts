import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { NotifyService } from './notify.service';

/**
 * تحديث «مباشر» للتطبيق المُثبَّت (OTA) دون إعادة تنزيل ملفّ APK.
 *
 * تطبيق Capacitor ما هو إلّا غلاف WebView يحمل حزمة الويب (HTML/JS/CSS).
 * هذه الخدمة تسأل خادم Firebase Hosting عن أحدث حزمة، تنزّلها، وتُفعّلها:
 *   • عند إقلاع التطبيق: تُطبَّق فورًا بإعادة تحميل خفيفة (المستخدم لسّه ما بدأ العمل).
 *   • عند العودة للتطبيق أثناء العمل: تُؤجَّل للفتحة التالية حتى لا نقاطع المستخدم.
 *
 * الخادم: scripts/publish-ota.mjs يبني الحزمة، يضغطها، ويرفع
 *   public-apk/ota/bundle-<إصدار>.zip  +  public-apk/ota/latest.json
 *
 * ملاحظة: تعديلات الطبقة الأصليّة (إضافات Capacitor، الأذونات، versionCode)
 * وحدها تحتاج APK جديدًا — لا تصل عبر هذا المسار.
 */

const MANIFEST_URL = 'https://assid-center.web.app/ota/latest.json';

/** رابط تنزيل ملفّ APK — يُعرَض للمستخدم حين تتقادم قشرته الأصليّة. */
export const APK_DOWNLOAD_URL = 'https://assid-center.web.app/download';

/**
 * أدنى إصدار **للقشرة الأصليّة** تحتاجه حزمة الويب الحاليّة.
 *
 * يُرفَع يدويًّا **فقط** عند تغيير يمسّ الطبقة الأصليّة (إضافة Capacitor
 * جديدة، إذن جديد، تعديل في الإعدادات الأصليّة) — لا مع كلّ إصدار.
 *
 * سببه واقعة حقيقيّة: أُضيفت إضافتا الملفّات والمشاركة في v1.30.0 ووصلت
 * حزمة الويب عبر OTA إلى أجهزة قشرتها أقدم، فانهار حفظ PDF عندها برسالة
 * «Filesystem plugin is not implemented». المستخدم لم يكن يملك طريقة يعرف
 * بها أنّ عليه إعادة التثبيت. هذه القيمة تجعل التطبيق يقولها بنفسه.
 */
export const MIN_NATIVE_VERSION = '1.30.0';

/** مقارنة إصدارين «x.y.z» — يُعيد سالبًا إن كان a أقدم من b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface OtaManifest {
  version?: string;
  url?: string;
  checksum?: string;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private notify = inject(NotifyService);
  private checking = false;
  private readonly startedAt = Date.now();

  /** إصدار القشرة الأصليّة المثبَّتة — `null` على الويب أو قبل قراءته. */
  readonly nativeVersion = signal<string | null>(null);

  /**
   * هل القشرة الأصليّة أقدم ممّا تحتاجه حزمة الويب؟ عندها تكون بعض الميزات
   * معطّلة فعليًّا مهما تكرّر التحديث التلقائيّ، والحلّ الوحيد إعادة التثبيت.
   */
  readonly nativeOutdated = computed(() => {
    const v = this.nativeVersion();
    return v !== null && compareVersions(v, MIN_NATIVE_VERSION) < 0;
  });

  /** يُستدعى مرّة واحدة عند إقلاع التطبيق. لا يفعل شيئًا على الويب. */
  init(): void {
    if (Capacitor.getPlatform() !== 'android') return;

    // إبلاغ الإضافة أنّ الحزمة الحاليّة تعمل بنجاح — يمنع التراجع التلقائيّ.
    CapacitorUpdater.notifyAppReady().catch(() => {});

    // قراءة إصدار القشرة الأصليّة (versionName من build.gradle) — لا يتغيّر
    // إلّا بتثبيت APK جديد، بخلاف إصدار حزمة الويب الذي يتغيّر مع كلّ OTA.
    CapApp.getInfo()
      .then((info) => this.nativeVersion.set(info.version))
      .catch(() => {});

    void this.check(true);
    CapApp.addListener('resume', () => void this.check(true)).catch(() => {});
  }

  /**
   * فحص وجود تحديث وتنزيله وتفعيله.
   *
   * @param silent  عند `true` (الفحص التلقائيّ) لا تُعرض رسائل عند عدم وجود جديد
   *                أو عند انقطاع الشبكة؛ تُعرض فقط عند نزول تحديث فعليّ.
   * @returns وصف مختصر للنتيجة — يفيد الاستدعاء اليدويّ من صفحة الحساب.
   */
  async check(silent = false): Promise<string> {
    if (Capacitor.getPlatform() !== 'android') {
      if (!silent) this.notify.info('التحديث المباشر متاح على تطبيق أندرويد فقط');
      return 'غير مدعوم';
    }
    if (this.checking) return 'الفحص جارٍ…';
    this.checking = true;

    try {
      const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`تعذّر الوصول للخادم (${res.status})`);
      const m = (await res.json()) as OtaManifest;
      if (!m.version || !m.url) throw new Error('بيان التحديث غير صالح');

      const cur = await CapacitorUpdater.current();
      if (m.version === cur.bundle.version) {
        if (!silent) this.notify.success('التطبيق مُحدَّث لآخر نسخة ✅');
        return 'محدَّث';
      }

      // إن سبق تنزيل هذه النسخة ولم تُفعَّل بعد — لا تُعِد التنزيل.
      let bundleId: string;
      const existing = (await CapacitorUpdater.list().catch(() => ({ bundles: [] }))).bundles.find(
        (b) => b.version === m.version && b.status !== 'error',
      );
      if (existing) {
        bundleId = existing.id;
      } else {
        if (!silent) this.notify.info('يجري تنزيل التحديث…');
        const dl = await CapacitorUpdater.download({
          url: m.url,
          version: m.version,
          ...(m.checksum ? { checksum: m.checksum } : {}),
        });
        bundleId = dl.id;
      }

      // فحص عند الإقلاع (خلال ٨ ثوانٍ من بدء التطبيق) → تطبيق فوريّ بإعادة تحميل خفيفة.
      // فحص أثناء الاستخدام → تأجيل للفتحة التالية دون مقاطعة.
      const freshStart = Date.now() - this.startedAt < 8000;
      await CapacitorUpdater.next({ id: bundleId });
      if (freshStart || !silent) {
        await CapacitorUpdater.reload();
        return 'طُبِّق';
      }
      this.notify.info('نزل تحديث جديد — سيظهر عند إعادة فتح التطبيق');
      return 'مؤجَّل';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!silent) this.notify.error(`تعذّر التحديث — ${msg}`);
      return `خطأ: ${msg}`;
    } finally {
      this.checking = false;
    }
  }
}
