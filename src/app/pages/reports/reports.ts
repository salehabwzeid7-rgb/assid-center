import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ReportDataService } from '../../core/report-data.service';
import { dmy } from '../../core/format';
import {
  ATTENDANCE_LABELS,
  DEFAULT_REPORT_INTRO,
  DEFAULT_REPORT_OUTRO,
  isTajweedCircle,
  studentCircleIds,
  type Circle,
} from '../../core/models';
import {
  customPeriod,
  dayPeriod,
  monthPeriod,
  periodLabel,
  shiftPeriod,
  todayISO,
  weekPeriod,
  yearPeriod,
  type Period,
  type PeriodKind,
} from '../../core/report-period';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  buildCircleReport,
  buildOverviewReport,
  buildStudentTimeline,
  isEmptyReport,
  tallyLabel,
  type CircleReport,
  type HifzStudentRow,
  type StudentTimeline,
  type TajweedExamCell,
  type TajweedStudentRow,
} from '../../core/reports';
import {
  circleReportText,
  overviewReportText,
  studentTimelineText,
  type ReportAudience,
} from '../../core/report-text';
import { PageHeaderComponent } from '../../shared/page-header';
import { ReportCardComponent } from '../../shared/report-card';
import { ReportExportComponent } from '../../shared/report-export';
import { OverviewReportCardComponent } from '../../shared/overview-report-card';
import { StudentReportCardComponent } from '../../shared/student-report-card';

/**
 * صفحة التقارير — المدخل المركزيّ من الشاشة الرئيسيّة.
 *
 * ثلاثة مرشّحات مستقلّة: المدى الزمنيّ (ميلاديّ)، والحلقات (مفردة أو متعدّدة،
 * مع فصل صارم بين التحفيظ والتجويد)، وجمهور التقرير (الأهالي / مرجعيّ).
 *
 * الصفحة **لا تحسب شيئًا بنفسها** — تنادي `buildCircleReport` /
 * `buildOverviewReport` في طبقة الحساب النقيّة، وتعرض ما يعود. وكلّ مخرَج
 * (نصّ · صورة · PDF) يُبنى من الكائن نفسه، فلا تتباين الأرقام بين نسخة وأخرى.
 */
@Component({
  selector: 'app-reports',
  imports: [
    FormsModule,
    PageHeaderComponent,
    ReportCardComponent,
    ReportExportComponent,
    OverviewReportCardComponent,
    StudentReportCardComponent,
  ],
  template: `
    <app-page-header title="التقارير" />

    <div class="page">
      <!-- ============ المدى الزمنيّ ============ -->
      <div class="card">
        <h3 class="sec-title">المدى الزمنيّ</h3>
        <div class="chips">
          @for (k of periodKinds; track k.id) {
            <button
              type="button"
              class="chip"
              [class.active]="periodKind() === k.id"
              (click)="setKind(k.id)"
            >
              {{ k.label }}
            </button>
          }
        </div>

        @if (periodKind() === 'custom') {
          <div class="field-row" style="margin-top:10px">
            <div class="field">
              <label for="rp-from">من</label>
              <input id="rp-from" type="date" [(ngModel)]="customFromValue" />
            </div>
            <div class="field">
              <label for="rp-to">إلى</label>
              <input id="rp-to" type="date" [(ngModel)]="customToValue" />
            </div>
          </div>
        } @else {
          <div class="period-nav">
            <button type="button" class="chip" (click)="step(-1)" aria-label="السابق">›</button>
            <span class="period-label">{{ periodLabelText() }}</span>
            <button type="button" class="chip" (click)="step(1)" aria-label="التالي">‹</button>
          </div>
        }
      </div>

      <!-- ============ الحلقات ============ -->
      <div class="card">
        <h3 class="sec-title">الحلقات</h3>
        @if (loading()) {
          <p class="muted">جارٍ تحميل الحلقات…</p>
        } @else {
          @if (hifzCircles().length > 0) {
            <div class="group-head">
              <span>حلقات التحفيظ</span>
              <button type="button" class="chip" (click)="toggleGroup('hifz')">
                {{ allSelected(hifzCircles()) ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
              </button>
            </div>
            <div class="chips">
              @for (c of hifzCircles(); track c.id) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="isSelected(c.id)"
                  (click)="toggleCircle(c.id)"
                >
                  {{ c.name }}
                </button>
              }
            </div>
          }

          @if (tajweedCircles().length > 0) {
            <div class="group-head" style="margin-top:12px">
              <span>حلقات التجويد</span>
              <button type="button" class="chip" (click)="toggleGroup('tajweed')">
                {{ allSelected(tajweedCircles()) ? 'إلغاء الكلّ' : 'تحديد الكلّ' }}
              </button>
            </div>
            <div class="chips">
              @for (c of tajweedCircles(); track c.id) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="isSelected(c.id)"
                  (click)="toggleCircle(c.id)"
                >
                  {{ c.name }}
                </button>
              }
            </div>
          }

          @if (hifzCircles().length === 0 && tajweedCircles().length === 0) {
            <p class="muted">لا حلقات مسجَّلة بعد.</p>
          }
        }
      </div>

      <!-- ============ جمهور التقرير ============ -->
      <div class="card">
        <h3 class="sec-title">نوع التقرير</h3>
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
        <p class="muted hint">
          {{
            audience() === 'parents'
              ? 'موجز مبسَّط يُرسَل لوليّ الأمر — يبرز الإنجاز والحضور.'
              : 'تفصيليّ كامل للأرشفة — يشمل الفجوات وثغرات التسجيل والمنقطعين.'
          }}
        </p>
      </div>

      <!-- ============ موضوع التقرير ============ -->
      <div class="card">
        <h3 class="sec-title">التقرير عن</h3>
        <div class="chips">
          <button
            type="button"
            class="chip"
            [class.active]="subject() === 'circle'"
            (click)="setSubject('circle')"
          >
            الحلقة
          </button>
          <button
            type="button"
            class="chip"
            [class.active]="subject() === 'student'"
            (click)="setSubject('student')"
          >
            طالب واحد
          </button>
        </div>
        @if (subject() === 'student') {
          @if (studentOptions().length === 0) {
            <p class="muted hint">لا طلّاب في الحلقات المختارة — اختر حلقة أخرى.</p>
          } @else {
            <div class="field" style="margin-top:10px">
              <label for="rp-student">الطالب</label>
              <select
                id="rp-student"
                [ngModel]="selectedStudentId()"
                (ngModelChange)="selectedStudentId.set($event)"
              >
                <option value="">— اختر طالبًا —</option>
                @for (opt of studentOptions(); track opt.id) {
                  <option [value]="opt.id">{{ opt.name }}</option>
                }
              </select>
            </div>
          }
        }
      </div>

      <!-- ============ النتيجة ============ -->
      @if (loading()) {
        <div class="card"><p class="muted">جارٍ تحميل البيانات…</p></div>
      } @else if (subject() === 'student') {
        <div class="card">
          @if (studentTimeline(); as tl) {
            <h3 class="sec-title">{{ tl.name }}</h3>
            <p class="muted">{{ periodLabelText() }}</p>
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ tl.att.rate === null ? '—' : tl.att.rate + '٪' }}</div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ tl.pages }}</div>
                <div class="label">وجه</div>
              </div>
              <div class="stat">
                <div class="num">{{ tl.newPages }}</div>
                <div class="label">حفظ جديد</div>
              </div>
              <div class="stat">
                <div class="num">{{ tl.avgScore === null ? '—' : tl.avgScore + '٪' }}</div>
                <div class="label">المتوسّط</div>
              </div>
            </div>

            <!-- الجدول يعرض ما سيُرسَل بالضبط: في وضع الأهالي الأيّام المُنجَزة
                 وحدها، كما في النصّ والصورة تمامًا. عرض كلّ الأيّام هنا مع
                 إخفائها في المُصدَّر يجعل ما يراه المعلّم غير ما يرسله. -->
            @if (visibleStudentDays().length === 0) {
              <p class="empty-note">
                {{
                  audience() === 'parents'
                    ? 'لا إنجاز مسجَّل لهذا الطالب في هذه الفترة.'
                    : 'لا سجلّات لهذا الطالب في هذه الفترة.'
                }}
              </p>
            } @else {
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>اليوم</th>
                    <th>الحالة</th>
                    <th>ما أُنجِز</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of visibleStudentDays(); track d.date) {
                    <tr>
                      <td class="c-name">{{ dmy(d.date) }}</td>
                      <!-- التلوين على ما أُنجِز لا على الحضور — الطالب كان حاضرًا. -->
                      <td>{{ dayStatus(d) }}</td>
                      <td [class.fail]="isGap(d.outcome)">{{ outcomeText(d) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }

            @if (tl.tajweed.length > 0) {
              <h4 class="grp">اختبارات التجويد</h4>
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>الاختبار</th>
                    <th>التاريخ</th>
                    <th>العلامة</th>
                    <th>التقدير</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of tl.tajweed; track c.examId) {
                    <tr>
                      <td class="c-name">{{ c.examName }}</td>
                      <td>{{ dmy(c.date) }}</td>
                      <td class="c-total">
                        {{ c.score === null ? '—' : c.score + ' / ' + c.totalScore }}
                      </td>
                      <td [class.fail]="!c.passed">{{ c.verdict }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          } @else {
            <p class="muted">اختر طالبًا من القائمة أعلاه لعرض تقريره.</p>
          }
        </div>
      } @else if (selectedIds().length === 0) {
        <div class="card"><p class="muted">اختر حلقة واحدة على الأقلّ لعرض التقرير.</p></div>
      } @else if (singleReport(); as rep) {
        <!-- ---- حلقة واحدة ---- -->
        <div class="card">
          <h3 class="sec-title">{{ rep.circleTitle }}</h3>
          <p class="muted">{{ periodLabelText() }}</p>

          @if (isEmpty(rep)) {
            <p class="empty-note">
              لا توجد أيّ بيانات مسجَّلة لهذه الحلقة في هذه الفترة — لا جلسات ولا حضور.
            </p>
          } @else if (rep.kind === 'hifz') {
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ rep.heldCount }}</div>
                <div class="label">جلسة</div>
              </div>
              <div class="stat">
                <div class="num">{{ rep.att.rate === null ? '—' : rep.att.rate + '٪' }}</div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ rep.totalPages }}</div>
                <div class="label">وجه</div>
              </div>
              <div class="stat">
                <div class="num">{{ rep.avgScore === null ? '—' : rep.avgScore + '٪' }}</div>
                <div class="label">متوسّط التسميع</div>
              </div>
            </div>

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
                @for (r of rep.rows; track r.studentId) {
                  <tr class="rep-row" (click)="toggleStudent(r.studentId)">
                    <td class="c-name">{{ r.name }}</td>
                    <td>{{ r.att.rate === null ? '—' : r.att.rate + '٪' }}</td>
                    <td>{{ r.pages }}</td>
                    <td>{{ r.avgScore === null ? '—' : r.avgScore + '٪' }}</td>
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
                                <span class="day-out" [class.gap]="isGap(d.outcome)">{{
                                  outcomeText(d)
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

            @if (audience() === 'reference') {
              <div class="alerts">
                @if (rep.studentsWithGaps > 0) {
                  <p>⚠ {{ rep.studentsWithGaps }} طالبًا لهم أيّام حضور بلا إنجاز.</p>
                }
                @if (rep.inactiveStudents.length > 0) {
                  <p>
                    ⚠ {{ rep.inactiveStudents.length }} بلا نشاط منذ {{ INACTIVE_DAYS }} يومًا
                    فأكثر:
                    {{ inactiveNames(rep) }}
                  </p>
                }
                @if (rep.studentsWithGaps === 0 && rep.inactiveStudents.length === 0) {
                  <p class="ok">✓ لا فجوات ولا انقطاع في هذه الفترة.</p>
                }
              </div>
            }
          } @else {
            <!-- ---- فرع التجويد: حضور واختبارات بالعلامة الفعليّة فقط ---- -->
            <div class="stat-grid" style="grid-template-columns:1fr 1fr">
              <div class="stat">
                <div class="num">{{ rep.heldCount }}</div>
                <div class="label">جلسة</div>
              </div>
              <div class="stat">
                <div class="num">{{ rep.att.rate === null ? '—' : rep.att.rate + '٪' }}</div>
                <div class="label">الحضور</div>
              </div>
            </div>

            @if (rep.exams.length === 0) {
              <p class="empty-note">لا اختبارات تجويد في هذه الفترة — التقرير يعرض الحضور وحده.</p>
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحضور</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rep.rows; track r.studentId) {
                    <tr>
                      <td class="c-name">{{ r.name }}</td>
                      <td>{{ tallyText(r) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="exam-list">
                @for (e of rep.exams; track e.id) {
                  <span class="exam-pill"
                    >{{ e.name }} — {{ dmy(e.date) }} ({{ e.totalScore }})</span
                  >
                }
              </div>
              <table class="rep-table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحضور</th>
                    @for (e of rep.exams; track e.id) {
                      <th>{{ e.name }}</th>
                    }
                    <th>المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rep.rows; track r.studentId) {
                    <tr>
                      <td class="c-name">{{ r.name }}</td>
                      <td>{{ r.att.rate === null ? '—' : r.att.rate + '٪' }}</td>
                      <!-- ربط العمود بمعرّف الاختبار لا بترتيب الخلايا — طالب غير
                           مستهدَف باختبار لا يملك خليّة له، فالترتيب يُزيح أعمدته. -->
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
                      <td class="c-total">{{ r.achieved }} / {{ r.maxScore }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          }
        </div>
      } @else {
        <!-- ---- عدّة حلقات: ملخّص عامّ مفصول بالنوع ---- -->
        <div class="card">
          <h3 class="sec-title">تقرير عامّ — {{ selectedIds().length }} حلقات</h3>
          <p class="muted">{{ periodLabelText() }}</p>

          @if (overview().hifz.length > 0) {
            <h4 class="grp">حلقات التحفيظ ({{ overview().hifzTotals.circles }})</h4>
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ overview().hifzTotals.students }}</div>
                <div class="label">طالب</div>
              </div>
              <div class="stat">
                <div class="num">
                  {{
                    overview().hifzTotals.att.rate === null
                      ? '—'
                      : overview().hifzTotals.att.rate + '٪'
                  }}
                </div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ overview().hifzTotals.pages }}</div>
                <div class="label">وجه</div>
              </div>
              <div class="stat">
                <div class="num">
                  {{
                    overview().hifzTotals.avgScore === null
                      ? '—'
                      : overview().hifzTotals.avgScore + '٪'
                  }}
                </div>
                <div class="label">المتوسّط</div>
              </div>
            </div>
            <table class="rep-table">
              <thead>
                <tr>
                  <th>الحلقة</th>
                  <th>طلّاب</th>
                  <th>الحضور</th>
                  <th>الأوجه</th>
                  <th>المتوسّط</th>
                </tr>
              </thead>
              <tbody>
                @for (c of overview().hifz; track c.circleId) {
                  <tr>
                    <td class="c-name">{{ c.circleName }}</td>
                    <td>{{ c.studentCount }}</td>
                    <td>{{ c.att.rate === null ? '—' : c.att.rate + '٪' }}</td>
                    <td>{{ c.totalPages }}</td>
                    <td>{{ c.avgScore === null ? '—' : c.avgScore + '٪' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (overview().tajweed.length > 0) {
            <h4 class="grp">حلقات التجويد ({{ overview().tajweedTotals.circles }})</h4>
            <div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">
              <div class="stat">
                <div class="num">{{ overview().tajweedTotals.students }}</div>
                <div class="label">طالب</div>
              </div>
              <div class="stat">
                <div class="num">
                  {{
                    overview().tajweedTotals.att.rate === null
                      ? '—'
                      : overview().tajweedTotals.att.rate + '٪'
                  }}
                </div>
                <div class="label">الحضور</div>
              </div>
              <div class="stat">
                <div class="num">{{ overview().tajweedTotals.exams }}</div>
                <div class="label">اختبار</div>
              </div>
            </div>
            <table class="rep-table">
              <thead>
                <tr>
                  <th>الحلقة</th>
                  <th>طلّاب</th>
                  <th>الحضور</th>
                  <th>اختبارات</th>
                  <th>المجموع</th>
                </tr>
              </thead>
              <tbody>
                @for (c of overview().tajweed; track c.circleId) {
                  <tr>
                    <td class="c-name">{{ c.circleName }}</td>
                    <td>{{ c.studentCount }}</td>
                    <td>{{ c.att.rate === null ? '—' : c.att.rate + '٪' }}</td>
                    <td>{{ c.exams.length }}</td>
                    <td class="c-total">{{ c.achieved }} / {{ c.maxScore }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      <!-- ============ التصدير ============ -->
      @if (!loading() && hasReport()) {
        <div class="card">
          <div class="rep-head">
            <h3 class="sec-title">نصّ التقرير</h3>
            @if (edited()) {
              <button type="button" class="chip" (click)="resetText()">↺ استعادة الأصل</button>
            }
          </div>
          <textarea class="report-text" rows="12" [value]="displayText()" (input)="onEdit($event)">
          </textarea>
          <div class="export-bar">
            <button type="button" class="btn btn-primary" (click)="copy()">📋 نسخ النصّ</button>
          </div>
        </div>

        <!-- صورة + PDF: تُبنيان من نفس الكائن المحسوب الذي بُني منه النصّ،
             فيستحيل أن تختلف الأرقام بين النسخ الثلاث. -->
        @if (studentTimeline(); as tl) {
          <div class="card">
            <h3 class="sec-title">صورة وملفّ PDF</h3>
            <app-report-export [fileName]="exportFileName()" [shareTitle]="tl.name">
              <app-student-report-card
                [timeline]="tl"
                [teacherName]="teacherName()"
                [audience]="audience()"
              />
            </app-report-export>
          </div>
        } @else if (singleReport(); as rep) {
          <div class="card">
            <h3 class="sec-title">صورة وملفّ PDF</h3>
            <app-report-export [fileName]="exportFileName()" [shareTitle]="rep.circleTitle">
              <app-report-card
                [report]="rep"
                [teacherName]="teacherName()"
                [audience]="audience()"
              />
            </app-report-export>
          </div>
        } @else {
          <div class="card">
            <h3 class="sec-title">صورة وملفّ PDF</h3>
            <app-report-export [fileName]="exportFileName()" shareTitle="تقرير عامّ">
              <app-overview-report-card [overview]="overview()" [teacherName]="teacherName()" />
            </app-report-export>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .page {
        padding: 12px;
        padding-bottom: 90px;
      }
      .sec-title {
        margin: 0 0 10px;
        font-size: 0.95rem;
        font-weight: 800;
      }
      .group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .period-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
      }
      .period-label {
        flex: 1;
        text-align: center;
        font-weight: 800;
        font-size: 0.95rem;
      }
      .hint {
        margin: 8px 0 0;
        font-size: 0.78rem;
      }
      .grp {
        margin: 16px 0 8px;
        font-size: 0.88rem;
        font-weight: 800;
      }
      .rep-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        font-size: 0.82rem;
      }
      .rep-table th {
        padding: 8px 4px;
        border-bottom: 2px solid var(--border);
        font-weight: 800;
        font-size: 0.76rem;
        color: var(--text-soft);
      }
      .rep-table td {
        padding: 9px 4px;
        border-bottom: 1px solid var(--border);
        text-align: center;
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
      .rep-row {
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
        gap: 10px;
        padding: 4px 0;
        font-size: 0.78rem;
        border-bottom: 1px dashed var(--border);
      }
      .day:last-child {
        border-bottom: none;
      }
      .day-date {
        font-weight: 700;
        white-space: nowrap;
      }
      .day-out {
        text-align: end;
      }
      .day-out.gap {
        color: var(--danger);
      }
      .exam-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
      }
      .exam-pill {
        padding: 4px 9px;
        border-radius: 999px;
        background: var(--bg);
        border: 1px solid var(--border);
        font-size: 0.74rem;
        font-weight: 700;
      }
      .empty-note {
        margin: 12px 0 0;
        padding: 12px;
        border-radius: 10px;
        background: var(--bg);
        border: 1px dashed var(--border);
        font-size: 0.84rem;
        color: var(--text-soft);
        text-align: center;
      }
      .alerts {
        margin-top: 12px;
        font-size: 0.8rem;
      }
      .alerts p {
        margin: 4px 0;
        color: var(--danger);
      }
      .alerts p.ok {
        color: var(--text-soft);
      }
      .rep-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .report-text {
        width: 100%;
        margin-top: 6px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        font-family: inherit;
        font-size: 0.8rem;
        line-height: 1.7;
        resize: vertical;
      }
      .export-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .export-bar .btn {
        flex: 1;
        min-width: 120px;
      }
    `,
  ],
})
export class ReportsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly reportData = inject(ReportDataService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly route = inject(ActivatedRoute);

  private readonly bundle = this.reportData.bundle(this.destroyRef);
  readonly loading = this.bundle.loading;

  readonly dmy = dmy;
  readonly INACTIVE_DAYS = INACTIVE_DAYS;

  readonly periodKinds: { id: PeriodKind; label: string }[] = [
    { id: 'day', label: 'يوم' },
    { id: 'week', label: 'أسبوع' },
    { id: 'month', label: 'شهر' },
    { id: 'year', label: 'سنة' },
    { id: 'custom', label: 'مخصّص' },
  ];

  /* ---------- المدى ---------- */

  readonly periodKind = signal<PeriodKind>('month');
  /** تاريخ مرجعيّ داخل المدى الحاليّ — تُشتقّ منه حدوده. */
  private readonly anchor = signal(todayISO());
  private readonly customFrom = signal(todayISO().slice(0, 8) + '01');
  private readonly customTo = signal(todayISO());

  get customFromValue(): string {
    return this.customFrom();
  }
  set customFromValue(v: string) {
    if (v) this.customFrom.set(v);
  }
  get customToValue(): string {
    return this.customTo();
  }
  set customToValue(v: string) {
    if (v) this.customTo.set(v);
  }

  readonly period = computed<Period>(() => {
    const a = this.anchor();
    switch (this.periodKind()) {
      case 'day':
        return dayPeriod(a);
      case 'week':
        return weekPeriod(a);
      case 'year':
        return yearPeriod(a.slice(0, 4));
      case 'custom':
        return customPeriod(this.customFrom(), this.customTo());
      default:
        return monthPeriod(a.slice(0, 7));
    }
  });

  readonly periodLabelText = computed(() => periodLabel(this.period()));

  setKind(k: PeriodKind): void {
    this.periodKind.set(k);
  }

  step(delta: number): void {
    const next = shiftPeriod(this.period(), delta);
    this.anchor.set(next.from);
  }

  /* ---------- الحلقات ---------- */

  private readonly circles = computed(() => this.bundle.source().circles);
  readonly hifzCircles = computed(() => this.circles().filter((c) => !isTajweedCircle(c)));
  readonly tajweedCircles = computed(() => this.circles().filter((c) => isTajweedCircle(c)));

  /** يُهيَّأ من مُعامل الرابط `?circle=` عند القدوم من صفحة حلقة، وإلّا فارغ. */
  private readonly manualSelection = signal<string[] | null>(null);

  readonly selectedIds = computed<string[]>(() => {
    const manual = this.manualSelection();
    if (manual !== null) return manual;
    const fromUrl = this.route.snapshot.queryParamMap.get('circle');
    const known = new Set(this.circles().map((c) => c.id));
    return fromUrl && known.has(fromUrl) ? [fromUrl] : [];
  });

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleCircle(id: string): void {
    const cur = this.selectedIds();
    this.manualSelection.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    this.expanded.set(null);
  }

  allSelected(list: readonly Circle[]): boolean {
    return list.length > 0 && list.every((c) => this.isSelected(c.id));
  }

  toggleGroup(kind: 'hifz' | 'tajweed'): void {
    const list = kind === 'hifz' ? this.hifzCircles() : this.tajweedCircles();
    const ids = list.map((c) => c.id);
    const cur = this.selectedIds();
    this.manualSelection.set(
      this.allSelected(list) ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])],
    );
    this.expanded.set(null);
  }

  /* ---------- الجمهور ---------- */

  readonly audience = signal<ReportAudience>('parents');

  /* ---------- موضوع التقرير ---------- */

  /** تقرير حلقة (أو عدّة حلقات) أم تقرير طالب واحد عبر كلّ حلقاته. */
  readonly subject = signal<'circle' | 'student'>('circle');
  readonly selectedStudentId = signal<string>('');

  setSubject(s: 'circle' | 'student'): void {
    this.subject.set(s);
    this.expanded.set(null);
  }

  /**
   * طلّاب القائمة — محصورون بالحلقات المختارة إن وُجدت، وإلّا فكلّ الطلّاب
   * النشطين. تقرير الطالب يغطّي **كلّ** حلقاته لا المختارة وحدها: الطالب
   * المسجَّل في تحفيظ وتجويد معًا تقريره واحد يجمعهما، وإلّا كان ناقصًا.
   */
  readonly studentOptions = computed(() => {
    const ids = this.selectedIds();
    const active = this.bundle.source().students.filter((st) => st.active);
    const list =
      ids.length === 0
        ? active
        : active.filter((st) => studentCircleIds(st).some((c) => ids.includes(c)));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  });

  /** سِجلّ الطالب المختار — `null` إن لم يُختَر أحد أو لم نكن في وضع الطالب. */
  readonly studentTimeline = computed<StudentTimeline | null>(() => {
    if (this.subject() !== 'student') return null;
    const id = this.selectedStudentId();
    if (!id) return null;
    const st = this.bundle.source().students.find((x) => x.id === id);
    return st ? buildStudentTimeline(this.bundle.source(), st, this.period()) : null;
  });

  /**
   * أيّام الطالب المعروضة — مرشَّحة بنفس قاعدة النصّ والصورة، فما يظهر على
   * الشاشة هو ما سيُرسَل حرفيًّا. تقرير الأهالي يعرض المُنجَز وحده؛ قائمة غياب
   * طويلة ليست تقريرًا يُرسَل لوليّ أمر.
   */
  readonly visibleStudentDays = computed(() => {
    const tl = this.studentTimeline();
    if (!tl) return [];
    if (this.audience() === 'reference') return tl.days;
    return tl.days.filter((d) => d.recitations.length || d.serd.length || d.exams.length);
  });

  /** هل هناك تقرير معروض أصلًا؟ — يحكم ظهور قسم التصدير بأكمله. */
  readonly hasReport = computed(() =>
    this.subject() === 'student' ? this.studentTimeline() !== null : this.selectedIds().length > 0,
  );

  /** حالة اليوم نصًّا: حالة الحضور المسجّلة، وإلّا حصيلة اليوم المشتقّة. */
  dayStatus(d: StudentTimeline['days'][number]): string {
    return d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome];
  }

  /** خليّة الطالب في اختبار تجويد بعينه — `undefined` إن لم يكن مستهدَفًا به. */
  cellOf(row: TajweedStudentRow, examId: string): TajweedExamCell | undefined {
    return row.cells.find((c) => c.examId === examId);
  }

  /* ---------- التقارير المحسوبة ---------- */

  /** تقرير حلقة واحدة — `null` إن لم تُختَر حلقة واحدة بالضبط. */
  readonly singleReport = computed<CircleReport | null>(() => {
    const ids = this.selectedIds();
    if (ids.length !== 1) return null;
    const circle = this.circles().find((c) => c.id === ids[0]);
    if (!circle) return null;
    return buildCircleReport(this.bundle.source(), circle, this.period());
  });

  readonly overview = computed(() =>
    buildOverviewReport(this.bundle.source(), this.selectedIds(), this.period()),
  );

  isEmpty(rep: CircleReport): boolean {
    return isEmptyReport(rep);
  }

  tallyText(r: HifzStudentRow | TajweedStudentRow): string {
    return tallyLabel(r.att);
  }

  inactiveNames(rep: CircleReport): string {
    if (rep.kind !== 'hifz') return '';
    return rep.inactiveStudents.map((r) => r.name).join('، ');
  }

  /* ---------- تفصيل الطالب ---------- */

  readonly expanded = signal<string | null>(null);

  toggleStudent(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  readonly timeline = computed<StudentTimeline | null>(() => {
    const id = this.expanded();
    if (!id) return null;
    const st = this.bundle.source().students.find((s) => s.id === id);
    return st ? buildStudentTimeline(this.bundle.source(), st, this.period()) : null;
  });

  isGap(outcome: StudentTimeline['days'][number]['outcome']): boolean {
    return outcome === 'not_recited' || outcome === 'no_record' || outcome === 'absent';
  }

  /** وصف موجز ليوم واحد في التفصيل المطويّ. */
  outcomeText(d: StudentTimeline['days'][number]): string {
    if (d.recitations.length > 0) {
      const pages = d.recitations.reduce((a, r) => a + (r.pages || 0), 0);
      const best = Math.max(...d.recitations.map((r) => r.score ?? 0));
      return `${pages} وجه — ${best}٪`;
    }
    if (d.serd.length > 0) return `سرد — الجزء ${d.serd[0].juz}`;
    if (d.exams.length > 0) return `اختبار — الجزء ${d.exams[0].juz}`;
    return d.note || this.outcomeLabel(d.outcome);
  }

  private outcomeLabel(o: StudentTimeline['days'][number]['outcome']): string {
    const map: Record<string, string> = {
      postponed: 'مؤجَّل',
      not_recited: 'لم يسمّع',
      no_record: 'حاضر بلا تسجيل',
      excused: 'مأذون له',
      absent: 'غائب',
    };
    return map[o] ?? '';
  }

  /* ---------- النصّ ---------- */

  /** اسم المعلّم كما يظهر في ترويسة الصورة وملفّ PDF. */
  readonly teacherName = computed(() => this.auth.teacher()?.name ?? '');

  /** اسم الملفّ المصدَّر — بلا مسافات ولا محارف ممنوعة في أسماء الملفّات. */
  readonly exportFileName = computed(() => {
    const p = this.period();
    const tag = p.from === p.to ? p.from : `${p.from}_${p.to}`;
    const tl = this.studentTimeline();
    const raw = tl ? tl.name : (this.singleReport()?.circleName ?? 'عامّ');
    const name = raw.replace(/[\\/:*?"<>|\s]+/g, '-');
    return `تقرير-${name}-${tag}`;
  });

  private readonly meta = computed(() => {
    const t = this.auth.teacher();
    return {
      teacherName: t?.name ?? '',
      intro: (t?.reportIntro ?? '').trim() || DEFAULT_REPORT_INTRO,
      outro: (t?.reportOutro ?? '').trim() || DEFAULT_REPORT_OUTRO,
    };
  });

  readonly reportText = computed<string>(() => {
    const tl = this.studentTimeline();
    if (tl) return studentTimelineText(tl, this.meta(), this.audience());
    if (this.subject() === 'student') return '';
    const rep = this.singleReport();
    if (rep) return circleReportText(rep, this.meta(), this.audience());
    if (this.selectedIds().length === 0) return '';
    return overviewReportText(this.overview(), this.meta());
  });

  /**
   * تعديل المعلّم على النصّ قبل إرساله — نفس سلوك تقرير الجلسة القائم. يُصفَّر
   * تلقائيًّا عند أيّ تغيير في المرشّحات، وإلّا بقي نصّ تقرير قديم معروضًا فوق
   * أرقام جديدة.
   */
  private readonly override = signal<{ key: string; text: string } | null>(null);

  private readonly stateKey = computed(
    () =>
      `${this.period().from}|${this.period().to}|${this.selectedIds().join(',')}` +
      `|${this.audience()}|${this.subject()}|${this.selectedStudentId()}`,
  );

  readonly edited = computed(() => this.override()?.key === this.stateKey());
  readonly displayText = computed(() =>
    this.edited() ? this.override()!.text : this.reportText(),
  );

  onEdit(e: Event): void {
    this.override.set({
      key: this.stateKey(),
      text: (e.target as HTMLTextAreaElement).value,
    });
  }

  resetText(): void {
    this.override.set(null);
  }

  async copy(): Promise<void> {
    const text = this.displayText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('نُسخ نصّ التقرير');
    } catch {
      this.notify.error('تعذّر النسخ — انسخ النصّ يدويًّا');
    }
  }
}
