import { Component, computed, input } from '@angular/core';
import { dmy, weekdayAr } from '../core/format';
import {
  ATTENDANCE_LABELS,
  EXAM_PASS,
  EXAM_SCOPE_LABELS,
  RECITATION_KIND_LABELS,
  SARD_PASS,
  SERD_SCOPE_LABELS,
  passLabel,
  ratingLabel,
  scoreOf,
} from '../core/models';
import { surahName } from '../core/quran-data';
import { periodLabel } from '../core/report-period';
import type { ReportAudience } from '../core/report-text';
import { DAY_OUTCOME_LABELS, type StudentDay, type StudentTimeline } from '../core/reports';

/* ==========================================================================
   بطاقة تقرير الطالب المصوَّرة — سِجلّ يوميّ عبر كلّ حلقاته وأنشطته.

   التخطيط جدوليّ بالكامل: لكلّ نشاط عموده وصفّه، ولا نصّ حرّ مضغوط في خليّة
   واحدة. الصيغة السابقة كانت تدمج نوع النشاط ومداه ودرجته في سلسلة واحدة
   مفصولة بنقاط، فتتناثر عند طول الأسماء وتكسر محاذاة العمود كلّه.

   السرد والاختبارات لها جداولها المستقلّة أسفل السِجلّ اليوميّ — لا قوائم
   نقطيّة: أعمدة ثابتة تُقرأ بنظرة واحدة وتُقارَن رأسيًّا.

   الألوان ثابتة عمدًا (أخضر داكن على أبيض) ولا تتبع سمة التطبيق — التقرير
   يُشارَك خارجه فيجب أن يبدو واحدًا لكلّ مستلم.
   ========================================================================== */

/** أقصى عدد أيّام في الصفحة الواحدة. */
const DAYS_PER_PAGE = 14;

/** نشاط واحد داخل يوم — مفكَّك إلى أعمدته بدل سلسلة نصّيّة واحدة. */
interface DayItem {
  /** «حفظ جديد» · «مراجعة قريبة» · «سرد» · «اختبار» */
  kind: string;
  /** المقطع أو الجزء — قد يكون فارغًا. */
  detail: string;
  /** «٩٥٪» أو فارغ. */
  score: string;
  /** «ممتاز» / «ناجح» / «إعادة» أو فارغ. */
  verdict: string;
  fail: boolean;
}

interface DayView {
  date: string;
  weekday: string;
  status: string;
  items: DayItem[];
  /** نصّ بديل حين لا نشاط — «لم يسمّع»، «غائب»، أو ملاحظة المعلّم. */
  placeholder: string;
  gap: boolean;
}

@Component({
  selector: 'app-student-report-card',
  template: `
    @for (page of pages(); track page.no) {
      <div class="rx-page">
        <div class="sc-header">
          <div class="sc-title">{{ timeline().name }}</div>
          <div class="sc-period">{{ periodText() }}</div>
          @if (teacherName()) {
            <div class="sc-teacher">المعلّم: {{ teacherName() }}</div>
          }
        </div>

        <div class="sc-body">
          @if (page.no === 1) {
            <div class="sc-stats">
              @for (s of stats(); track s.label) {
                <div class="sc-stat">
                  <div class="sc-num">{{ s.value }}</div>
                  <div class="sc-lbl">{{ s.label }}</div>
                </div>
              }
            </div>
          }

          @if (page.days.length === 0) {
            <p class="sc-empty">
              {{
                audience() === 'parents'
                  ? 'لا إنجاز مسجَّل في هذه الفترة.'
                  : 'لا سجلّات في هذه الفترة.'
              }}
            </p>
          } @else {
            <div class="sc-block">
              <div class="sc-block-head">السِجلّ اليوميّ</div>
              <table class="sc-table">
                <thead>
                  <tr>
                    <th class="w-day">اليوم</th>
                    <th class="w-status">الحالة</th>
                    <th class="w-kind">النشاط</th>
                    <th class="w-detail">التفصيل</th>
                    <th class="w-score">الدرجة</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of page.days; track d.date) {
                    @if (d.items.length === 0) {
                      <tr>
                        <td class="w-day">
                          <span class="d-wd">{{ d.weekday }}</span>
                          <span class="d-date">{{ dmy(d.date) }}</span>
                        </td>
                        <td class="w-status">{{ d.status }}</td>
                        <td class="c-none" colspan="3" [class.is-gap]="d.gap">
                          {{ d.placeholder }}
                        </td>
                      </tr>
                    } @else {
                      @for (it of d.items; track $index) {
                        <tr [class.row-first]="$first">
                          @if ($first) {
                            <td class="w-day" [attr.rowspan]="d.items.length">
                              <span class="d-wd">{{ d.weekday }}</span>
                              <span class="d-date">{{ dmy(d.date) }}</span>
                            </td>
                            <td class="w-status" [attr.rowspan]="d.items.length">
                              {{ d.status }}
                            </td>
                          }
                          <td class="w-kind">{{ it.kind }}</td>
                          <td class="w-detail">{{ it.detail }}</td>
                          <td class="w-score" [class.is-fail]="it.fail">
                            <span class="s-num">{{ it.score }}</span>
                            @if (it.verdict) {
                              <span class="s-verdict">{{ it.verdict }}</span>
                            }
                          </td>
                        </tr>
                      }
                    }
                  }
                </tbody>
              </table>
            </div>
          }

          @if (page.no === page.total) {
            @if (sardRows().length > 0) {
              <div class="sc-block">
                <div class="sc-block-head">السرد</div>
                <table class="sc-table">
                  <thead>
                    <tr>
                      <th class="w-day">التاريخ</th>
                      <th>النوع</th>
                      <th>الجزء</th>
                      <th>الدورة</th>
                      <th class="w-score">الدرجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of sardRows(); track r.id) {
                      <tr>
                        <td class="w-day">{{ dmy(r.date) }}</td>
                        <td>{{ r.scope }}</td>
                        <td>{{ r.juz }}</td>
                        <td>{{ r.cycle }}</td>
                        <td class="w-score" [class.is-fail]="r.fail">
                          <span class="s-num">{{ r.score }}٪</span>
                          <span class="s-verdict">{{ r.verdict }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (examRows().length > 0) {
              <div class="sc-block">
                <div class="sc-block-head">اختبارات الأجزاء</div>
                <table class="sc-table">
                  <thead>
                    <tr>
                      <th class="w-day">التاريخ</th>
                      <th>النوع</th>
                      <th>الجزء</th>
                      <th>المحاولة</th>
                      <th class="w-score">الدرجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of examRows(); track r.id) {
                      <tr>
                        <td class="w-day">{{ dmy(r.date) }}</td>
                        <td>{{ r.scope }}</td>
                        <td>{{ r.juz }}</td>
                        <td>{{ r.attempt }}</td>
                        <td class="w-score" [class.is-fail]="r.fail">
                          <span class="s-num">{{ r.score }}٪</span>
                          <span class="s-verdict">{{ r.verdict }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (tajweedRows().length > 0) {
              <div class="sc-block">
                <div class="sc-block-head">اختبارات التجويد</div>
                <table class="sc-table">
                  <thead>
                    <tr>
                      <th class="w-day">التاريخ</th>
                      <th class="w-detail">الاختبار</th>
                      <th class="w-score">العلامة</th>
                      <th>التقدير</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of tajweedRows(); track r.id) {
                      <tr>
                        <td class="w-day">{{ dmy(r.date) }}</td>
                        <td class="w-detail">{{ r.name }}</td>
                        <td class="w-score" [class.is-fail]="r.fail">
                          <span class="s-num">{{ r.mark }}</span>
                        </td>
                        <td [class.is-fail]="r.fail">{{ r.verdict }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }

          @if (page.total > 1) {
            <div class="sc-pageno">صفحة {{ page.no }} من {{ page.total }}</div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .rx-page {
        width: 820px;
        background: #fff;
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', system-ui, sans-serif;
        direction: rtl;
        border-radius: 14px;
        overflow: hidden;
      }
      .sc-header {
        padding: 22px 26px 18px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .sc-title {
        font-size: 1.32rem;
        font-weight: 800;
        color: #fff;
        letter-spacing: -0.01em;
      }
      .sc-period {
        margin-top: 5px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .sc-teacher {
        margin-top: 3px;
        font-size: 0.82rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.78);
      }
      .sc-body {
        padding: 20px 22px 22px;
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 46 46'%3E%3Cg fill='none' stroke='%230d5c3f' stroke-width='1' opacity='0.05'%3E%3Cpath d='M23 3 L43 23 L23 43 L3 23 Z'/%3E%3Ccircle cx='23' cy='23' r='3.5'/%3E%3C/g%3E%3C/svg%3E");
        background-repeat: repeat;
      }

      /* ---- بطاقات الملخّص ---- */
      .sc-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 18px;
      }
      .sc-stat {
        padding: 13px 8px;
        border-radius: 12px;
        background: #f2f8f5;
        border: 1px solid #d3e5db;
        text-align: center;
      }
      .sc-num {
        font-size: 1.24rem;
        font-weight: 800;
        color: #0d5c3f;
        line-height: 1.2;
      }
      .sc-lbl {
        margin-top: 4px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #5b7a6b;
      }

      /* ---- كتلة (عنوان + جدول) ---- */
      .sc-block {
        margin-top: 18px;
        border: 1px solid #dde7e2;
        border-radius: 12px;
        overflow: hidden;
        background: #fff;
      }
      .sc-block:first-of-type {
        margin-top: 0;
      }
      .sc-block-head {
        padding: 9px 14px;
        background: #0d5c3f;
        color: #fff;
        font-size: 0.84rem;
        font-weight: 800;
      }

      /* ---- الجداول ---- */
      .sc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8rem;
      }
      .sc-table th {
        padding: 9px 10px;
        background: #f2f8f5;
        color: #0d5c3f;
        font-weight: 800;
        font-size: 0.74rem;
        text-align: center;
        border-bottom: 1px solid #cfe0d7;
      }
      .sc-table td {
        padding: 9px 10px;
        border-bottom: 1px solid #ecefed;
        text-align: center;
        vertical-align: middle;
        color: #22312b;
      }
      .sc-table tbody tr:last-child td {
        border-bottom: none;
      }
      /* خطّ فاصل أوضح بين الأيّام (لا بين أنشطة اليوم الواحد) */
      .sc-table tbody tr.row-first td {
        border-top: 1px solid #dde7e2;
      }
      .sc-table tbody tr.row-first:first-child td {
        border-top: none;
      }

      /* ---- أعمدة بعروض ثابتة: مصدر الاتّساق البصريّ ---- */
      .w-day {
        width: 96px;
        white-space: nowrap;
        text-align: start;
      }
      .w-status {
        width: 78px;
        white-space: nowrap;
        color: #5b7a6b;
        font-weight: 600;
      }
      .w-kind {
        width: 104px;
        white-space: nowrap;
        font-weight: 700;
      }
      .w-detail {
        text-align: start;
        color: #3d4a44;
      }
      .w-score {
        width: 112px;
        white-space: nowrap;
      }

      .d-wd {
        display: block;
        font-weight: 700;
        font-size: 0.78rem;
      }
      .d-date {
        display: block;
        font-size: 0.68rem;
        color: #8a9a92;
        margin-top: 1px;
      }

      .s-num {
        font-weight: 800;
        color: #0d5c3f;
      }
      .s-verdict {
        display: block;
        margin-top: 1px;
        font-size: 0.68rem;
        font-weight: 600;
        color: #7a8b82;
      }
      .is-fail .s-num,
      td.is-fail {
        color: #b3261e;
      }
      .is-fail .s-verdict {
        color: #c96a63;
      }

      .c-none {
        text-align: start;
        color: #8a9a92;
      }
      .c-none.is-gap {
        color: #b3261e;
        font-weight: 600;
      }

      .sc-empty {
        margin: 16px 0 0;
        padding: 18px;
        border-radius: 12px;
        background: #f7f9f8;
        border: 1px dashed #dde7e2;
        text-align: center;
        font-size: 0.86rem;
        color: #7a8b82;
      }
      .sc-pageno {
        margin-top: 16px;
        text-align: center;
        font-size: 0.76rem;
        font-weight: 700;
        color: #9aa8a1;
      }
    `,
  ],
})
export class StudentReportCardComponent {
  readonly timeline = input.required<StudentTimeline>();
  readonly teacherName = input<string>('');
  readonly audience = input<ReportAudience>('parents');

  readonly dmy = dmy;
  readonly periodText = computed(() => periodLabel(this.timeline().period));

  readonly stats = computed<{ value: string; label: string }[]>(() => {
    const tl = this.timeline();
    return [
      { value: tl.att.rate === null ? '—' : tl.att.rate + '٪', label: 'الحضور' },
      { value: String(tl.pages), label: 'وجه' },
      { value: String(tl.newPages), label: 'حفظ جديد' },
      { value: tl.avgScore === null ? '—' : tl.avgScore + '٪', label: 'متوسّط التسميع' },
    ];
  });

  /* ---------- السِجلّ اليوميّ ---------- */

  private viewOf(d: StudentDay): DayView {
    const items: DayItem[] = [];

    for (const r of d.recitations) {
      const s = scoreOf(r);
      items.push({
        kind: RECITATION_KIND_LABELS[r.kind],
        detail: `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah} · ${r.pages} وجه`,
        score: `${s}٪`,
        verdict: ratingLabel(s, r.rating),
        fail: s < 90,
      });
    }
    for (const s of d.serd) {
      items.push({
        kind: SERD_SCOPE_LABELS[s.scope] ?? 'سرد',
        detail: `الجزء ${s.juz}`,
        score: `${s.score}٪`,
        verdict: passLabel(s.score, SARD_PASS),
        fail: s.score < SARD_PASS,
      });
    }
    for (const e of d.exams) {
      items.push({
        kind: EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار',
        detail: `الجزء ${e.juz}`,
        score: `${e.score}٪`,
        verdict: passLabel(e.score, EXAM_PASS),
        fail: e.score < EXAM_PASS,
      });
    }

    return {
      date: d.date,
      weekday: weekdayAr(d.date),
      status: d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome],
      items,
      // للغائب يكفي عمود الحالة — تكرار «غائب» في خليّة النشاط حشو.
      placeholder:
        d.outcome === 'absent' || d.outcome === 'excused'
          ? (d.note ?? '')
          : d.note || DAY_OUTCOME_LABELS[d.outcome],
      gap: d.outcome === 'not_recited' || d.outcome === 'no_record',
    };
  }

  /** الأيّام المعروضة — تقرير الأهالي يعرض المُنجَز وحده. */
  private readonly visibleDays = computed<DayView[]>(() => {
    const tl = this.timeline();
    const days =
      this.audience() === 'parents'
        ? tl.days.filter((d) => d.recitations.length || d.serd.length || d.exams.length)
        : tl.days;
    return days.map((d) => this.viewOf(d));
  });

  /* ---------- جداول الأنشطة ---------- */

  readonly sardRows = computed(() =>
    this.timeline().serd.map((s) => ({
      id: s.id,
      date: s.date,
      scope: SERD_SCOPE_LABELS[s.scope] ?? 'سرد',
      juz: s.scope === 'block' ? (s.juzList ?? [s.juz]).join('، ') : String(s.juz),
      cycle: s.cycle,
      score: s.score,
      verdict: passLabel(s.score, SARD_PASS),
      fail: s.score < SARD_PASS,
    })),
  );

  readonly examRows = computed(() =>
    this.timeline().exams.map((e) => ({
      id: e.id,
      date: e.date,
      scope: EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار',
      juz: e.scope === 'block' ? (e.juzList ?? [e.juz]).join('، ') : String(e.juz),
      attempt: e.attempt,
      score: e.score,
      verdict: passLabel(e.score, EXAM_PASS),
      fail: e.score < EXAM_PASS,
    })),
  );

  readonly tajweedRows = computed(() =>
    this.timeline().tajweed.map((c) => ({
      id: c.examId,
      date: c.date,
      name: c.examName,
      mark: c.score === null ? `— / ${c.totalScore}` : `${c.score} / ${c.totalScore}`,
      verdict: c.verdict,
      fail: !c.passed,
    })),
  );

  /* ---------- الصفحات ---------- */

  readonly pages = computed(() => {
    const days = this.visibleDays();
    const total = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
    const out: { no: number; total: number; days: DayView[] }[] = [];
    for (let p = 0; p < total; p++) {
      out.push({ no: p + 1, total, days: days.slice(p * DAYS_PER_PAGE, (p + 1) * DAYS_PER_PAGE) });
    }
    return out;
  });
}
