import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ReportDataService } from '../../core/report-data.service';
import { dmy } from '../../core/format';
import {
  ATTENDANCE_LABELS,
  DEFAULT_PERIOD_REPORT_INTRO,
  DEFAULT_REPORT_OUTRO,
  isTajweedCircle,
  studentCircleIds,
  type Student,
} from '../../core/models';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  buildOverviewReport,
  buildStudentTimeline,
  type HifzCircleReport,
  type HifzStudentRow,
  type StudentTimeline,
  type TajweedCircleReport,
  type TajweedExamCell,
  type TajweedStudentRow,
} from '../../core/reports';
import { PageHeaderComponent } from '../../shared/page-header';
import { PeriodPickerComponent, PeriodState } from '../../shared/period-picker';
import { ReportDialogComponent } from '../../shared/report-dialog';

/**
 * صفحة التقارير — **لوحة داخليّة للمعلّم** أوّلًا.
 *
 * تُفتَح مباشرةً على ملخّص أداء الشهر الجاري لكلّ الحلقات، مفصولًا بين
 * التحفيظ والتجويد. هذه شاشة مراجعة لا تُصدِّر شيئًا: لا صور ولا ملفّات ولا
 * صياغة موجَّهة للأهالي — أرقام يقرؤها المعلّم ليعرف أين يقف.
 *
 * كلّ ما يخصّ التصدير (المدى، الحلقات، الجمهور، اختيار الطلّاب، والمخرَجات
 * الثلاثة) مطويٌّ خلف زرّ «إنشاء تقرير» في `ReportDialogComponent` — فالتصدير
 * عمل مقصود يحدث أحيانًا، ولا ينبغي أن يُثقِل الشاشة اليوميّة بخياراته.
 */
@Component({
  selector: 'app-reports',
  imports: [PageHeaderComponent, PeriodPickerComponent, ReportDialogComponent],
  template: `
    <app-page-header title="التقارير" />

    <div class="page">
      <!-- ============ المرشّحات ============ -->
      <div class="card">
        <h3 class="sec-title">المدى الزمنيّ</h3>
        <app-period-picker [state]="period" idPrefix="dash" />
      </div>

      <div class="card">
        <div class="head-row">
          <h3 class="sec-title">الحلقات</h3>
          @if (!loading() && circles().length > 0) {
            <button type="button" class="chip" (click)="toggleAllCircles()">
              {{ allCirclesOn() ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
            </button>
          }
        </div>

        @if (loading()) {
          <p class="muted">جارٍ التحميل…</p>
        } @else if (circles().length === 0) {
          <p class="muted">لا حلقات مسجَّلة بعد.</p>
        } @else {
          @if (hifzCircles().length > 0) {
            <div class="grp-head">حلقات التحفيظ</div>
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
            <div class="grp-head" style="margin-top:12px">حلقات التجويد</div>
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
        }
      </div>

      @if (!loading() && studentOptions().length > 0) {
        <div class="card">
          <div class="head-row">
            <h3 class="sec-title">
              الطلّاب
              @if (!allStudentsOn()) {
                <span class="count">({{ studentIds().length }})</span>
              }
            </h3>
            <button type="button" class="chip" (click)="toggleAllStudents()">
              {{ allStudentsOn() ? 'تحديد طلّاب بعينهم' : 'كلّ الطلّاب' }}
            </button>
          </div>
          @if (!allStudentsOn()) {
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
          }
        </div>
      }

      <!-- ============ اللوحة ============ -->
      @if (loading()) {
        <div class="card"><p class="muted">جارٍ تحميل البيانات…</p></div>
      } @else if (circleIds().length === 0) {
        <div class="card"><p class="muted">اختر حلقة واحدة على الأقلّ.</p></div>
      } @else {
        <!-- ملخّص التحفيظ -->
        @if (hifzReports().length > 0) {
          <div class="card">
            <h3 class="sec-title">حلقات التحفيظ — {{ period.label() }}</h3>
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ ov().hifzTotals.heldSessions }}</div>
                <div class="label">جلسة</div>
              </div>
              <div class="stat">
                <div class="num">{{ pct(ov().hifzTotals.att.rate) }}</div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ ov().hifzTotals.pages }}</div>
                <div class="label">وجه</div>
              </div>
              <div class="stat">
                <div class="num">{{ pct(ov().hifzTotals.avgScore) }}</div>
                <div class="label">متوسّط التسميع</div>
              </div>
            </div>

            @for (rep of hifzReports(); track rep.circleId) {
              @if (hifzRows(rep).length > 0) {
                <h4 class="grp">{{ rep.circleName }}</h4>
                <div class="table-wrap">
                  <table class="rep-table">
                    <thead>
                      <tr>
                        <th>الطالب</th>
                        <th>الحضور</th>
                        <th>الأوجه</th>
                        <th>المتوسّط</th>
                        <th>سرد/اختبار</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of hifzRows(rep); track r.studentId) {
                        <tr class="row-click" (click)="toggle(r.studentId)">
                          <td class="c-name">{{ r.name }}</td>
                          <td>{{ pct(r.att.rate) }}</td>
                          <td>{{ r.pages }}</td>
                          <td>{{ pct(r.avgScore) }}</td>
                          <td>{{ r.sardCount }} / {{ r.examCount }}</td>
                        </tr>
                        @if (expanded() === r.studentId) {
                          <tr>
                            <td colspan="5" class="c-detail">
                              @if (timeline(); as tl) {
                                @if (tl.days.length === 0) {
                                  <p class="muted">لا سجلّات في هذه الفترة.</p>
                                } @else {
                                  @for (d of tl.days; track d.date) {
                                    <div class="day">
                                      <span class="day-date">{{ dmy(d.date) }}</span>
                                      <span class="day-state">{{ dayStatus(d) }}</span>
                                      <span class="day-out" [class.gap]="isGap(d)">{{
                                        dayDetail(d)
                                      }}</span>
                                    </div>
                                  }
                                }
                              }
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>

                @if (gapsOf(rep).length > 0) {
                  <p class="alert">⚠ {{ gapsOf(rep).join(' · ') }}</p>
                }
              }
            }
          </div>
        }

        <!-- ملخّص التجويد -->
        @if (tajweedReports().length > 0) {
          <div class="card">
            <h3 class="sec-title">حلقات التجويد — {{ period.label() }}</h3>
            <div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">
              <div class="stat">
                <div class="num">{{ ov().tajweedTotals.heldSessions }}</div>
                <div class="label">جلسة</div>
              </div>
              <div class="stat">
                <div class="num">{{ pct(ov().tajweedTotals.att.rate) }}</div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ ov().tajweedTotals.exams }}</div>
                <div class="label">اختبار</div>
              </div>
            </div>

            @for (rep of tajweedReports(); track rep.circleId) {
              @if (tajweedRows(rep).length > 0) {
                <h4 class="grp">{{ rep.circleName }}</h4>
                @if (rep.exams.length === 0) {
                  <p class="muted small">لا اختبارات في هذه الفترة — الحضور فقط.</p>
                }
                <div class="table-wrap">
                  <table class="rep-table">
                    <thead>
                      <tr>
                        <th>الطالب</th>
                        <th>الحضور</th>
                        @for (e of rep.exams; track e.id) {
                          <th>{{ e.name }}</th>
                        }
                        @if (rep.exams.length > 0) {
                          <th>المجموع</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of tajweedRows(rep); track r.studentId) {
                        <tr>
                          <td class="c-name">{{ r.name }}</td>
                          <td>{{ pct(r.att.rate) }}</td>
                          @for (e of rep.exams; track e.id) {
                            @let cell = cellOf(r, e.id);
                            <td
                              [class.fail]="!!cell && cell.score !== null && !cell.passed"
                              [class.na]="!cell"
                            >
                              {{
                                !cell
                                  ? '·'
                                  : cell.score === null
                                    ? '—'
                                    : cell.score + ' / ' + cell.totalScore
                              }}
                            </td>
                          }
                          @if (rep.exams.length > 0) {
                            <td class="c-total">{{ r.achieved }} / {{ r.maxScore }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        }
      }
    </div>

    <!-- زرّ إنشاء التقرير — عائم فوق كلّ شيء، في متناول الإبهام -->
    @if (!loading()) {
      <button type="button" class="fab" (click)="dialogOpen.set(true)">🖨️ إنشاء تقرير</button>
    }

    @if (dialogOpen()) {
      <app-report-dialog
        [source]="source()"
        [teacherName]="teacherName()"
        [intro]="intro()"
        [outro]="outro()"
        [initialPeriod]="period"
        [initialCircleIds]="circleIds()"
        (close)="dialogOpen.set(false)"
      />
    }
  `,
  styles: [
    `
      .page {
        padding: 12px;
        padding-bottom: 150px;
      }
      .sec-title {
        margin: 0 0 10px;
        font-size: 0.95rem;
        font-weight: 800;
      }
      .sec-title .count {
        font-weight: 600;
        color: var(--text-soft);
      }
      .head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .head-row .sec-title {
        margin: 0;
      }
      .grp-head {
        margin-bottom: 6px;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .grp {
        margin: 16px 0 6px;
        font-size: 0.88rem;
        font-weight: 800;
      }
      .small {
        font-size: 0.78rem;
      }
      /* الجداول العريضة (اختبارات تجويد كثيرة) تُمرَّر أفقيًّا بدل أن تُقصّ
         خارج الشاشة — كان عمود «المجموع» يختفي كليًّا على عرض الجوّال. */
      .table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .rep-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 0.82rem;
      }
      .rep-table th {
        padding: 8px 4px;
        border-bottom: 2px solid var(--border);
        font-weight: 800;
        font-size: 0.74rem;
        color: var(--text-soft);
      }
      .rep-table td {
        padding: 9px 6px;
        border-bottom: 1px solid var(--border);
        text-align: center;
        white-space: nowrap;
      }
      .rep-table .c-name {
        text-align: start;
        font-weight: 700;
      }
      .rep-table .c-total {
        font-weight: 800;
      }
      .rep-table td.fail {
        color: var(--danger);
        font-weight: 700;
      }
      .rep-table td.na {
        color: var(--text-soft);
        opacity: 0.5;
      }
      .row-click {
        cursor: pointer;
      }
      .c-detail {
        text-align: start !important;
        background: var(--bg);
        padding: 10px !important;
      }
      .day {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 0;
        font-size: 0.76rem;
        border-bottom: 1px dashed var(--border);
      }
      .day:last-child {
        border-bottom: none;
      }
      .day-date {
        font-weight: 700;
        white-space: nowrap;
      }
      .day-state {
        color: var(--text-soft);
        white-space: nowrap;
      }
      .day-out {
        text-align: end;
        flex: 1;
      }
      .day-out.gap {
        color: var(--danger);
      }
      .alert {
        margin: 8px 0 0;
        font-size: 0.78rem;
        color: var(--danger);
      }
      /* زرّ مُدمَج في الزاوية بدل شريط بعرض الشاشة — الشريط كان يحجب صفًّا
         كاملًا من الجدول خلفه في كلّ وضع تمرير. */
      .fab {
        position: fixed;
        inset-inline-end: 16px;
        bottom: 78px;
        z-index: 40;
        padding: 12px 16px;
        border: none;
        border-radius: 14px;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
        color: #fff;
        font-family: inherit;
        font-size: 0.96rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(13, 92, 63, 0.35);
      }
      .fab:active {
        transform: translateY(1px);
      }
    `,
  ],
})
export class ReportsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly reportData = inject(ReportDataService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly bundle = this.reportData.bundle(this.destroyRef);
  readonly loading = this.bundle.loading;
  readonly source = this.bundle.source;

  readonly dmy = dmy;
  readonly dialogOpen = signal(false);

  /** الشهر الجاري افتراضًا — اللوحة تفتح على ملخّص مفيد بلا أيّ ضبط. */
  readonly period = new PeriodState();

  readonly teacherName = computed(() => this.auth.teacher()?.name ?? '');
  /**
   * ترويسة المعلّم إن ضبطها، وإلّا ترويسة فترة محايدة — لا ترويسة الجلسة
   * («هذا تقرير حلقة اليوم») التي لا تصلح فوق بيانات شهر كامل.
   */
  readonly intro = computed(
    () => (this.auth.teacher()?.reportIntro ?? '').trim() || DEFAULT_PERIOD_REPORT_INTRO,
  );
  readonly outro = computed(
    () => (this.auth.teacher()?.reportOutro ?? '').trim() || DEFAULT_REPORT_OUTRO,
  );

  /* ---------- الحلقات ---------- */

  readonly circles = computed(() => this.source().circles);
  readonly hifzCircles = computed(() => this.circles().filter((c) => !isTajweedCircle(c)));
  readonly tajweedCircles = computed(() => this.circles().filter((c) => isTajweedCircle(c)));

  private readonly circleOverride = signal<string[] | null>(null);

  /**
   * بلا اختيار صريح: **كلّ** الحلقات. اللوحة يجب أن تعرض شيئًا مفيدًا فور
   * فتحها بلا ضبط. ويُقبَل `?circle=` من الرابط للقدوم من صفحة حلقة بعينها.
   */
  readonly circleIds = computed<string[]>(() => {
    const manual = this.circleOverride();
    if (manual !== null) return manual;
    const fromUrl = this.route.snapshot.queryParamMap.get('circle');
    const all = this.circles().map((c) => c.id);
    return fromUrl && all.includes(fromUrl) ? [fromUrl] : all;
  });

  readonly allCirclesOn = computed(
    () => this.circles().length > 0 && this.circleIds().length === this.circles().length,
  );

  toggleCircle(id: string): void {
    const cur = this.circleIds();
    this.circleOverride.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    this.expanded.set(null);
  }

  toggleAllCircles(): void {
    this.circleOverride.set(this.allCirclesOn() ? [] : this.circles().map((c) => c.id));
    this.expanded.set(null);
  }

  /* ---------- الطلّاب ---------- */

  readonly studentOptions = computed<Student[]>(() => {
    const ids = this.circleIds();
    return this.source()
      .students.filter((s) => s.active && studentCircleIds(s).some((c) => ids.includes(c)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  });

  private readonly studentOverride = signal<string[] | null>(null);

  readonly studentIds = computed<string[]>(
    () => this.studentOverride() ?? this.studentOptions().map((s) => s.id),
  );

  /** `true` ما لم يُضيّق المعلّم الاختيار صراحةً. */
  readonly allStudentsOn = computed(() => this.studentOverride() === null);

  toggleStudent(id: string): void {
    const cur = this.studentIds();
    this.studentOverride.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    this.expanded.set(null);
  }

  toggleAllStudents(): void {
    // من «الكلّ» إلى وضع الاختيار (يبدأ فارغًا)، ومنه رجوعًا إلى «الكلّ».
    this.studentOverride.set(this.allStudentsOn() ? [] : null);
    this.expanded.set(null);
  }

  /* ---------- اللوحة ---------- */

  readonly ov = computed(() =>
    buildOverviewReport(this.source(), this.circleIds(), this.period.period()),
  );

  readonly hifzReports = computed(() => this.ov().hifz);
  readonly tajweedReports = computed(() => this.ov().tajweed);

  private inScope(id: string): boolean {
    return this.allStudentsOn() || this.studentIds().includes(id);
  }

  hifzRows(rep: HifzCircleReport): HifzStudentRow[] {
    return rep.rows.filter((r) => this.inScope(r.studentId));
  }

  tajweedRows(rep: TajweedCircleReport): TajweedStudentRow[] {
    return rep.rows.filter((r) => this.inScope(r.studentId));
  }

  cellOf(row: TajweedStudentRow, examId: string): TajweedExamCell | undefined {
    return row.cells.find((c) => c.examId === examId);
  }

  /** «٩٢٪» أو «—» — لا صفر، فالصفر يُقرأ رسوبًا لا غياب بيانات. */
  pct(v: number | null): string {
    return v === null ? '—' : `${v}٪`;
  }

  /** تنبيهات الحلقة: الفجوات والمنقطعون — لبّ فائدة اللوحة للمعلّم. */
  gapsOf(rep: HifzCircleReport): string[] {
    const out: string[] = [];
    const gaps = this.hifzRows(rep).filter((r) => r.idleDays > 0);
    if (gaps.length > 0) out.push(`${gaps.length} بحضور بلا إنجاز`);
    const idle = this.hifzRows(rep).filter(
      (r) => r.daysSinceActivity === null || r.daysSinceActivity >= INACTIVE_DAYS,
    );
    if (idle.length > 0) out.push(`منقطعون: ${idle.map((r) => r.name).join('، ')}`);
    return out;
  }

  /* ---------- تفصيل الطالب ---------- */

  readonly expanded = signal<string | null>(null);

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  readonly timeline = computed<StudentTimeline | null>(() => {
    const id = this.expanded();
    if (!id) return null;
    const st = this.source().students.find((s) => s.id === id);
    return st ? buildStudentTimeline(this.source(), st, this.period.period()) : null;
  });

  dayStatus(d: StudentTimeline['days'][number]): string {
    return d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome];
  }

  isGap(d: StudentTimeline['days'][number]): boolean {
    return d.outcome === 'absent' || d.outcome === 'not_recited' || d.outcome === 'no_record';
  }

  dayDetail(d: StudentTimeline['days'][number]): string {
    if (d.recitations.length > 0) {
      const pages = d.recitations.reduce((a, r) => a + (r.pages || 0), 0);
      const best = Math.max(...d.recitations.map((r) => r.score ?? 0));
      return `${pages} وجه — ${best}٪`;
    }
    if (d.serd.length > 0) return `سرد — الجزء ${d.serd[0].juz}`;
    if (d.exams.length > 0) return `اختبار — الجزء ${d.exams[0].juz}`;
    return d.note || DAY_OUTCOME_LABELS[d.outcome];
  }
}
