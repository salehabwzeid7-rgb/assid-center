import { Component, computed, inject, input, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NotifyService } from '../core/notify.service';

/** مقطع تسميع واحد داخل صفّ الطالب — أو نائب حالة («لم يسمع»/«غائب») بدل مقطع فعليّ. */
export interface ReportImageSegment {
  /** نوع التسميع + مدى السورة، مثال: «حفظ جديد: البقرة ١ ← البقرة ١٠». فارغ لصفّ النائب. */
  detail?: string;
  hesitation?: number;
  mistakes?: number;
  rating?: string;
  notes?: string;
  /** نصّ نائب يشغل بقيّة الصفّ بدل الأعمدة العدديّة — «لم يسمع» أو «غائب» أو حالة الحضور. */
  placeholderText?: string;
  placeholderClass?: 'not-recited' | 'absent';
}

/** صفّ طالب واحد — قد يحوي أكثر من مقطع تسميع (حفظ جديد + مراجعة بنفس الجلسة). */
export interface ReportImageRow {
  index: number;
  name: string;
  /** مدى وقت الحضور/الانصراف («٤:٠٠ م – ٥:٠٠ م») أو فارغ إن لم يكن حاضرًا. */
  attendanceLabel: string;
  segments: ReportImageSegment[];
}

/** صفحة واحدة من التقرير المصوَّر — بحدّ أقصى ثابت لعدد الطلّاب في كلّ صفحة. */
export interface ReportImagePage {
  pageNumber: number;
  totalPages: number;
  rows: ReportImageRow[];
}

export interface ReportImageMeta {
  title: string;
  totals: string;
}

/**
 * التقرير المصوَّر (صورة قابلة للمشاركة) — يحوّل بيانات الجلسة إلى صفحات جدول
 * جاهزة، ثم يُرسِم كلّ صفحة إلى PNG عبر html-to-image (استيراد ديناميكيّ حتى
 * لا يُثقِل الحزمة الرئيسيّة، بنفس أسلوب استيراد إضافات Capacitor في المشروع).
 * كل صفحة صورة مستقلّة بترويستها الخاصّة (تصلح للمشاركة منفردة).
 */
@Component({
  selector: 'app-report-image',
  template: `
    <div class="ri-wrap">
      @if (!generated()) {
        <button type="button" class="btn btn-ghost" (click)="generate()" [disabled]="busy()">
          {{ busy() ? 'جارٍ التوليد…' : '🖼️ توليد صور التقرير' }}
        </button>
      } @else {
        <div class="ri-toolbar">
          <span class="muted" style="font-size:.82rem"
            >{{ pages().length }} {{ pages().length === 1 ? 'صورة' : 'صور' }} — ١٥ طالبًا كحدّ أقصى
            لكلّ صورة</span
          >
          <button type="button" class="chip" (click)="regenerate()" [disabled]="busy()">
            ↻ إعادة التوليد
          </button>
        </div>
      }

      <!--
        الصفحات المصدرية (تُرسَم دائمًا في الشجرة الحيّة كي تلتقط html-to-image الأنماط الفعليّة).
        غلاف بحجم صفريّ + overflow:hidden بدل إزاحة مطلقة هائلة (كانت top/left: -99999px) —
        الإزاحات المتطرّفة هذه سبّبت شاشة خضراء صلبة كاملة على بعض متصفّحات الجوّال/WebView
        (على الأرجح خلل تركيب طبقات GPU عند إزاحة عنصر بهذا البُعد الهائل)؛ هذا النمط
        (حاوية ثابتة بحجم صفريّ تُخفي المحتوى بالقصّ لا بالإزاحة) هو النمط الآمن المعتاد
        مع مكتبات html2canvas/html-to-image.
      -->
      <div class="ri-offscreen">
        @for (page of pages(); track page.pageNumber) {
          <div class="ri-page" #pageEl [attr.data-page]="page.pageNumber">
            <div class="ri-band"></div>
            <div class="ri-header">
              <div class="ri-title">{{ meta().title }}</div>
              <div class="ri-totals">{{ meta().totals }}</div>
              @if (page.totalPages > 1) {
                <div class="ri-pageno">صفحة {{ page.pageNumber }} من {{ page.totalPages }}</div>
              }
            </div>
            <table class="ri-table">
              <thead>
                <tr>
                  <th class="ri-c-idx">#</th>
                  <th class="ri-c-name">اسم الطالب</th>
                  <th class="ri-c-att">الحضور</th>
                  <th class="ri-c-detail">السورة (من – إلى)</th>
                  <th class="ri-c-num">تردّد</th>
                  <th class="ri-c-num">خطأ</th>
                  <th class="ri-c-rating">العلامة</th>
                  <th class="ri-c-notes">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                @for (row of page.rows; track row.index) {
                  @for (seg of row.segments; track $index) {
                    <tr [class.ri-row-absent]="seg.placeholderClass === 'absent'">
                      @if ($index === 0) {
                        <td class="ri-c-idx" [attr.rowspan]="row.segments.length">
                          {{ row.index }}
                        </td>
                        <td class="ri-c-name" [attr.rowspan]="row.segments.length">
                          {{ row.name }}
                        </td>
                        <td class="ri-c-att" [attr.rowspan]="row.segments.length">
                          {{ row.attendanceLabel || '—' }}
                        </td>
                      }
                      @if (seg.placeholderText) {
                        <td
                          colspan="5"
                          class="ri-placeholder"
                          [class.ri-not-recited]="seg.placeholderClass === 'not-recited'"
                          [class.ri-absent]="seg.placeholderClass === 'absent'"
                        >
                          {{ seg.placeholderText }}
                        </td>
                      } @else {
                        <td class="ri-c-detail">{{ seg.detail }}</td>
                        <td class="ri-c-num">{{ seg.hesitation }}</td>
                        <td class="ri-c-num">{{ seg.mistakes }}</td>
                        <td class="ri-c-rating">{{ seg.rating }}</td>
                        <td class="ri-c-notes">{{ seg.notes || '—' }}</td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
            <div class="ri-band"></div>
          </div>
        }
      </div>

      @if (generated() && pages().length > 0) {
        <div class="ri-results">
          @for (img of images(); track img.pageNumber) {
            <div class="ri-result">
              <button
                type="button"
                class="ri-thumb-btn"
                (click)="openLightbox(img)"
                [attr.aria-label]="'عرض صورة التقرير بالحجم الكامل — صفحة ' + img.pageNumber"
              >
                <img [src]="img.dataUrl" [alt]="'صورة التقرير — صفحة ' + img.pageNumber" />
                <span class="ri-thumb-hint">اضغط للعرض بالحجم الكامل 🔍</span>
              </button>
              <div class="ri-result-actions">
                <button
                  type="button"
                  class="btn btn-ghost"
                  (click)="download(img)"
                  [disabled]="saving() === img.pageNumber"
                >
                  {{
                    saving() === img.pageNumber
                      ? 'جارٍ الحفظ…'
                      : '⬇ تنزيل' + (pages().length > 1 ? ' (صفحة ' + img.pageNumber + ')' : '')
                  }}
                </button>
                @if (canShareFiles()) {
                  <button type="button" class="btn btn-ghost" (click)="share(img)">↗ مشاركة</button>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (lightboxImg(); as lb) {
        <div class="ri-lightbox" (click)="closeLightbox()">
          <button
            type="button"
            class="ri-lightbox-close"
            (click)="closeLightbox()"
            aria-label="إغلاق"
          >
            ✕
          </button>
          <img
            [src]="lb.dataUrl"
            [alt]="'صورة التقرير — صفحة ' + lb.pageNumber"
            (click)="$event.stopPropagation()"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ri-wrap {
        margin-top: 10px;
      }
      .ri-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      /*
        غلاف بحجم صفريّ يقصّ محتواه (overflow:hidden) بدل عنصر بإزاحة مطلقة هائلة —
        النمط الآمن المعتاد لتحضير عناصر خارج الرؤية قبل التقاطها بمكتبات مثل
        html-to-image؛ إزاحة متطرّفة (كـ top/left: -99999px) قد تُربك تركيب الطبقات
        على بعض متصفّحات الجوّال/WebView (لاحظنا شاشة خضراء صلبة كاملة نتيجتها).
      */
      .ri-offscreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
      }
      .ri-page {
        width: 760px;
        background: var(--surface, #fff);
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', system-ui, sans-serif;
        direction: rtl;
      }
      .ri-band {
        height: 10px;
        background-image: var(--misk-pattern, none);
        background-repeat: repeat-x;
        background-size: 22px 10px;
        opacity: 0.55;
      }
      .ri-header {
        padding: 18px 24px 12px;
        text-align: center;
        border-bottom: 2px solid var(--gold, #a9822f);
      }
      .ri-title {
        font-size: 1.2rem;
        font-weight: 800;
        color: var(--gold-deep, #a9822f);
      }
      .ri-totals {
        margin-top: 4px;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text-soft, #555);
      }
      .ri-pageno {
        margin-top: 2px;
        font-size: 0.78rem;
        color: var(--text-soft, #888);
      }
      .ri-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
      }
      .ri-table th {
        background: var(--gold-tint, #f3ebd6);
        color: var(--gold-deep, #a9822f);
        font-weight: 800;
        padding: 8px 6px;
        border-bottom: 2px solid var(--gold, #a9822f);
      }
      .ri-table td {
        padding: 7px 6px;
        border-bottom: 1px solid var(--border, #e5e0d3);
        text-align: center;
        vertical-align: middle;
      }
      .ri-c-name {
        font-weight: 700;
        text-align: start;
      }
      .ri-c-detail {
        text-align: start;
        font-size: 0.78rem;
      }
      .ri-c-notes {
        text-align: start;
        font-size: 0.76rem;
        color: var(--text-soft, #666);
      }
      .ri-placeholder {
        text-align: center;
        font-weight: 700;
      }
      .ri-not-recited {
        color: var(--danger, #b3261e);
      }
      .ri-absent {
        color: var(--text-soft, #999);
      }
      .ri-row-absent {
        background: var(--bg, #faf8f2);
        opacity: 0.75;
      }
      .ri-results {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-top: 12px;
      }
      .ri-thumb-btn {
        display: block;
        width: 100%;
        padding: 0;
        border: 1px solid var(--border, #e5e0d3);
        border-radius: 10px;
        background: none;
        cursor: pointer;
        position: relative;
        overflow: hidden;
      }
      .ri-thumb-btn img {
        display: block;
        width: 100%;
        border-radius: 9px;
      }
      .ri-thumb-hint {
        position: absolute;
        inset-inline: 0;
        bottom: 0;
        padding: 6px 10px;
        font-size: 0.76rem;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
        text-align: center;
      }
      .ri-result-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
      .ri-lightbox {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.88);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        cursor: zoom-out;
      }
      .ri-lightbox img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
        cursor: default;
      }
      .ri-lightbox-close {
        position: absolute;
        top: 16px;
        inset-inline-end: 16px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        font-size: 1.1rem;
        cursor: pointer;
      }
    `,
  ],
})
export class ReportImageComponent {
  private readonly notify = inject(NotifyService);

  readonly pages = input.required<ReportImagePage[]>();
  readonly meta = input.required<ReportImageMeta>();

  readonly busy = signal(false);
  readonly generated = signal(false);
  readonly images = signal<{ pageNumber: number; dataUrl: string }[]>([]);
  /** رقم الصفحة الجاري حفظها حاليًّا (أو null) — لتعطيل زرّها فقط أثناء الحفظ. */
  readonly saving = signal<number | null>(null);
  /** الصورة المعروضة حاليًّا بالحجم الكامل (نافذة معاينة) — أو null إن لم تُفتَح أيّ صورة. */
  readonly lightboxImg = signal<{ pageNumber: number; dataUrl: string } | null>(null);

  readonly canShareFiles = computed(() => {
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    return typeof nav.canShare === 'function';
  });

  async generate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const { toPng } = await import('html-to-image');
      // ننتظر جولتَي رسم كاملتَين (بدل مهلة زمنية ثابتة) حتى يستقرّ تخطيط
      // عناصر .ri-page فعليًّا قبل الالتقاط — أوثق عبر أجهزة/متصفّحات مختلفة.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = document.querySelectorAll<HTMLElement>('.ri-page');
      const out: { pageNumber: number; dataUrl: string }[] = [];
      for (const node of Array.from(nodes)) {
        const pageNumber = Number(node.dataset['page']) || out.length + 1;
        // تمرير الأبعاد صراحةً (بدل الاعتماد على حساب html-to-image التلقائيّ)
        // يزيل أيّ التباس في حجم اللوحة الملتقَطة عبر المتصفّحات المختلفة.
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: node.scrollWidth,
          height: node.scrollHeight,
        });
        out.push({ pageNumber, dataUrl });
      }
      this.images.set(out);
      this.generated.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  regenerate(): void {
    this.generated.set(false);
    this.images.set([]);
    void this.generate();
  }

  openLightbox(img: { pageNumber: number; dataUrl: string }): void {
    this.lightboxImg.set(img);
  }

  closeLightbox(): void {
    this.lightboxImg.set(null);
  }

  /**
   * ألبوم الصور المخصَّص لتقارير الجلسات — يُنشَأ مرّة واحدة فقط عند أوّل حفظ،
   * ثم يُعاد استخدام نفس المعرّف. مُخبَّأ هنا فقط (لا نخزّنه)؛ لو أُعيد إنشاء
   * المكوّن (فتح تقرير جديد) يُعاد البحث عنه بالاسم بدل إنشاء ألبوم مكرّر.
   */
  private albumId: string | null = null;
  private static readonly ALBUM_NAME = 'تقارير الماهر';

  /** نصّ خطأ مقروء من أيّ قيمة مرفوضة — يُعرَض للمستخدم بدل رسالة عامّة غامضة. */
  private errText(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  /** يبني ملفًّا من data URL ويُشارِكه عبر واجهة المشاركة القياسيّة (Web Share API). يُعيد نجاح/فشل بلا رمي استثناء. */
  private async webShareFile(
    img: { pageNumber: number; dataUrl: string },
    title: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `تقرير-الجلسة-${img.pageNumber}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean;
        share: (d: ShareData) => Promise<void>;
      };
      if (!nav.canShare?.({ files: [file] })) return false;
      await nav.share({ files: [file], title });
      return true;
    } catch (e) {
      console.error('[report-image] فشلت المشاركة عبر Web Share API:', e);
      return false;
    }
  }

  /**
   * على الويب: تنزيل عاديّ عبر رابط `<a download>` — يعمل بشكل موثوق في المتصفّحات.
   *
   * على أندرويد (Capacitor WebView)، محاولتان مستقلّتان بالترتيب (كلّ واحدة
   * لا تعتمد على الأخرى، فشل الأولى لا يمنع تجربة الثانية):
   *  ١) `@capacitor-community/media` (`savePhoto`) — حفظ مباشر في معرض الصور
   *     ضمن ألبوم خاصّ بالتطبيق. أفضل تجربة إن نجحت (بلا أيّ تدخّل من المستخدم).
   *  ٢) صفحة مشاركة النظام (`navigator.share`) — يختار المستخدم بنفسه أين
   *     يحفظ الصورة (المعرض، الملفّات، واتساب...). لا تعتمد على أيّ إضافة
   *     Capacitor إطلاقًا (معيار وِبّ خالص) فتبقى مسارًا مستقلًّا حقًّا لا يفشل
   *     لنفس سبب فشل المحاولة الأولى.
   * إن فشلتا معًا، تُعرَض رسالة الخطأ **الفعليّة** من المحاولة الأولى (بدل
   * نصّ عامّ ثابت) — كانت رسالتا الإصدارين ١.٢٣.٢/١.٢٣.٣ السابقتين نصًّا ثابتًا
   * لا يحمل أيّ معلومة تشخيصيّة حقيقيّة، فلم يكن ممكنًا معرفة السبب الفعليّ من
   * بلاغ المستخدم وحده — هذا الإصدار يُصلح تلك الفجوة التشخيصيّة تحديدًا، حتى
   * لو ظلّ الحفظ المباشر يفشل لسبب لم يظهر بعد.
   */
  async download(img: { pageNumber: number; dataUrl: string }): Promise<void> {
    const fileName = `تقرير-الجلسة-${img.pageNumber}`;
    if (!Capacitor.isNativePlatform()) {
      const a = document.createElement('a');
      a.href = img.dataUrl;
      a.download = fileName + '.png';
      a.click();
      return;
    }
    this.saving.set(img.pageNumber);
    let primaryErr = '';
    try {
      const { Media } = await import('@capacitor-community/media');
      if (!this.albumId) {
        const { albums } = await Media.getAlbums();
        const existing = albums.find((a) => a.name === ReportImageComponent.ALBUM_NAME);
        this.albumId = existing?.identifier ?? null;
        if (!this.albumId) {
          await Media.createAlbum({ name: ReportImageComponent.ALBUM_NAME });
          const { albums: after } = await Media.getAlbums();
          this.albumId =
            after.find((a) => a.name === ReportImageComponent.ALBUM_NAME)?.identifier ?? null;
        }
      }
      if (!this.albumId) throw new Error('لم يظهر الألبوم بعد إنشائه');
      await Media.savePhoto({ path: img.dataUrl, albumIdentifier: this.albumId, fileName });
      this.notify.success(
        `حُفظت الصورة في معرض الصور — ألبوم «${ReportImageComponent.ALBUM_NAME}».`,
      );
      this.saving.set(null);
      return;
    } catch (e) {
      primaryErr = this.errText(e);
      console.error('[report-image] فشل الحفظ المباشر في المعرض:', e);
    }

    const shared = await this.webShareFile(img, 'تقرير الجلسة');
    this.saving.set(null);
    if (shared) return;

    this.notify.error(
      `تعذّر حفظ الصورة تلقائيًّا (${primaryErr || 'خطأ غير معروف'}). افتح الصورة بالضغط عليها واحفظها يدويًّا (ضغط مطوَّل ← حفظ الصورة).`,
    );
  }

  async share(img: { pageNumber: number; dataUrl: string }): Promise<void> {
    const ok = await this.webShareFile(img, 'تقرير الجلسة');
    if (!ok && !Capacitor.isNativePlatform()) {
      // على الويب فقط: لا مشاركة نظام متاحة، فالبديل المعقول الوحيد تنزيل عاديّ.
      await this.download(img);
    }
  }
}
