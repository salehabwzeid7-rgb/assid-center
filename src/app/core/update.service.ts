import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * تحديث «مباشر» للتطبيق المُثبَّت (OTA) دون إعادة تنزيل ملفّ APK.
 *
 * الفكرة: تطبيق Capacitor ما هو إلّا غلاف WebView يحمل حزمة الويب (HTML/JS/CSS).
 * هذه الخدمة تسأل خادم Firebase Hosting عن أحدث حزمة، وتنزّلها في الخلفيّة،
 * ثمّ تُفعّلها عند إعادة فتح التطبيق. أيّ تعديل في الواجهة أو المنطق يصل الأجهزة
 * تلقائيًّا خلال ثوانٍ من نشره — تعديلات الطبقة الأصليّة (إضافات Capacitor، الأذونات،
 * versionCode) وحدها تحتاج APK جديدًا.
 *
 * الخادم: scripts/publish-ota.mjs يبني الحزمة، يضغطها، ويرفع
 *   public-apk/ota/bundle-<إصدار>.zip  +  public-apk/ota/latest.json
 */

const MANIFEST_URL = 'https://assid-center.web.app/ota/latest.json';

interface OtaManifest {
  version: string;
  url: string;
  checksum?: string;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private checking = false;

  /** يُستدعى مرّة واحدة عند إقلاع التطبيق. لا يفعل شيئًا على الويب. */
  init(): void {
    if (Capacitor.getPlatform() !== 'android') return;

    // إبلاغ الإضافة أنّ الحزمة الحاليّة تعمل بنجاح — يمنع التراجع التلقائيّ.
    CapacitorUpdater.notifyAppReady().catch(() => {});

    void this.check();
    CapApp.addListener('resume', () => void this.check()).catch(() => {});
  }

  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const m = (await res.json()) as OtaManifest;
      if (!m?.version || !m?.url) return;

      const current = await CapacitorUpdater.current();
      if (m.version === current.bundle.version) return;

      const bundle = await CapacitorUpdater.download({
        url: m.url,
        version: m.version,
        ...(m.checksum ? { checksum: m.checksum } : {}),
      });

      // تُفعَّل الحزمة الجديدة عند إغلاق التطبيق وفتحه لاحقًا — دون مقاطعة المستخدم الآن.
      await CapacitorUpdater.next({ id: bundle.id });
    } catch {
      /* لا اتّصال أو خطأ في الشبكة — تُعاد المحاولة عند فتح التطبيق لاحقًا. */
    } finally {
      this.checking = false;
    }
  }
}
