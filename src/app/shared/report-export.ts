import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NotifyService } from '../core/notify.service';
import { renderPdf, type PdfDoc } from '../core/report-pdf';

/* ==========================================================================
   آليّة تصدير التقارير — صورة PNG وملفّ PDF.

   المكوّن **لا يعرف شيئًا عن شكل التقرير**: يستقبل التخطيط عبر `<ng-content>`،
   ويلتقط كلّ عنصر يحمل الصنف `.rx-page` داخله كصفحة مستقلّة. فكلّ تقرير
   (تحفيظ، تجويد، طالب، عامّ) يكتب تخطيطه الخاصّ، وتبقى آليّة الالتقاط والحفظ
   نسخةً واحدة — بدل نسخة لكلّ تقرير تتعفّن كلٌّ منها على حدة.

   معالجات مُثبَتة نُقلت كما هي من `report-image.ts`، ولا تُبسَّط:
     • غلاف بحجم صفريّ + `overflow:hidden` لإخفاء الصفحات المصدريّة — **لا**
       إزاحة مطلقة هائلة (`-99999px`)، فقد سبّبت شاشة خضراء صلبة كاملة على
       بعض متصفّحات الجوّال/WebView (خلل تركيب طبقات GPU).
     • انتظار جولتَي رسم كاملتَين (`requestAnimationFrame` مزدوج) بدل مهلة
       زمنيّة ثابتة — أوثق عبر الأجهزة المختلفة.
     • عند الفشل تُعرَض رسالة الخطأ **الفعليّة** لا نصّ عامّ (الفجوة
       التشخيصيّة التي أُصلحت في v1.23.4).

   سلسلة الحفظ على أندرويد، ثلاث محاولات مستقلّة لا تعتمد إحداها على الأخرى:
     ١) للصور فقط: حفظ مباشر في المعرض (`@capacitor-community/media`).
     ٢) كتابة أصليّة (`@capacitor/filesystem`) ثمّ مشاركة أصليّة
        (`@capacitor/share`) — **المسار الأساسيّ لملفّ PDF**.
     ٣) واجهة المشاركة الوِبّيّة (`navigator.share`) كمحاولة أخيرة.

   الترتيب مقصود: كان المسار (٣) وحده هو المستعمَل لملفّ PDF في v1.28.0، وهو
   غير مدعوم بشكل موثوق داخل WebView على أندرويد، فكان الحفظ يفشل دائمًا.

   ملفّ PDF **نصّيّ** يُبنى في `core/report-pdf.ts` من نموذج المستند مباشرةً،
   لا من الصور. النصّ قابل للتحديد والبحث، والجداول خطوط متجهيّة تُطبع حادّة
   على الورق. (كان سابقًا صورًا داخل PDF لأنّ تشكيل العربيّة لم يكن محلولًا؛
   حُلّ بخطّ يحوي صور الحروف العربيّة — راجع report-pdf.ts.)

   الصورة تبقى مسارًا مستقلًّا للمشاركة السريعة في تطبيقات المراسلة، ولا يعتمد
   أحدهما على الآخر: يُمكن حفظ PDF دون توليد أيّ صورة.
   ========================================================================== */

@Component({
  selector: 'app-report-export',
  template: `
    <div class="rx-wrap">
      @if (!generated()) {
        <button
          type="button"
          class="btn btn-ghost btn-block"
          (click)="generate()"
          [disabled]="busy()"
        >
          {{ busy() ? 'جارٍ التوليد…' : '🖼️ توليد الصورة وملفّ PDF' }}
        </button>
      } @else {
        <div class="rx-toolbar">
          <span class="muted"
            >{{ images().length }} {{ images().length === 1 ? 'صفحة' : 'صفحات' }}</span
          >
          <button type="button" class="chip" (click)="regenerate()" [disabled]="busy()">
            ↻ إعادة التوليد
          </button>
        </div>
      }

      <!-- الصفحات المصدريّة: تُرسَم في الشجرة الحيّة (لا مخفيّة بـ display:none)
           كي تلتقط html-to-image أنماطها الفعليّة، وتُخفى بالقصّ لا بالإزاحة. -->
      <div class="rx-offscreen" #host>
        <ng-content />
      </div>

      <!-- PDF مستقلّ: نصّيّ ولا يحتاج توليد صور مسبقًا. -->
      @if (canPdf()) {
        <div class="rx-pdf-bar">
          <button type="button" class="btn btn-primary" (click)="savePdf()" [disabled]="pdfBusy()">
            {{ pdfBusy() ? 'جارٍ تحضير الملفّ…' : '📄 حفظ PDF (نصّ قابل للطباعة)' }}
          </button>
        </div>
      }

      @if (generated() && images().length > 0) {
        @if (needsApk()) {
          <!-- لا تظهر إلّا بعد محاولة فاشلة فعليّة: القشرة الأصليّة أقدم من
               حزمة الويب (وصلت عبر OTA وحدها). -->
          <p class="rx-note">📄 {{ NEEDS_APK }}</p>
        }

        <div class="rx-results">
          @for (img of images(); track img.pageNumber) {
            <div class="rx-result">
              <button
                type="button"
                class="rx-thumb-btn"
                (click)="openLightbox(img)"
                [attr.aria-label]="'عرض الصفحة ' + img.pageNumber + ' بالحجم الكامل'"
              >
                <img [src]="img.dataUrl" [alt]="'صفحة التقرير ' + img.pageNumber" />
                <span class="rx-thumb-hint">اضغط للعرض بالحجم الكامل 🔍</span>
              </button>
              <div class="rx-result-actions">
                <button
                  type="button"
                  class="btn btn-ghost"
                  (click)="downloadImage(img)"
                  [disabled]="saving() === img.pageNumber"
                >
                  {{
                    saving() === img.pageNumber
                      ? 'جارٍ الحفظ…'
                      : '⬇ حفظ الصورة' +
                        (images().length > 1 ? ' (صفحة ' + img.pageNumber + ')' : '')
                  }}
                </button>
                @if (canShareFiles()) {
                  <button type="button" class="btn btn-ghost" (click)="shareImage(img)">
                    ↗ مشاركة
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (lightboxImg(); as lb) {
        <div class="rx-lightbox" (click)="closeLightbox()">
          <button
            type="button"
            class="rx-lightbox-close"
            (click)="closeLightbox()"
            aria-label="إغلاق"
          >
            ✕
          </button>
          <img
            [src]="lb.dataUrl"
            [alt]="'صفحة التقرير ' + lb.pageNumber"
            (click)="$event.stopPropagation()"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .rx-wrap {
        margin-top: 10px;
      }
      .rx-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
        font-size: 0.82rem;
      }
      /* غلاف بحجم صفريّ يقصّ محتواه — النمط الآمن لتحضير عناصر خارج الرؤية
         قبل التقاطها. لا تستبدله بإزاحة مطلقة كبيرة. */
      .rx-offscreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
      }
      .rx-pdf-bar {
        display: flex;
        gap: 8px;
        margin: 10px 0;
      }
      .rx-note {
        margin: 10px 0;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--bg, #faf8f2);
        border: 1px dashed var(--border, #e5e0d3);
        font-size: 0.78rem;
        line-height: 1.9;
        color: var(--text-soft, #888);
      }
      .rx-pdf-bar .btn {
        flex: 1;
      }
      .rx-results {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .rx-thumb-btn {
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
      .rx-thumb-btn img {
        display: block;
        width: 100%;
        border-radius: 9px;
      }
      .rx-thumb-hint {
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
      .rx-result-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
      .rx-result-actions .btn {
        flex: 1;
      }
      .rx-lightbox {
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
      .rx-lightbox img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
        cursor: default;
      }
      .rx-lightbox-close {
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
export class ReportExportComponent {
  private readonly notify = inject(NotifyService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  /** اسم الملفّ المصدَّر بلا امتداد — مثل «تقرير-الماهر-2026-09». */
  readonly fileName = input<string>('تقرير');
  /** عنوان يظهر في صفحة مشاركة النظام. */
  readonly shareTitle = input<string>('تقرير');
  /**
   * نموذج المستند النصّيّ. عند وجوده يُبنى PDF نصًّا حقيقيًّا؛ وعند غيابه
   * يُرتدّ إلى بناء PDF من الصور (مسار قديم يبقى للتوافق).
   */
  readonly pdfModel = input<PdfDoc | null>(null);

  readonly busy = signal(false);
  readonly pdfBusy = signal(false);
  readonly generated = signal(false);
  readonly images = signal<{ pageNumber: number; dataUrl: string }[]>([]);
  readonly saving = signal<number | null>(null);
  readonly lightboxImg = signal<{ pageNumber: number; dataUrl: string } | null>(null);

  /**
   * هل تُعرَض أزرار المشاركة؟ على الجوّال **دائمًا** — المشاركة هناك تمرّ عبر
   * إضافة Capacitor الأصليّة ولا تحتاج دعم WebView لواجهة المشاركة الوِبّيّة.
   * كان الشرط سابقًا `navigator.canShare` وحده، فكانت الأزرار تختفي على
   * الأجهزة التي لا تدعمها رغم أنّ المشاركة الأصليّة تعمل عليها.
   */
  /**
   * تُرفَع بعد محاولة فاشلة سببها غياب الإضافات الأصليّة — لا قبلها.
   *
   * كان الزرّ سابقًا مشروطًا بكشفٍ مسبق عبر `Capacitor.isPluginAvailable`،
   * وهو كشف هشّ: الدالّة تقرأ سجلّ الإضافات المسجَّلة، والسجلّ لا يمتلئ إلّا
   * عند **استيراد** الإضافة — ونحن نستوردها ديناميكيًّا بعد الفحص. فكان
   * الفحص يقع على سجلّ فارغ ويُخفي الزرّ حتى على النسخة التي تعمل. القاعدة
   * الآن: نُحاول فعلًا، ونشرح عند الفشل — لا نمنع المستخدم بناءً على تخمين.
   */
  readonly needsApk = signal(false);

  /** PDF متاح متى وُجد نموذج نصّيّ، أو صور مولَّدة (المسار القديم). */
  readonly canPdf = computed(() => this.pdfModel() !== null || this.images().length > 0);

  readonly canShareFiles = computed(() => {
    if (Capacitor.isNativePlatform()) return true;
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    return typeof nav.canShare === 'function';
  });

  /* ---------- التوليد ---------- */

  async generate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const { toPng } = await import('html-to-image');
      // جولتا رسم كاملتان حتى يستقرّ تخطيط الصفحات فعليًّا قبل الالتقاط —
      // أوثق من أيّ مهلة زمنيّة ثابتة عبر الأجهزة والمتصفّحات المختلفة.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = this.host().nativeElement.querySelectorAll<HTMLElement>('.rx-page');
      if (nodes.length === 0) {
        this.notify.error('لا توجد صفحات لتوليدها');
        return;
      }
      const out: { pageNumber: number; dataUrl: string }[] = [];
      let i = 0;
      for (const node of Array.from(nodes)) {
        i++;
        // تمرير الأبعاد صراحةً يزيل أيّ التباس في حجم اللوحة عبر المتصفّحات.
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: node.scrollWidth,
          height: node.scrollHeight,
        });
        out.push({ pageNumber: i, dataUrl });
      }
      this.images.set(out);
      this.generated.set(true);
    } catch (e) {
      console.error('[report-export] فشل توليد الصور:', e);
      this.notify.error(`تعذّر توليد الصورة (${this.errText(e)})`);
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

  /* ---------- أدوات مشتركة ---------- */

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

  private async blobOf(dataUrl: string): Promise<Blob> {
    return (await fetch(dataUrl)).blob();
  }

  /** Blob → base64 خالص (بلا بادئة `data:`) — الصيغة التي يطلبها Filesystem. */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error ?? new Error('تعذّرت قراءة الملفّ'));
      fr.onload = () => {
        const s = String(fr.result);
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      fr.readAsDataURL(blob);
    });
  }

  /** يُشارِك ملفًّا عبر واجهة المشاركة الوِبّيّة. يُعيد نجاح/فشل بلا رمي استثناء. */
  private async webShareFile(file: File): Promise<boolean> {
    try {
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
      await nav.share({ files: [file], title: this.shareTitle() });
      return true;
    } catch (e) {
      // إلغاء المستخدم للمشاركة ليس خطأً — لا نُكمِل إلى بدائل بعده.
      if (this.isAbort(e)) return true;
      console.error('[report-export] فشلت المشاركة الوِبّيّة:', e);
      return false;
    }
  }

  private isAbort(e: unknown): boolean {
    const name = (e as { name?: string } | null)?.name ?? '';
    const msg = this.errText(e).toLowerCase();
    return name === 'AbortError' || msg.includes('abort') || msg.includes('cancel');
  }

  /**
   * هل الإضافات الأصليّة للملفّات متاحة فعلًا في **القشرة المثبَّتة**؟
   *
   * ليست مسألة نظريّة: التحديث المباشر (OTA) يحدّث حزمة الويب وحدها ولا يمسّ
   * الشيفرة الأصليّة إطلاقًا. فجهازٌ استلم جافاسكربت v1.29.0 فوق قشرة v1.28.0
   * لا يملك `Filesystem` ولا `Share` أصلًا، فيرمي النداء
   * «"Filesystem" plugin is not implemented on android» ويسقط التصدير كلّه.
   *
   * لذلك **كلّ** نداء أصليّ هنا مشروط بهذا الفحص، ولا يُبنى على افتراض أنّ
   * إصدار الويب يساوي إصدار القشرة. هذه القاعدة تسري على أيّ إضافة أصليّة
   * تُضاف مستقبلًا: تُضاف مع حارس، وإلّا انكسر التطبيق عند أوّل OTA.
   */
  private isNotImplemented(e: unknown): boolean {
    const msg = this.errText(e).toLowerCase();
    return msg.includes('not implemented') || msg.includes('unimplemented');
  }

  /** رسالة موحّدة حين تكون القشرة أقدم من حزمة الويب (تُقرأ من القالب أيضًا). */
  readonly NEEDS_APK =
    'حفظ PDF يحتاج تحديث التطبيق نفسه (لا التحديث التلقائيّ). حمّل النسخة الجديدة من ' +
    'assid-center.web.app/download وثبّتها فوق الحالية — بياناتك لا تتأثّر. وحتى ذلك الحين، ' +
    'زرّ «حفظ الصورة» يعمل بشكل كامل.';

  /**
   * حفظ/مشاركة ملفّ على أندرويد — **المسار الأصليّ الموثوق**.
   *
   * سبب وجوده: واجهة المشاركة الوِبّيّة (`navigator.share` بالملفّات) غير
   * مدعومة بشكل موثوق داخل WebView على أندرويد، فكانت تُرجع `canShare=false`
   * أو ترمي، فيفشل حفظ PDF كلّيًّا («تعذّر حفظ ملفّ PDF…») — وهو الخلل الذي
   * ظهر في v1.28.0. الحلّ: كتابة الملفّ فعليًّا عبر `@capacitor/filesystem`
   * ثمّ مشاركته بمُعرّفه عبر `@capacitor/share` (إضافتان أصليّتان لا تعتمدان
   * على دعم WebView لواجهة المشاركة الوِبّيّة إطلاقًا).
   *
   * يُكتَب الملفّ في `Cache` لأنّه لا يحتاج أذونات تخزين، ويتولّى النظام
   * تنظيفه لاحقًا — والنسخة الدائمة تُحفَظ من داخل تطبيق الوجهة (Drive،
   * الملفّات، واتساب) الذي يختاره المستخدم.
   */
  private async nativeSaveAndShare(
    blob: Blob,
    fileName: string,
  ): Promise<{ ok: boolean; uri?: string; error?: string; unavailable?: boolean }> {
    if (!Capacitor.isNativePlatform()) return { ok: false, error: 'ليست منصّة أصليّة' };

    let uri = '';
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = await this.blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Cache,
        recursive: true,
      });
      uri = written.uri;
    } catch (e) {
      console.error('[report-export] فشلت كتابة الملفّ:', e);
      // «not implemented» تعني قشرة أصليّة أقدم من حزمة الويب، لا عطلًا عابرًا.
      if (this.isNotImplemented(e)) {
        this.needsApk.set(true);
        return { ok: false, unavailable: true, error: this.errText(e) };
      }
      return { ok: false, error: this.errText(e) };
    }

    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: this.shareTitle(), files: [uri] });
      return { ok: true, uri };
    } catch (e) {
      if (this.isAbort(e)) return { ok: true, uri };
      console.error('[report-export] فشلت المشاركة الأصليّة:', e);
      if (this.isNotImplemented(e)) {
        this.needsApk.set(true);
        return { ok: false, uri, unavailable: true, error: this.errText(e) };
      }
      // الملفّ مكتوب فعلًا وإن تعذّرت المشاركة — نُعيد مساره ليُذكَر للمستخدم.
      return { ok: false, uri, error: this.errText(e) };
    }
  }

  /** تنزيل عاديّ عبر رابط — المسار الموثوق على الويب. */
  private anchorDownload(url: string, name: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }

  /* ---------- الصورة ---------- */

  private albumId: string | null = null;
  private static readonly ALBUM_NAME = 'تقارير الماهر';

  /**
   * على الويب: تنزيل عاديّ. وعلى أندرويد محاولتان مستقلّتان بالترتيب — كلّ
   * واحدة لا تعتمد على الأخرى، ففشل الأولى لا يمنع الثانية:
   *   ١) حفظ مباشر في معرض الصور ضمن ألبوم خاصّ (أفضل تجربة إن نجحت).
   *   ٢) صفحة مشاركة النظام (معيار وِبّ خالص، لا يعتمد على أيّ إضافة) —
   *      فيختار المستخدم بنفسه أين يحفظ (المعرض، الملفّات، واتساب…).
   * وإن فشلتا معًا تُعرَض رسالة الخطأ الفعليّة من الأولى.
   */
  async downloadImage(img: { pageNumber: number; dataUrl: string }): Promise<void> {
    const name = `${this.fileName()}-${img.pageNumber}`;
    if (!Capacitor.isNativePlatform()) {
      this.anchorDownload(img.dataUrl, name + '.png');
      return;
    }
    this.saving.set(img.pageNumber);
    let primaryErr = '';
    try {
      const { Media } = await import('@capacitor-community/media');
      if (!this.albumId) {
        const { albums } = await Media.getAlbums();
        this.albumId =
          albums.find((a) => a.name === ReportExportComponent.ALBUM_NAME)?.identifier ?? null;
        if (!this.albumId) {
          await Media.createAlbum({ name: ReportExportComponent.ALBUM_NAME });
          const { albums: after } = await Media.getAlbums();
          this.albumId =
            after.find((a) => a.name === ReportExportComponent.ALBUM_NAME)?.identifier ?? null;
        }
      }
      if (!this.albumId) throw new Error('لم يظهر الألبوم بعد إنشائه');
      await Media.savePhoto({ path: img.dataUrl, albumIdentifier: this.albumId, fileName: name });
      this.notify.success(
        `حُفظت الصورة في معرض الصور — ألبوم «${ReportExportComponent.ALBUM_NAME}».`,
      );
      this.saving.set(null);
      return;
    } catch (e) {
      primaryErr = this.errText(e);
      console.error('[report-export] فشل الحفظ المباشر في المعرض:', e);
    }

    // محاولة ثانية: كتابة أصليّة + مشاركة أصليّة (لا تعتمد على دعم WebView
    // لواجهة المشاركة الوِبّيّة)، ثمّ الوِبّيّة كمحاولة ثالثة مستقلّة.
    const blob = await this.blobOf(img.dataUrl);
    const res = await this.nativeSaveAndShare(blob, name + '.png');
    if (res.ok) {
      this.saving.set(null);
      return;
    }
    const shared = await this.webShareFile(new File([blob], name + '.png', { type: 'image/png' }));
    this.saving.set(null);
    if (shared) return;
    this.notify.error(
      `تعذّر حفظ الصورة تلقائيًّا (${primaryErr || res.error || 'خطأ غير معروف'}). افتح الصورة بالضغط عليها واحفظها يدويًّا (ضغط مطوَّل ← حفظ الصورة).`,
    );
  }

  async shareImage(img: { pageNumber: number; dataUrl: string }): Promise<void> {
    const blob = await this.blobOf(img.dataUrl);
    const name = `${this.fileName()}-${img.pageNumber}.png`;
    if (!Capacitor.isNativePlatform()) {
      const ok = await this.webShareFile(new File([blob], name, { type: 'image/png' }));
      if (!ok) this.anchorDownload(img.dataUrl, name);
      return;
    }
    const res = await this.nativeSaveAndShare(blob, name);
    if (res.ok) return;
    const shared = await this.webShareFile(new File([blob], name, { type: 'image/png' }));
    if (shared) return;
    // الصور لها مسار أصليّ آخر متاح حتى في القشرة القديمة (حفظ في المعرض)،
    // فلا نُخبِر المستخدم بالفشل ولدينا طريق يعمل — نسلكه ونُعلِمه بمكانها.
    await this.downloadImage(img);
  }

  /* ---------- PDF ---------- */

  /**
   * يبني ملفّ PDF بحجم A4، صفحة لكلّ صورة، مع هامش موحّد وتحجيم يحفظ نسبة
   * الأبعاد — فلا يُقصّ جزء من الجدول ولا يُشوَّه. المكتبة تُستورَد ديناميكيًّا
   * حتى لا تدخل الحزمة الرئيسيّة إطلاقًا (تُحمَّل فقط عند أوّل ضغطة على «PDF»).
   */
  private async buildPdfBlob(): Promise<Blob> {
    // المسار الأساسيّ: مستند نصّيّ حقيقيّ بجداول متجهيّة.
    const model = this.pdfModel();
    if (model) return renderPdf(model);

    // مسار احتياطيّ: صور داخل PDF (يبقى لمن لا يمرّر نموذجًا).
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const maxW = pw - margin * 2;
    const maxH = ph - margin * 2;

    const imgs = this.images();
    for (let i = 0; i < imgs.length; i++) {
      if (i > 0) pdf.addPage();
      const props = pdf.getImageProperties(imgs[i].dataUrl);
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      // توسيط أفقيّ، وإلصاق بالأعلى — أوضح للقراءة من التوسيط الرأسيّ.
      pdf.addImage(imgs[i].dataUrl, 'PNG', (pw - w) / 2, margin, w, h, undefined, 'FAST');
    }
    return pdf.output('blob');
  }

  /**
   * حفظ/مشاركة ملفّ PDF.
   *
   * على الويب: تنزيل مباشر — أوضح وأسرع.
   *
   * على أندرويد: **كتابة أصليّة ثمّ مشاركة أصليّة** (Filesystem + Share). كان
   * المسار السابق يعتمد على `navigator.share` بالملفّات وحدها، وهي غير مدعومة
   * بشكل موثوق في WebView، فكان الحفظ يفشل دائمًا برسالة «تعذّر حفظ ملفّ PDF».
   * وإن تعذّرت المشاركة بعد نجاح الكتابة، لا نقول «فشل» — الملفّ موجود فعلًا،
   * فنُخبِر المستخدم بمكانه بدل أن نُوهمه بضياعه.
   */
  async savePdf(): Promise<void> {
    if (this.pdfBusy() || !this.canPdf()) return;
    this.pdfBusy.set(true);
    try {
      const blob = await this.buildPdfBlob();
      const name = `${this.fileName()}.pdf`;

      if (!Capacitor.isNativePlatform()) {
        const url = URL.createObjectURL(blob);
        this.anchorDownload(url, name);
        // تحرير الرابط بعد أن يلتقطه المتصفّح فعليًّا.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.notify.success('نُزّل ملفّ PDF');
        return;
      }

      const res = await this.nativeSaveAndShare(blob, name);
      if (res.ok) {
        this.notify.success('جاهز — اختر أين تحفظ الملفّ أو لمن ترسله.');
        return;
      }

      // مسار احتياطيّ مستقلّ تمامًا: واجهة المشاركة الوِبّيّة، لعلّها مدعومة هنا.
      const shared = await this.webShareFile(new File([blob], name, { type: 'application/pdf' }));
      if (shared) return;

      if (res.unavailable) {
        // القشرة أقدم من حزمة الويب — رسالة تقول ماذا يفعل، لا «فشل» غامضة.
        this.notify.error(this.NEEDS_APK);
      } else if (res.uri) {
        this.notify.error(
          `حُفظ ملفّ PDF لكن تعذّر فتح المشاركة (${res.error || 'سبب غير معروف'}). الملفّ في: ${res.uri}`,
        );
      } else {
        this.notify.error(`تعذّر حفظ ملفّ PDF (${res.error || 'سبب غير معروف'}).`);
      }
    } catch (e) {
      console.error('[report-export] فشل توليد PDF:', e);
      this.notify.error(`تعذّر توليد ملفّ PDF (${this.errText(e)})`);
    } finally {
      this.pdfBusy.set(false);
    }
  }

  /** مشاركة PDF — نفس مسار الحفظ تمامًا على الجوّال، وتنزيل على الويب. */
  async sharePdf(): Promise<void> {
    await this.savePdf();
  }
}
