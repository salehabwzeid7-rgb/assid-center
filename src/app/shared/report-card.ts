import { Component, computed, input } from '@angular/core';
import { dmy } from '../core/format';
import { periodLabel } from '../core/report-period';
import type { ReportAudience } from '../core/report-text';
import type {
  CircleReport,
  HifzStudentRow,
  TajweedExamCell,
  TajweedStudentRow,
} from '../core/reports';

/* ==========================================================================
   تخطيط بطاقة تقرير الحلقة المصوَّرة — الصفحات المصدريّة التي يلتقطها
   `app-report-export`. كلّ عنصر `.rx-page` يصير صورةً مستقلّة، وصفحةً في PDF.

   الألوان هنا **ثابتة عمدًا** (أخضر داكن على أبيض) ولا تتبع سمة التطبيق
   النشطة (مِسك/الزمرّد) — التقرير المُصدَّر يُشارَك خارج التطبيق، فيجب أن
   يبدو واحدًا لكلّ من يستلمه مهما كانت إعدادات جهاز المعلّم.

   تقسيم مزدوج في فرع التجويد: الصفوف تُقسَّم على صفحات (طلّاب كثيرون)،
   **والأعمدة أيضًا** (اختبارات كثيرة في مدًى واسع كسنة كاملة). بلا تقسيم
   الأعمدة يضيق الجدول حتى يصير غير مقروء في الصورة.
   ========================================================================== */

/** أقصى عدد طلّاب في الصفحة الواحدة — يبقي الصورة مقروءة على شاشة الجوّال. */
const ROWS_PER_PAGE = 12;
/** أقصى عدد أعمدة اختبارات في الصفحة الواحدة قبل الانتقال لصفحة تتمّة. */
const EXAMS_PER_PAGE = 5;

interface ExamCol {
  id: string;
  name: string;
  date: string;
  totalScore: number;
}

interface CardPage {
  no: number;
  total: number;
  /** أوّل صفحة في مجموعة أعمدة جديدة — تحمل ترويسة «تتمّة الاختبارات». */
  continued: boolean;
  /** عمود «المجموع» يظهر في آخر مجموعة أعمدة فقط، وإلّا بدا مجموعَ ما يُرى. */
  showTotal: boolean;
  examCols: ExamCol[];
  hifzRows: { studentId: string; index: number; row: HifzStudentRow }[];
  tajweedRows: { studentId: string; index: number; row: TajweedStudentRow }[];
}

@Component({
  selector: 'app-report-card',
  template: `
    @for (page of pages(); track page.no) {
      <div class="rx-page">
        <div class="rc-header">
          <div class="rc-title">{{ report().circleTitle }}</div>
          <div class="rc-period">{{ periodText() }}</div>
          @if (teacherName()) {
            <div class="rc-teacher">معلّم الحلقة: {{ teacherName() }}</div>
          }
        </div>

        <div class="rc-body">
          @if (page.no === 1) {
            <div class="rc-stats">
              @for (s of stats(); track s.label) {
                <div class="rc-stat">
                  <div class="rc-num">{{ s.value }}</div>
                  <div class="rc-lbl">{{ s.label }}</div>
                </div>
              }
            </div>
          }

          @if (page.continued) {
            <div class="rc-cont">تتمّة الاختبارات</div>
          }

          @if (report().kind === 'hifz') {
            <table class="rc-table">
              <thead>
                <tr>
                  <th class="c-idx">#</th>
                  <th class="c-name">اسم الطالب</th>
                  <th>الحضور</th>
                  <th>الأوجه</th>
                  <th>المتوسّط</th>
                  <th>سرد/اختبار</th>
                </tr>
              </thead>
              <tbody>
                @for (r of page.hifzRows; track r.studentId) {
                  <tr>
                    <td class="c-idx">{{ r.index }}</td>
                    <td class="c-name">{{ r.row.name }}</td>
                    <td>{{ r.row.att.rate === null ? '—' : r.row.att.rate + '٪' }}</td>
                    <td>{{ r.row.pages }}</td>
                    <td>{{ r.row.avgScore === null ? '—' : r.row.avgScore + '٪' }}</td>
                    <td>{{ r.row.sardCount }} / {{ r.row.examCount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else if (page.examCols.length === 0) {
            <table class="rc-table">
              <thead>
                <tr>
                  <th class="c-idx">#</th>
                  <th class="c-name">اسم الطالب</th>
                  <th>الحضور</th>
                </tr>
              </thead>
              <tbody>
                @for (r of page.tajweedRows; track r.studentId) {
                  <tr>
                    <td class="c-idx">{{ r.index }}</td>
                    <td class="c-name">{{ r.row.name }}</td>
                    <td>{{ r.row.att.rate === null ? '—' : r.row.att.rate + '٪' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="rc-note">لا اختبارات تجويد في هذه الفترة.</p>
          } @else {
            <table class="rc-table">
              <thead>
                <tr>
                  <th class="c-idx">#</th>
                  <th class="c-name">اسم الطالب</th>
                  <th>الحضور</th>
                  @for (e of page.examCols; track e.id) {
                    <th>
                      {{ e.name }}
                      <span class="c-sub">{{ dmy(e.date) }} · من {{ e.totalScore }}</span>
                    </th>
                  }
                  @if (page.showTotal) {
                    <th>المجموع</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of page.tajweedRows; track r.studentId) {
                  <tr>
                    <td class="c-idx">{{ r.index }}</td>
                    <td class="c-name">{{ r.row.name }}</td>
                    <td>{{ r.row.att.rate === null ? '—' : r.row.att.rate + '٪' }}</td>
                    <!-- العمود يُربَط بمُعرّف الاختبار لا بترتيب الخلايا: طالب غير
                         مستهدَف باختبار ما لا يملك خليّة له، فالاعتماد على الترتيب
                         يُزيح كلّ أعمدته ويعرض درجات في غير مواضعها. -->
                    @for (e of page.examCols; track e.id) {
                      @let cell = cellOf(r.row, e.id);
                      <td
                        [class.c-fail]="!!cell && cell.score !== null && !cell.passed"
                        [class.c-na]="!cell"
                      >
                        {{ !cell ? '·' : cell.score === null ? '—' : cell.score }}
                      </td>
                    }
                    @if (page.showTotal) {
                      <td class="c-total">{{ r.row.achieved }} / {{ r.row.maxScore }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            <p class="rc-legend">
              «·» غير مستهدَف بالاختبار &nbsp;&nbsp;·&nbsp;&nbsp; «—» لم تُسجَّل نتيجته
            </p>
          }

          @if (page.no === page.total && audience() === 'reference' && warnings().length > 0) {
            <div class="rc-warn">
              @for (w of warnings(); track w) {
                <div>⚠ {{ w }}</div>
              }
            </div>
          }

          @if (page.total > 1) {
            <div class="rc-pageno">صفحة {{ page.no }} من {{ page.total }}</div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .rx-page {
        width: 780px;
        background: #fff;
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', system-ui, sans-serif;
        direction: rtl;
        border-radius: 14px;
        overflow: hidden;
      }
      .rc-header {
        padding: 20px 24px 16px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .rc-title {
        font-size: 1.24rem;
        font-weight: 800;
        color: #fff;
      }
      .rc-period {
        margin-top: 4px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .rc-teacher {
        margin-top: 4px;
        font-size: 0.84rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.82);
      }
      .rc-body {
        padding: 16px 20px 20px;
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 46 46'%3E%3Cg fill='none' stroke='%230d5c3f' stroke-width='1' opacity='0.07'%3E%3Cpath d='M23 3 L43 23 L23 43 L3 23 Z'/%3E%3Ccircle cx='23' cy='23' r='3.5'/%3E%3C/g%3E%3C/svg%3E");
        background-repeat: repeat;
      }
      .rc-stats {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }
      .rc-stat {
        flex: 1;
        padding: 10px 6px;
        border-radius: 10px;
        background: #eaf3ee;
        border: 1px solid #cfe3d8;
        text-align: center;
      }
      .rc-num {
        font-size: 1.16rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .rc-lbl {
        margin-top: 2px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #4b6b5c;
      }
      .rc-cont {
        margin-bottom: 10px;
        padding: 6px 10px;
        border-radius: 8px;
        background: #eaf3ee;
        font-size: 0.78rem;
        font-weight: 700;
        color: #0d5c3f;
        text-align: center;
      }
      .rc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
        background: #fff;
      }
      .rc-table th {
        background: #eaf3ee;
        color: #0d5c3f;
        font-weight: 800;
        padding: 8px 5px;
        border-bottom: 2px solid #0d5c3f;
        font-size: 0.76rem;
      }
      .rc-table td {
        padding: 8px 5px;
        border-bottom: 1px solid #e5e0d3;
        text-align: center;
        vertical-align: middle;
      }
      .rc-table .c-idx {
        width: 32px;
        color: #7a8b82;
      }
      .rc-table .c-name {
        text-align: start;
        font-weight: 700;
      }
      .rc-table .c-total {
        font-weight: 800;
        color: #0d5c3f;
      }
      .rc-table .c-fail {
        color: #b3261e;
        font-weight: 700;
      }
      .rc-table .c-na {
        color: #c3ccc7;
      }
      .c-sub {
        display: block;
        font-size: 0.64rem;
        font-weight: 600;
        opacity: 0.75;
      }
      .rc-note {
        margin: 12px 0 0;
        text-align: center;
        font-size: 0.8rem;
        color: #7a8b82;
      }
      .rc-legend {
        margin: 8px 0 0;
        text-align: center;
        font-size: 0.68rem;
        color: #9aa8a1;
      }
      .rc-warn {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #fdf3f2;
        border: 1px solid #f0d4d1;
        font-size: 0.78rem;
        font-weight: 700;
        color: #b3261e;
        line-height: 1.9;
      }
      .rc-pageno {
        margin-top: 12px;
        text-align: center;
        font-size: 0.78rem;
        font-weight: 700;
        color: #9aa8a1;
      }
    `,
  ],
})
export class ReportCardComponent {
  readonly report = input.required<CircleReport>();
  readonly teacherName = input<string>('');
  readonly audience = input<ReportAudience>('parents');

  readonly dmy = dmy;
  readonly periodText = computed(() => periodLabel(this.report().period));

  /** خليّة الطالب في اختبار بعينه — `undefined` إن لم يكن مستهدَفًا به أصلًا. */
  cellOf(row: TajweedStudentRow, examId: string): TajweedExamCell | undefined {
    return row.cells.find((c) => c.examId === examId);
  }

  /** بطاقات الملخّص — مختلفة بنيويًّا بين الفرعين، لا مجرّد تسميات مختلفة. */
  readonly stats = computed<{ value: string; label: string }[]>(() => {
    const rep = this.report();
    const rate = rep.att.rate === null ? '—' : rep.att.rate + '٪';
    if (rep.kind === 'hifz') {
      return [
        { value: String(rep.heldCount), label: 'جلسة' },
        { value: rate, label: 'الحضور' },
        { value: String(rep.totalPages), label: 'وجه' },
        { value: rep.avgScore === null ? '—' : rep.avgScore + '٪', label: 'متوسّط التسميع' },
      ];
    }
    const out = [
      { value: String(rep.heldCount), label: 'جلسة' },
      { value: rate, label: 'الحضور' },
      { value: String(rep.exams.length), label: 'اختبار' },
    ];
    // المجموع الخام يظهر فقط إن كان هناك اختبار فعليّ — «0 / 0» بلا معنى.
    if (rep.maxScore > 0) {
      out.push({ value: `${rep.achieved} / ${rep.maxScore}`, label: 'مجموع العلامات' });
    }
    return out;
  });

  readonly warnings = computed<string[]>(() => {
    const rep = this.report();
    const out: string[] = [];
    if (rep.kind === 'hifz') {
      if (rep.studentsWithGaps > 0) {
        out.push(`${rep.studentsWithGaps} طالبًا لهم أيّام حضور بلا إنجاز.`);
      }
      if (rep.inactiveStudents.length > 0) {
        out.push(`منقطعون: ${rep.inactiveStudents.map((r) => r.name).join('، ')}.`);
      }
    } else {
      const missed = rep.rows.filter((r) => r.missed > 0);
      if (missed.length > 0) {
        out.push(`لم تُسجَّل نتائج لـ ${missed.map((r) => r.name).join('، ')}.`);
      }
    }
    return out;
  });

  /**
   * تقسيم الصفحات: مجموعات الأعمدة × مجموعات الصفوف. في حلقات التحفيظ
   * مجموعة أعمدة واحدة دائمًا (الأعمدة ثابتة)، وفي التجويد بعدد الاختبارات.
   */
  readonly pages = computed<CardPage[]>(() => {
    const rep = this.report();
    const cols: ExamCol[] =
      rep.kind === 'tajweed'
        ? rep.exams.map((e) => ({
            id: e.id,
            name: e.name,
            date: e.date,
            totalScore: e.totalScore,
          }))
        : [];

    const colGroups: ExamCol[][] = cols.length === 0 ? [[]] : chunk(cols, EXAMS_PER_PAGE);
    const rowGroups = rep.rows.length === 0 ? [[]] : chunk([...rep.rows], ROWS_PER_PAGE);

    const total = colGroups.length * rowGroups.length;
    const out: CardPage[] = [];
    let no = 0;

    for (const [gi, group] of colGroups.entries()) {
      for (const [ri, rows] of rowGroups.entries()) {
        no++;
        const indexed = rows.map((row, i) => ({
          studentId: (row as { studentId: string }).studentId,
          index: ri * ROWS_PER_PAGE + i + 1,
          row,
        }));
        out.push({
          no,
          total,
          continued: gi > 0,
          showTotal: gi === colGroups.length - 1,
          examCols: group,
          hifzRows: rep.kind === 'hifz' ? (indexed as never) : [],
          tajweedRows: rep.kind === 'tajweed' ? (indexed as never) : [],
        });
      }
    }
    return out;
  });
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
