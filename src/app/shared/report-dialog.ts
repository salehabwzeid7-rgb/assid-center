import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { closeOnBack } from '../core/back-stack.service';
import { NotifyService } from '../core/notify.service';
import { circleLabel, isTajweedCircle, studentCircleIds, type Student } from '../core/models';
import {
  buildCircleReport,
  buildOverviewReport,
  buildStudentsReport,
  type CircleReport,
  type ReportSource,
} from '../core/reports';
import {
  ACTIVITY_LABELS,
  DEFAULT_ACTIVITY,
  activityOf,
  hasActivity,
  hasMarksContent,
  type ActivityFlags,
  type ReportContent,
} from '../core/report-content';
import type { DialogDraft } from '../core/report-draft.service';
import {
  COURSE_STATUS_LABELS,
  COURSE_STATUS_ORDER,
  EMPTY_MARKS,
  WARNING_NOTE_MAX,
  buildMarksReport,
  courseKey,
  marksPdf,
  marksPdfSections,
  marksReportText,
  marksTextLines,
  marksTitle,
  type CourseStatus,
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
import { PeriodPickerComponent, PeriodState } from './period-picker';
import { ReportExportComponent } from './report-export';
import { SectionsReportCardComponent } from './sections-report-card';

/* ==========================================================================
   نافذة «إنشاء تقرير» — كلّ مُدخلات التصدير مجموعة في مكان واحد.

   سبب فصلها عن اللوحة: اللوحة أداة مراجعة يوميّة للمعلّم، والتصدير عمل
   مقصود يحدث أحيانًا. إبقاء مرشّحات التصدير مفرودة في الصفحة كان يُثقِل
   الشاشة اليوميّة بخيارات لا تُستعمل في أغلب الزيارات.

   **مدى النافذة وحلقاتها مستقلّان عن اللوحة** (نسخة مبدئيّة منهما عند الفتح،
   ثمّ تتحرّك وحدها) — فتعديل مرشّح هنا لا يقلب ما يراه المعلّم خلف النافذة.

   **التقرير متكيّف بالكامل**: سبعة مفاتيح مستقلّة لمحتواه (الحضور · سجلّ التسميع · عدد
   الأوجه · السرد · الاختبارات · المقرر · الإنذارات) بأيّ تركيبة، ومنها يُبنى نموذج مستند
   واحد يصدر عنه PDF والصورة، فيتطابقان — والنصّ يُبنى من المفاتيح نفسها.

   **المسودّة**: كلّ ما يضبطه المعلّم هنا يُحفَظ (راجع `report-draft.service.ts`) فلا يضيع
   إن خرج ليرى بيانات طالب ثمّ عاد.
   ========================================================================== */

type Subject = 'circle' | 'students';

const ACTIVITY_KEYS: (keyof ActivityFlags)[] = [
  'attendance',
  'recitation',
  'pages',
  'serd',
  'exams',
];

@Component({
  selector: 'app-report-dialog',
  imports: [PeriodPickerComponent, ReportExportComponent, SectionsReportCardComponent],
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

        <!-- ٣) محتوى التقرير: يضيف المعلّم ما يريد بأيّ تركيبة -->
        <section class="rd-sec">
          <h3>محتوى التقرير</h3>
          <div class="rd-sub">من السجلّات</div>
          <div class="chips">
            @for (k of activityKeys; track k) {
              <button
                type="button"
                class="chip"
                [class.active]="content()[k]"
                (click)="toggleContent(k)"
              >
                {{ activityLabels[k] }}
              </button>
            }
          </div>
          <div class="rd-sub" style="margin-top:12px">علامات تُمسَح بعد إنشاء التقرير</div>
          <div class="chips">
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
          <!-- المقرر: حالة كلّ طالب بحسب حلقته — تظهر هنا فقط حين يختار المعلّم «المقرر» -->
          @if (content().course) {
            <div class="rd-mk">
              <div class="rd-sub">حالة المقرر لكلّ طالب</div>
              @if (markGroups().length === 0) {
                <p class="rd-hint">لا طلّاب في الحلقات المختارة.</p>
              }
              @for (g of markGroups(); track g.id) {
                <h4 class="rd-mk-grp">{{ g.title }}</h4>
                @for (s of g.students; track s.id) {
                  <div class="mk-row">
                    <div class="mk-name">
                      <span>{{ s.name }}</span>
                      <button type="button" class="mk-prof" (click)="openProfile(s.id)">
                        بيانات ↗
                      </button>
                    </div>
                    <div class="mk-btns">
                      @for (st of statusOrder; track st) {
                        <button
                          type="button"
                          class="mk-btn"
                          [class.on]="courseOf(g.id, s.id) === st"
                          [class.st-passed]="st === 'passed'"
                          [class.st-completed]="st === 'completed'"
                          [class.st-incomplete]="st === 'incomplete'"
                          (click)="setCourse(g.id, s.id, st)"
                        >
                          {{ statusLabels[st] }}
                        </button>
                      }
                    </div>
                  </div>
                }
              }
              @if (courseCount() === 0 && markGroups().length > 0) {
                <p class="rd-hint">لم تُعلَّم أيّ حالة بعد — من لا حالة له لا يظهر في التقرير.</p>
              }
            </div>
          }

          <!-- الإنذارات: زرّ لكلّ طالب مع سبب قصير (كلمتان أو ثلاث) -->
          @if (content().warnings) {
            <div class="rd-mk">
              <div class="rd-sub">الإنذارات</div>
              @if (warnStudents().length === 0) {
                <p class="rd-hint">لا طلّاب في الحلقات المختارة.</p>
              }
              @for (s of warnStudents(); track s.id) {
                <div class="mk-row">
                  <div class="mk-name">
                    <span>{{ s.name }}</span>
                    <button type="button" class="mk-prof" (click)="openProfile(s.id)">
                      بيانات ↗
                    </button>
                  </div>
                  <div class="mk-btns">
                    <button
                      type="button"
                      class="mk-btn st-incomplete"
                      [class.on]="isWarned(s.id)"
                      (click)="toggleWarning(s.id)"
                    >
                      {{ isWarned(s.id) ? '⚠ إنذار' : 'إنذار' }}
                    </button>
                  </div>
                  @if (isWarned(s.id)) {
                    <input
                      class="mk-note"
                      type="text"
                      placeholder="سبب الإنذار (كلمتان أو ثلاث)"
                      [attr.maxlength]="noteMax"
                      [value]="marks().warnings[s.id]"
                      (input)="setWarningNote(s.id, $event)"
                    />
                  }
                </div>
              }
              @if (warnedCount() === 0 && warnStudents().length > 0) {
                <p class="rd-hint">لم يُعلَّم أيّ إنذار بعد — لن يظهر قسم إنذارات في التقرير.</p>
              }
            </div>
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

          <!-- اطّلاع على بيانات الطالب دون فقدان ما ضُبط: تُحفَظ المسودّة ثمّ يُفتَح ملفّه -->
          @if (studentOptions().length > 0) {
            <details class="rd-prof">
              <summary>👤 بيانات الطلّاب — للاطّلاع قبل إنشاء التقرير</summary>
              <p class="rd-hint" style="margin-top:6px">
                يُحفَظ التقرير كما هو ويعود إليك بعد أن تنظر في ملفّ الطالب.
              </p>
              @for (s of studentOptions(); track s.id) {
                <div class="rd-prof-row">
                  <span>{{ s.name }}</span>
                  <button type="button" class="chip" (click)="openProfile(s.id)">
                    فتح الملفّ ↗
                  </button>
                </div>
              }
            </details>
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
              (exported)="exported.emit()"
            >
              <!-- الصورة تُرسَم من نموذج المستند نفسه الذي يُبنى منه PDF — فيتطابقان. -->
              @if (pdfModel(); as doc) {
                <app-sections-report-card [doc]="doc" />
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
      .rd-sub {
        margin-bottom: 6px;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--text-soft, #888);
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
      .rd-mk {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px dashed var(--border, #e5e0d3);
      }
      .rd-mk-grp {
        margin: 12px 0 2px;
        font-size: 0.86rem;
        font-weight: 800;
      }
      .mk-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 9px 0;
        border-bottom: 1px solid var(--border, #e5e0d3);
      }
      .mk-row:last-child {
        border-bottom: none;
      }
      .mk-name {
        flex: 1 1 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-weight: 700;
        font-size: 0.88rem;
      }
      .mk-prof {
        padding: 3px 10px;
        border: 1px solid var(--border, #e5e0d3);
        border-radius: 14px;
        background: none;
        font: inherit;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-soft, #888);
        cursor: pointer;
      }
      .mk-btns {
        display: flex;
        flex: 1 1 100%;
        gap: 6px;
      }
      .mk-btn {
        flex: 1;
        padding: 8px 4px;
        border: 1px solid var(--border, #e5e0d3);
        border-radius: 9px;
        background: var(--surface, #fff);
        font: inherit;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--text-soft, #888);
        cursor: pointer;
      }
      .mk-btn.on.st-passed {
        background: #0d5c3f;
        border-color: #0d5c3f;
        color: #fff;
      }
      .mk-btn.on.st-completed {
        background: #2f6f8f;
        border-color: #2f6f8f;
        color: #fff;
      }
      .mk-btn.on.st-incomplete {
        background: var(--danger, #b3261e);
        border-color: var(--danger, #b3261e);
        color: #fff;
      }
      .mk-note {
        flex: 1 1 100%;
        padding: 8px 10px;
        border: 1px solid var(--danger, #b3261e);
        border-radius: 9px;
        background: var(--surface, #fff);
        font: inherit;
        font-size: 0.84rem;
        color: inherit;
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
      .rd-prof {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px dashed var(--border, #e5e0d3);
        font-size: 0.82rem;
      }
      .rd-prof summary {
        cursor: pointer;
        font-weight: 700;
      }
      .rd-prof-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 0;
        border-bottom: 1px solid var(--border, #e5e0d3);
      }
      .rd-prof-row:last-child {
        border-bottom: none;
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
export class ReportDialogComponent implements OnInit {
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  readonly source = input.required<ReportSource>();
  readonly teacherName = input<string>('');
  readonly intro = input<string>('');
  readonly outro = input<string>('');
  /** المدى والحلقات اللذان كانت اللوحة تعرضهما — نقطة انطلاق فقط. */
  readonly initialPeriod = input<PeriodState | null>(null);
  readonly initialCircleIds = input<readonly string[]>([]);
  /** مسودّة محفوظة تُستعاد بدل الحالة المبدئيّة (عند العودة من ملفّ الطالب مثلًا). */
  readonly draft = input<DialogDraft | null>(null);

  readonly close = output<void>();
  /** أُنشئ تقرير فعلًا (نسخ نصّ، أو توليد صورة، أو حفظ PDF) — الصفحة تمسح المسودّة بعد إغلاقها. */
  readonly exported = output<void>();
  /** تغيّرت حالة النافذة — الصفحة تحفظها في المسودّة. */
  readonly draftChange = output<DialogDraft>();

  readonly period = new PeriodState();
  readonly audience = signal<ReportAudience>('parents');
  readonly subject = signal<Subject>('circle');

  private readonly circleOverride = signal<string[] | null>(null);
  private readonly studentOverride = signal<string[] | null>(null);
  private armed = false;

  readonly activityKeys = ACTIVITY_KEYS;
  readonly activityLabels = ACTIVITY_LABELS;

  constructor() {
    // النافذة نفسها طبقة: الرجوع يُغلقها ولا يغادر صفحة التقارير.
    closeOnBack(
      () => true,
      () => this.close.emit(),
    );
    // أيّ تغيير بعد الفتح يُحفَظ في المسودّة (التشغيل الأوّل للحالة المبدئيّة لا يُحفَظ).
    effect(() => {
      const snap = this.snapshot();
      if (!this.armed) {
        this.armed = true;
        return;
      }
      untracked(() => this.draftChange.emit(snap));
    });
  }

  ngOnInit(): void {
    const d = this.draft();
    if (d) {
      this.period.restore(d.period);
      this.circleOverride.set(d.circleIds);
      this.studentOverride.set(d.studentIds);
      this.audience.set(d.audience);
      this.subject.set(d.subject);
      this.contentOverride.set(d.content);
      this.override.set(d.textOverride);
      this.marks.set({
        course: d.marks?.course ?? {},
        warnings: d.marks?.warnings ?? {},
      });
      return;
    }
    // نسخة مبدئيّة من حالة اللوحة، ثمّ تستقلّ النافذة بحالتها.
    const p = this.initialPeriod();
    if (p) this.period.cloneFrom(p);
  }

  /** حالة النافذة كاملة كما تُحفَظ في المسودّة. */
  snapshot(): DialogDraft {
    return {
      period: this.period.snapshot(),
      circleIds: this.circleOverride(),
      studentIds: this.studentOverride(),
      audience: this.audience(),
      subject: this.subject(),
      content: this.contentOverride(),
      textOverride: this.override(),
      marks: this.marks(),
    };
  }

  /** يحفظ المسودّة فورًا ثمّ يفتح ملفّ الطالب — يعود المعلّم فيجد التقرير كما تركه. */
  openProfile(studentId: string): void {
    this.draftChange.emit(this.snapshot());
    void this.router.navigate(['/student', studentId]);
  }

  /* ---------- المحتوى ---------- */

  private readonly contentOverride = signal<ReportContent | null>(null);

  /** علامات المقرر والإنذار — مؤقّتة، تُحفَظ في المسودّة وتزول بعد إنشاء التقرير. */
  readonly marks = signal<ReportMarks>(EMPTY_MARKS);
  readonly statusOrder = COURSE_STATUS_ORDER;
  readonly statusLabels = COURSE_STATUS_LABELS;
  readonly noteMax = WARNING_NOTE_MAX;

  /**
   * بلا اختيار صريح: النشاط الافتراضيّ (حضور وتسميع وأوجه) والمقرر والإنذارات مطفأة —
   * يضيفها المعلّم بنفسه بأزرار «محتوى التقرير».
   */
  readonly content = computed<ReportContent>(
    () => this.contentOverride() ?? { ...DEFAULT_ACTIVITY, course: false, warnings: false },
  );

  readonly courseCount = computed(() => Object.keys(this.marks().course).length);
  readonly warnedCount = computed(() => Object.keys(this.marks().warnings).length);

  courseOf(circleId: string, studentId: string): CourseStatus | null {
    return this.marks().course[courseKey(circleId, studentId)] ?? null;
  }

  /** الضغط على الحالة المفعَّلة يلغيها. */
  setCourse(circleId: string, studentId: string, status: CourseStatus): void {
    const key = courseKey(circleId, studentId);
    const course = { ...this.marks().course };
    if (course[key] === status) delete course[key];
    else course[key] = status;
    this.marks.set({ ...this.marks(), course });
  }

  isWarned(studentId: string): boolean {
    return studentId in this.marks().warnings;
  }

  toggleWarning(studentId: string): void {
    const warnings = { ...this.marks().warnings };
    if (studentId in warnings) delete warnings[studentId];
    else warnings[studentId] = '';
    this.marks.set({ ...this.marks(), warnings });
  }

  setWarningNote(studentId: string, e: Event): void {
    const note = (e.target as HTMLInputElement).value.slice(0, WARNING_NOTE_MAX);
    this.marks.set({ ...this.marks(), warnings: { ...this.marks().warnings, [studentId]: note } });
  }

  /** طلّاب كلّ حلقة مختارة (ضمن الطلّاب المحدَّدين إن اختيروا) — أساس قائمة المقرر. */
  readonly markGroups = computed(() => {
    const ids = new Set(this.circleIds());
    const only = this.subject() === 'students' ? new Set(this.studentIds()) : null;
    return this.circles()
      .filter((c) => ids.has(c.id))
      .map((c) => ({
        id: c.id,
        title: circleLabel(c),
        students: this.source()
          .students.filter(
            (s) => s.active && studentCircleIds(s).includes(c.id) && (!only || only.has(s.id)),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      }))
      .filter((g) => g.students.length > 0);
  });

  /** كلّ طالب مرّة واحدة (الإنذار للطالب لا للحلقة). */
  readonly warnStudents = computed<Student[]>(() => {
    const seen = new Map<string, Student>();
    for (const g of this.markGroups()) for (const s of g.students) seen.set(s.id, s);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  });

  /** مفاتيح النشاط وحدها، وهل اختير منها شيء. */
  readonly activityFlags = computed(() => activityOf(this.content()));
  readonly activityOn = computed(() => hasActivity(this.content()));

  toggleContent(key: keyof ReportContent): void {
    const next = { ...this.content(), [key]: !this.content()[key] };
    // جزء واحد على الأقلّ دائمًا — تقرير بلا محتوى لا معنى له.
    if (!hasActivity(next) && !hasMarksContent(next)) return;
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
    if (this.activityOn() && this.subject() === 'students') return this.studentIds().length > 0;
    return this.circleIds().length > 0;
  });

  notReadyText(): string {
    return this.activityOn() && this.subject() === 'students'
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
      flags: this.activityFlags(),
    };
  });

  readonly reportText = computed<string>(() => {
    if (!this.ready()) return '';
    const mk = this.marksOn();
    if (!this.activityOn() && mk) {
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
      this.exported.emit();
    } catch {
      this.notify.error('تعذّر النسخ — انسخ النصّ يدويًّا');
    }
  }

  /* ---------- التصدير ---------- */

  readonly shareTitle = computed(() => {
    const mk = this.marksOn();
    if (!this.activityOn() && mk) return `تقرير ${marksTitle(mk)}`;
    if (this.subject() === 'students') {
      const n = this.studentIds().length;
      return n === 1 ? (this.studentsReport().students[0]?.name ?? 'تقرير') : `تقرير ${n} طلّاب`;
    }
    return this.singleCircle()?.circleTitle ?? 'تقرير عامّ';
  });

  /**
   * نموذج مستند التقرير — يُبنى من نفس الكائنات المحسوبة التي بُني منها النصّ، ومنه يصدر
   * ملفّ PDF **وصور التقرير** معًا فتتطابق. المقرر/الإنذار أوّلًا ثمّ تفاصيل السجلّات.
   */
  readonly pdfModel = computed<PdfDoc | null>(() => {
    if (!this.ready()) return null;
    const mk = this.marksOn();
    if (!this.activityOn() && mk) {
      return marksPdf(mk, this.period.period(), this.teacherName());
    }
    const meta: PdfMeta = {
      teacherName: this.teacherName(),
      audience: this.audience(),
      flags: this.activityFlags(),
    };
    let doc: PdfDoc;
    if (this.subject() === 'students') doc = buildStudentsPdf(this.studentsReport(), meta);
    else {
      const single = this.singleCircle();
      doc = single ? buildCirclePdf(single, meta) : buildOverviewPdf(this.overviewReport(), meta);
    }
    if (!mk) return doc;
    return {
      ...doc,
      sections: [
        ...marksPdfSections(mk),
        { kind: 'heading', text: 'تفاصيل التقرير' },
        ...doc.sections,
      ],
    };
  });

  readonly fileName = computed(() => {
    const p = this.period.period();
    const tag = p.from === p.to ? p.from : `${p.from}_${p.to}`;
    let raw: string;
    const mk = this.marksOn();
    if (!this.activityOn() && mk) {
      raw = marksTitle(mk);
    } else if (this.subject() === 'students') {
      const list = this.studentsReport().students;
      raw = list.length === 1 ? list[0].name : `${list.length}-طلاب`;
    } else {
      raw = this.singleCircle()?.circleName ?? 'عام';
    }
    if (mk && this.activityOn()) raw += `-${marksTitle(mk)}`;
    return `تقرير-${raw.replace(/[\\/:*?"<>|\s]+/g, '-')}-${tag}`;
  });
}
