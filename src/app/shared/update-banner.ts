import { Component, computed, inject, signal } from '@angular/core';
import { APK_DOWNLOAD_URL, UpdateService } from '../core/update.service';

/* ==========================================================================
   شريط تنبيه: القشرة الأصليّة أقدم ممّا تحتاجه حزمة الويب.

   لماذا يلزم أصلًا: التحديث المباشر (OTA) ينقل حزمة الويب وحدها ولا يمسّ
   الطبقة الأصليّة. فأيّ ميزة تعتمد على إضافة Capacitor جديدة تبقى معطّلة على
   الأجهزة التي لم تُعِد تثبيت APK، **مهما تكرّر التحديث التلقائيّ**. وقبل هذا
   الشريط لم تكن لدى المستخدم أيّ وسيلة ليعرف ذلك: يضغط الزرّ فيفشل، ويظنّ
   العطل في التطبيق لا في نسخته.

   يظهر في كلّ الشاشات لا في التقارير وحدها، لأنّ التقادم يخصّ التطبيق كلّه.
   ويصل هذا الشريط نفسه عبر OTA — فيعمل عند الجميع بلا إعادة تثبيت، وهو بالضبط
   ما يجعله قادرًا على إبلاغهم بضرورة إعادة التثبيت.

   الإخفاء يدويّ ولهذه الجلسة فقط (لا يُحفَظ): التقادم لا يزول إلّا بالتثبيت،
   فإخفاؤه نهائيًّا يعني إسكات التنبيه عن مشكلة قائمة.
   ========================================================================== */

@Component({
  selector: 'app-update-banner',
  template: `
    @if (show()) {
      <div class="ub" role="status">
        <div class="ub-body">
          <div class="ub-title">نسخة التطبيق لديك قديمة</div>
          <div class="ub-text">
            بعض الميزات معطّلة (منها حفظ ملفّ PDF). التحديث التلقائيّ لا يكفي — حمّل النسخة الجديدة
            وثبّتها فوق الحالية. بياناتك لا تتأثّر.
          </div>
          <a class="ub-btn" [href]="downloadUrl" target="_blank" rel="noopener">⬇ تحميل التحديث</a>
        </div>
        <button type="button" class="ub-x" (click)="dismissed.set(true)" aria-label="إخفاء">
          ✕
        </button>
      </div>
    }
  `,
  styles: [
    `
      .ub {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin: 10px 12px 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff6e8;
        border: 1px solid #f0d9b3;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      }
      .ub-body {
        flex: 1;
        min-width: 0;
      }
      .ub-title {
        font-size: 0.9rem;
        font-weight: 800;
        color: #7a4e00;
      }
      .ub-text {
        margin-top: 4px;
        font-size: 0.78rem;
        line-height: 1.85;
        color: #8a6320;
      }
      .ub-btn {
        display: inline-block;
        margin-top: 10px;
        padding: 9px 16px;
        border-radius: 10px;
        background: #0d5c3f;
        color: #fff;
        font-size: 0.84rem;
        font-weight: 800;
        text-decoration: none;
      }
      .ub-x {
        flex: none;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid #f0d9b3;
        background: none;
        color: #8a6320;
        font-size: 0.8rem;
        cursor: pointer;
      }
    `,
  ],
})
export class UpdateBannerComponent {
  private readonly update = inject(UpdateService);

  readonly downloadUrl = APK_DOWNLOAD_URL;
  readonly dismissed = signal(false);

  readonly show = computed(() => this.update.nativeOutdated() && !this.dismissed());
}
