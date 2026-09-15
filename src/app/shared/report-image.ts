import { Component, computed, input, signal } from '@angular/core';

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
              <img [src]="img.dataUrl" [alt]="'صورة التقرير — صفحة ' + img.pageNumber" />
              <div class="ri-result-actions">
                <button type="button" class="btn btn-ghost" (click)="download(img)">
                  ⬇ تنزيل{{ pages().length > 1 ? ' (صفحة ' + img.pageNumber + ')' : '' }}
                </button>
                @if (canShareFiles()) {
                  <button type="button" class="btn btn-ghost" (click)="share(img)">↗ مشاركة</button>
                }
              </div>
            </div>
          }
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
      .ri-result img {
        width: 100%;
        border-radius: 10px;
        border: 1px solid var(--border, #e5e0d3);
      }
      .ri-result-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
    `,
  ],
})
export class ReportImageComponent {
  readonly pages = input.required<ReportImagePage[]>();
  readonly meta = input.required<ReportImageMeta>();

  readonly busy = signal(false);
  readonly generated = signal(false);
  readonly images = signal<{ pageNumber: number; dataUrl: string }[]>([]);

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

  download(img: { pageNumber: number; dataUrl: string }): void {
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = `تقرير-الجلسة-${img.pageNumber}.png`;
    a.click();
  }

  async share(img: { pageNumber: number; dataUrl: string }): Promise<void> {
    try {
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `تقرير-الجلسة-${img.pageNumber}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean;
        share: (d: ShareData) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'تقرير الجلسة' });
      } else {
        this.download(img);
      }
    } catch {
      /* المستخدم ألغى المشاركة — لا حاجة لرسالة خطأ */
    }
  }
}
