import { Component, computed, inject, input, output, signal } from '@angular/core';
import { closeOnBack } from '../core/back-stack.service';
import { NotifyService } from '../core/notify.service';
import { isTajweedCircle, studentCircleIds, type Student } from '../core/models';
import {
  buildCircleReport,
  buildOverviewReport,
  buildStudentsReport,
  type CircleReport,
  type ReportSource,
} from '../core/reports';
import {
  EMPTY_MARKS,
  buildMarksReport,
  hasMarksContent,
  marksPdf,
  marksPdfSections,
  marksReportText,
  marksTextLines,
  marksTitle,
  type ReportContent,
  type ReportMarks,
} from '../core/report-marks';
import {
  circleReportText,
  overviewReportText,
  studentsReportText,
  type ReportAudience,
} from '../core/report-text';
import {
  buildCirclePdf,
  buildOverviewPdf,
  buildStudentsPdf,
  type PdfMeta,
} from '../core/report-pdf-build';
import type { PdfDoc } from '../core/report-pdf';
import { MarksReportCardComponent } from './marks-report-card';
import { OverviewReportCardComponent } from './overview-report-card';
import { PeriodPickerComponent, PeriodState } from './period-picker';
import { ReportCardComponent } from './report-card';
import { ReportExportComponent } from './report-export';
import { StudentReportCardComponent } from './student-report-card';

/* ==========================================================================
   نافذة «إنشاء تقرير» — كلّ مُدخلات التصدير مجموعة في مكان واحد.

   سبب فصلها عن اللوحة: اللوحة أداة مراجعة يوميّة للمعلّم، والتصدير عمل
   مقصود يحدث أحيانًا. إبقاء مرشّحات التصدير مفرودة في الصفحة كان يُثقِل
   الشاشة اليوميّة بخيارات لا تُستعمل في أغلب الزيارات.

   **مدى النافذة وحلقاتها مستقلّان عن اللوحة** (نسخة مبدئيّة منهما عند الفتح،
   ثمّ تتحرّك وحدها) — فتعديل مرشّح هنا لا يقلب ما يراه المعلّم خلف النافذة.
   ========================================================================== */

type Subject = 'circle' | 'students';

@Component({
  selector: 'app-report-dialog',
  imports: [
    PeriodPickerComponent,
    ReportExportComponent,
    ReportCardComponent,
    OverviewReportCardComponent,
    StudentReportCardComponent,
    MarksReportCardComponent,
  ],
  template: `
    <div class="rd-backdrop" (click)="close.emit()"></div>

    <div class="rd-sheet" role="dialog" aria-label="إنشاء تقرير">
      <div class="rd-head">
        <h2>إنشاء تقرير</h2>
        <button type="button" class="rd-x" (click)="close.emit()" aria-label="إغلاق">✕</button>
      </div>

      <div class="rd-body">
        <!-- ١) المدى -->
        <section class="rd-sec">
          <h3>المدى الزمنيّ</h3>
          <app-period-picker [state]="period" idPrefix="rd" />
        </section>

        <!-- ٢) الحلقات -->
        <section class="rd-sec">
          <h3>الحلقات</h3>
          @if (hifzCircles().length > 0) {
            <div class="rd-grp">
              <span>حلقات التحفيظ</span>
              <button type="button" class="chip" (click)="toggleGroup('hifz')">
                {{ allOf('hifz') ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
              </button>
            </div>
            <div class="chips">
              @for (c of hifzCircles(); track c.id) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="circleIds().includes(c.id)"
                  (click)="toggleCircle(c.id)"
                >
                  {{ c.name }}
                </button>
              }
            </div>
          }
          @if (tajweedCircles().length > 0) {
            <div class="rd-grp" style="margin-top:12px">
              <span>حلقات التجويد</span>
              <button type="button" class="chip" (click)="toggleGroup('tajweed')">
                {{ allOf('tajweed') ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
              </button>
            </div>
            <div class="chips">
              @for (c of tajweedCircles(); track c.id) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="circleIds().includes(c.id)"
                  (click)="toggleCircle(c.id)"
                >
                  {{ c.name }}
                </button>
              }
            </div>
          }
        </section>

        <!-- ٣) محتوى التقرير: النشاط · المقرر · الإنذارات بأيّ تركيبة -->
        <section class="rd-sec">
          <h3>محتوى التقرير</h3>
          <div class="chips">
            <button
              type="button"
              class="chip"
              [class.active]="content().activity"
              (click)="toggleContent('activity')"
            >
              الحضور والتسميع والسجلّ
            </button>
            <button
              type="button"
              class="chip"
              [class.active]="content().course"
              (click)="toggleContent('course')"
            >
              المقرر
            </button>
            <button
              type="button"
              class="chip chip-danger"
              [class.active]="content().warnings"
              (click)="toggleContent('warnings')"
            >
              الإنذارات
            </button>
          </div>
          @if (content().course && !hasCourseMarks()) {
            <p class="rd-hint">
              لم تُعلَّم أيّ حالة مقرر بعد — علّمها من تبويب «المقرر والإنذارات».
            </p>
          }
          @if (content().warnings && !hasWarningMarks()) {
            <p class="rd-hint">لم يُعلَّم أيّ إنذار بعد — علّمه من تبويب «المقرر والإنذارات».</p>
          }
        </section>

        <!-- ٤) الجمهور -->
        <section class="rd-sec">
          <h3>نوع التقرير</h3>
          <div class="chips">
            <button
              type="button"
              class="chip"
              [class.active]="audience() === 'parents'"
              (click)="audience.set('parents')"
            >
              للأهالي
            </button>
            <button
              type="button"
              class="chip"
              [class.active]="audience() === 'reference'"
              (click)="audience.set('reference')"
            >
              مرجعيّ (أرشيف)
            </button>
          </div>
          <p class="rd-hint">
            {{
              audience() === 'parents'
                ? 'موجز مبسَّط يُرسَل لوليّ الأمر — يبرز الإنجاز والحضور.'
                : 'تفصيليّ كامل للأرشفة — يشمل الغياب والفجوات وثغرات التسجيل.'
            }}
          </p>
        </section>

        <!-- ٥) الموضوع -->
        <section class="rd-sec">
          <h3>التقرير عن</h3>
          <div class="chips">
            <button
              type="button"
              class="chip"
              [class.active]="subject() === 'circle'"
              (click)="subject.set('circle')"
            >
              الحلقة كاملة
            </button>
            <button
              type="button"
              class="chip"
              [class.active]="subject() === 'students'"
              (click)="subject.set('students')"
            >
              طلّاب محدّدون
            </button>
          </div>

          @if (subject() === 'students') {
            @if (studentOptions().length === 0) {
              <p class="rd-hint">لا طلّاب في الحلقات المختارة.</p>
            } @else {
              <div class="rd-grp" style="margin-top:12px">
                <span>الطلّاب ({{ studentIds().length }} من {{ studentOptions().length }})</span>
                <button type="button" class="chip" (click)="toggleAllStudents()">
                  {{ allStudentsSelected() ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
                </button>
              </div>
              <div class="chips">
                @for (s of studentOptions(); track s.id) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="studentIds().includes(s.id)"
                    (click)="toggleStudent(s.id)"
                  >
                    {{ s.name }}
                  </button>
                }
              </div>
              <p class="rd-hint">
                تقرير الطالب يقتصر على الحلقات المختارة أعلاه — اختر حلقة التجويد وحدها لتقرير تجويد
                خالص، أو النوعين معًا لتقرير يجمع تسميعه واختبارات تجويده.
              </p>
            }
          }
        </section>

        <!-- ٦) المخرَجات -->
        @if (!ready()) {
          <section class="rd-sec">
            <p class="rd-empty">{{ notReadyText() }}</p>
          </section>
        } @else {
          <section class="rd-sec">
            <div class="rd-head-row">
              <h3>نصّ التقرير</h3>
              @if (edited()) {
                <button type="button" class="chip" (click)="override.set(null)">
                  ↺ استعادة الأصل
                </button>
              }
            </div>
            <textarea class="rd-text" rows="10" [value]="displayText()" (input)="onEdit($event)">
            </textarea>
            <button type="button" class="btn btn-primary btn-block" (click)="copy()">
              📋 نسخ النصّ
            </button>
          </section>

          <section class="rd-sec">
            <h3>صورة وملفّ PDF</h3>
            <app-report-export
              [fileName]="fileName()"
              [shareTitle]="shareTitle()"
              [pdfModel]="pdfModel()"
              (exported)="exported.emit(!!marksOn())"
            >
              <!-- كتلة المقرر/الإنذار تتقدّم النشاط ليراها وليّ الأمر أوّلًا. -->
              @if (marksOn(); as mk) {
                <app-marks-report-card
                  [report]="mk"
                  [period]="period.period()"
                  [teacherName]="teacherName()"
                />
              }
              @if (content().activity) {
                @if (subject() === 'students') {
                  @for (tl of studentsReport().students; track tl.studentId) {
                    <app-student-report-card
                      [timeline]="tl"
                      [teacherName]="teacherName()"
                      [audience]="audience()"
                    />
                  }
                } @else if (singleCircle(); as rep) {
                  <app-report-card
                    [report]="rep"
                    [teacherName]="teacherName()"
                    [audience]="audience()"
                  />
                } @else {
                  <app-overview-report-card
                    [overview]="overviewReport()"
                    [teacherName]="teacherName()"
                  />
                }
              }
            </app-report-export>
          </section>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: block;
      }
      .rd-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
      }
      .rd-sheet {
        position: absolute;
        inset-inline: 0;
        bottom: 0;
        top: 24px;
        background: var(--bg, #faf8f2);
        border-radius: 18px 18px 0 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.25);
      }
      .rd-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border, #e5e0d3);
        background: var(--surface, #fff);
      }
      .rd-head h2 {
        margin: 0;
        font-size: 1.02rem;
        font-weight: 800;
      }
      .rd-x {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid var(--border, #e5e0d3);
        background: none;
        font-size: 0.95rem;
        cursor: pointer;
        color: inherit;
      }
      .rd-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        padding-bottom: 32px;
      }
      .rd-sec {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e5e0d3);
        border-radius: 14px;
        padding: 14px;
        margin-bottom: 12px;
      }
      .rd-sec h3 {
        margin: 0 0 10px;
        font-size: 0.92rem;
        font-weight: 800;
      }
      .rd-head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .rd-head-row h3 {
        margin: 0;
      }
      .rd-grp {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-soft, #888);
      }
      .chip-danger.active {
        background: var(--danger, #b3261e);
        border-color: var(--danger, #b3261e);
        color: #fff;
      }
      .rd-hint {
        margin: 8px 0 0;
        font-size: 0.76rem;
        color: var(--text-soft, #888);
        line-height: 1.8;
      }
      .rd-empty {
        margin: 0;
        text-align: center;
        font-size: 0.86rem;
        color: var(--text-soft, #888);
      }
      .rd-text {
        width: 100%;
        margin: 6px 0 10px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--border, #e5e0d3);
        background: var(--bg, #faf8f2);
        font-family: inherit;
        font-size: 0.8rem;
        line-height: 1.7;
        resize: vertical;
        color: inherit;
      }
    `,
  ],
})
export class ReportDialogComponent {
  private readonly notify = inject(NotifyService);

  readonly source = input.required<ReportSource>();
  readonly teacherName = input<string>('');
  readonly intro = input<string>('');
  readonly outro = input<string>('');
  /** المدى والحلقات اللذان كانت اللوحة تعرضهما — نقطة انطلاق فقط. */
  readonly initialPeriod = input<PeriodState | null>(null);
  readonly initialCircleIds = input<readonly string[]>([]);
  /** العلامات المؤقّتة (المقرر/الإنذار) التي علّمها المعلّم في الصفحة خلف النافذة. */
  readonly marks = input<ReportMarks>(EMPTY_MARKS);
  /** هل يبدأ التقرير بالنشاط؟ يُمرَّر `false` حين تُفتَح النافذة من تبويب المقرر والإنذارات. */
  readonly initialActivity = input<boolean>(true);

  readonly close = output<void>();
  /**
   * أُنشئ تقرير فعلًا (نسخ نصّ، أو توليد صورة، أو حفظ PDF). القيمة: هل ضمّ المقرر
   * أو الإنذار؟ — فالصفحة لا تُسقط العلامات إلّا إن طُبعت في تقرير.
   */
  readonly exported = output<boolean>();

  readonly period = new PeriodState();
  readonly audience = signal<ReportAudience>('parents');
  readonly subject = signal<Subject>('circle');

  private readonly circleOverride = signal<string[] | null>(null);
  private readonly studentOverride = signal<string[] | null>(null);

  constructor() {
    // النافذة نفسها طبقة: الرجوع يُغلقها ولا يغادر صفحة التقارير.
    closeOnBack(
      () => true,
      () => this.close.emit(),
    );
    // نسخة مبدئيّة من حالة اللوحة، ثمّ تستقلّ النافذة بحالتها.
    queueMicrotask(() => {
      const p = this.initialPeriod();
      if (p) this.period.cloneFrom(p);
    });
  }

  /* ---------- المحتوى ---------- */

  private readonly contentOverride = signal<ReportContent | null>(null);

  readonly hasCourseMarks = computed(() => Object.keys(this.marks().course).length > 0);
  readonly hasWarningMarks = computed(() => Object.keys(this.marks().warnings).length > 0);

  /**
   * بلا اختيار صريح: المقرر/الإنذار يُفعَّلان إن كان قد عُلِّم شيء منهما، والنشاط
   * يتبع مصدر فتح النافذة. ولا تُترَك النافذة بلا أيّ جزء — يُرجَع للنشاط.
   */
  readonly content = computed<ReportContent>(() => {
    const manual = this.contentOverride();
    if (manual) return manual;
    const c: ReportContent = {
      activity: this.initialActivity(),
      course: this.hasCourseMarks(),
      warnings: this.hasWarningMarks(),
    };
    return c.activity || c.course || c.warnings ? c : { ...c, activity: true };
  });

  toggleContent(key: keyof ReportContent): void {
    const next = { ...this.content(), [key]: !this.content()[key] };
    // جزء واحد على الأقلّ دائمًا — تقرير بلا محتوى لا معنى له.
    if (!next.activity && !next.course && !next.warnings) return;
    this.contentOverride.set(next);
  }

  /* ---------- الحلقات ---------- */

  private readonly circles = computed(() => this.source().circles);
  readonly hifzCircles = computed(() => this.circles().filter((c) => !isTajweedCircle(c)));
  readonly tajweedCircles = computed(() => this.circles().filter((c) => isTajweedCircle(c)));

  readonly circleIds = computed<string[]>(
    () => this.circleOverride() ?? [...this.initialCircleIds()],
  );

  toggleCircle(id: string): void {
    const cur = this.circleIds();
    this.circleOverride.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    this.studentOverride.set(null);
  }

  allOf(kind: 'hifz' | 'tajweed'): boolean {
    const list = kind === 'hifz' ? this.hifzCircles() : this.tajweedCircles();
    return list.length > 0 && list.every((c) => this.circleIds().includes(c.id));
  }

  toggleGroup(kind: 'hifz' | 'tajweed'): void {
    const list = kind === 'hifz' ? this.hifzCircles() : this.tajweedCircles();
    const ids = list.map((c) => c.id);
    const cur = this.circleIds();
    this.circleOverride.set(
      this.allOf(kind) ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])],
    );
    this.studentOverride.set(null);
  }

  /* ---------- الطلّاب ---------- */

  readonly studentOptions = computed<Student[]>(() => {
    const ids = this.circleIds();
    const active = this.source().students.filter((s) => s.active);
    const list =
      ids.length === 0
        ? active
        : active.filter((s) => studentCircleIds(s).some((c) => ids.includes(c)));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  });

  /** بلا اختيار صريح: كلّ طلّاب الحلقات المختارة — أكثر النوايا شيوعًا. */
  readonly studentIds = computed<string[]>(() => {
    const manual = this.studentOverride();
    if (manual !== null) return manual;
    return this.studentOptions().map((s) => s.id);
  });

  readonly allStudentsSelected = computed(
    () => this.studentIds().length === this.studentOptions().length,
  );

  toggleStudent(id: string): void {
    const cur = this.studentIds();
    this.studentOverride.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  toggleAllStudents(): void {
    this.studentOverride.set(
      this.allStudentsSelected() ? [] : this.studentOptions().map((s) => s.id),
    );
  }

  /* ---------- التقارير المحسوبة ---------- */

  readonly singleCircle = computed<CircleReport | null>(() => {
    const ids = this.circleIds();
    if (this.subject() !== 'circle' || ids.length !== 1) return null;
    const c = this.circles().find((x) => x.id === ids[0]);
    return c ? buildCircleReport(this.source(), c, this.period.period()) : null;
  });

  readonly overviewReport = computed(() =>
    buildOverviewReport(this.source(), this.circleIds(), this.period.period()),
  );

  readonly studentsReport = computed(() =>
    buildStudentsReport(this.source(), this.studentIds(), this.period.period(), this.circleIds()),
  );

  /** كتلة المقرر/الإنذار — تُحسَب على الحلقات المختارة (والطلّاب المحدَّدين إن اختيروا). */
  readonly marksReport = computed(() =>
    buildMarksReport(
      this.source(),
      this.circleIds(),
      this.subject() === 'students' ? this.studentIds() : null,
      this.marks(),
      this.content(),
    ),
  );

  /** كتلة المقرر/الإنذار إن اختيرت، وإلّا `null`. */
  readonly marksOn = computed(() => (hasMarksContent(this.content()) ? this.marksReport() : null));

  readonly ready = computed(() => {
    // المقرر/الإنذار وحدهما يكفيهما حلقة مختارة؛ النشاط في وضع الطلّاب يحتاج طالبًا.
    if (this.content().activity && this.subject() === 'students') {
      return this.studentIds().length > 0;
    }
    return this.circleIds().length > 0;
  });

  notReadyText(): string {
    return this.content().activity && this.subject() === 'students'
      ? 'اختر طالبًا واحدًا على الأقلّ.'
      : 'اختر حلقة واحدة على الأقلّ.';
  }

  /* ---------- النصّ ---------- */

  private readonly meta = computed(() => {
    const mk = this.marksOn();
    return {
      teacherName: this.teacherName(),
      intro: this.intro(),
      outro: this.outro(),
      marksLines: mk ? marksTextLines(mk) : undefined,
    };
  });

  readonly reportText = computed<string>(() => {
    if (!this.ready()) return '';
    const mk = this.marksOn();
    if (!this.content().activity && mk) {
      return marksReportText(mk, this.period.period(), this.meta(), this.audience());
    }
    if (this.subject() === 'students') {
      return studentsReportText(this.studentsReport(), this.meta(), this.audience());
    }
    const single = this.singleCircle();
    if (single) return circleReportText(single, this.meta(), this.audience());
    return overviewReportText(this.overviewReport(), this.meta());
  });

  readonly override = signal<{ key: string; text: string } | null>(null);

  private readonly stateKey = computed(
    () =>
      `${this.period.period().from}|${this.period.period().to}|${this.circleIds().join(',')}` +
      `|${this.audience()}|${this.subject()}|${this.studentIds().join(',')}` +
      `|${JSON.stringify(this.content())}|${JSON.stringify(this.marks())}`,
  );

  readonly edited = computed(() => this.override()?.key === this.stateKey());
  readonly displayText = computed(() =>
    this.edited() ? this.override()!.text : this.reportText(),
  );

  onEdit(e: Event): void {
    this.override.set({ key: this.stateKey(), text: (e.target as HTMLTextAreaElement).value });
  }

  async copy(): Promise<void> {
    const text = this.displayText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('نُسخ نصّ التقرير');
      this.exported.emit(!!this.marksOn());
    } catch {
      this.notify.error('تعذّر النسخ — انسخ النصّ يدويًّا');
    }
  }

  /* ---------- التصدير ---------- */

  readonly shareTitle = computed(() => {
    const mk = this.marksOn();
    if (!this.content().activity && mk) return `تقرير ${marksTitle(mk)}`;
    if (this.subject() === 'students') {
      const n = this.studentIds().length;
      return n === 1 ? (this.studentsReport().students[0]?.name ?? 'تقرير') : `تقرير ${n} طلّاب`;
    }
    return this.singleCircle()?.circleTitle ?? 'تقرير عامّ';
  });

  /**
   * نموذج مستند PDF النصّيّ — يُبنى من نفس الكائنات المحسوبة التي بُني منها
   * النصّ والصورة، فالأرقام واحدة في المخرَجات الثلاثة.
   */
  readonly pdfModel = computed<PdfDoc | null>(() => {
    if (!this.ready()) return null;
    const meta: PdfMeta = { teacherName: this.teacherName(), audience: this.audience() };
    const mk = this.marksOn();
    if (!this.content().activity && mk) {
      return marksPdf(mk, this.period.period(), this.teacherName());
    }
    let doc: PdfDoc;
    if (this.subject() === 'students') doc = buildStudentsPdf(this.studentsReport(), meta);
    else {
      const single = this.singleCircle();
      doc = single ? buildCirclePdf(single, meta) : buildOverviewPdf(this.overviewReport(), meta);
    }
    if (!mk) return doc;
    // المقرر/الإنذار أوّلًا ثمّ النشاط، بعنوان يفصل بينهما.
    return {
      ...doc,
      sections: [
        ...marksPdfSections(mk),
        { kind: 'heading', text: 'الحضور والنشاط' },
        ...doc.sections,
      ],
    };
  });

  readonly fileName = computed(() => {
    const p = this.period.period();
    const tag = p.from === p.to ? p.from : `${p.from}_${p.to}`;
    let raw: string;
    const mk = this.marksOn();
    if (!this.content().activity && mk) {
      raw = marksTitle(mk);
    } else if (this.subject() === 'students') {
      const list = this.studentsReport().students;
      raw = list.length === 1 ? list[0].name : `${list.length}-طلاب`;
    } else {
      raw = this.singleCircle()?.circleName ?? 'عام';
    }
    if (mk && this.content().activity) raw += `-${marksTitle(mk)}`;
    return `تقرير-${raw.replace(/[\\/:*?"<>|\s]+/g, '-')}-${tag}`;
  });
}
