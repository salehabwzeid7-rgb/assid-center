import { Component, computed, input } from '@angular/core';
import { dmy, weekdayAr } from '../core/format';
import {
  ATTENDANCE_LABELS,
  EXAM_PASS,
  EXAM_SCOPE_LABELS,
  RECITATION_KIND_LABELS,
  SARD_PASS,
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

   الفرق بين الجمهورين هنا **في المحتوى لا في الصياغة فقط**:
     • للأهالي   — الأيّام المُنجَزة وحدها. قائمة غياب طويلة ليست تقريرًا يُرسَل
                   لوليّ أمر، وتقلب التقرير إلى لائحة اتّهام.
     • مرجعيّ    — كلّ يوم بما فيه الغياب وثغرات التسجيل، للأرشفة والمتابعة.
   ========================================================================== */

/** أقصى عدد أيّام في الصفحة الواحدة. */
const DAYS_PER_PAGE = 16;

interface DayView {
  date: string;
  weekday: string;
  status: string;
  detail: string;
  score: string;
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
            <p class="sc-note">
              {{
                audience() === 'parents'
                  ? 'لا إنجاز مسجَّل في هذه الفترة.'
                  : 'لا سجلّات في هذه الفترة.'
              }}
            </p>
          } @else {
            <table class="sc-table">
              <thead>
                <tr>
                  <th class="c-date">اليوم</th>
                  <th>الحالة</th>
                  <th class="c-detail">ما أُنجِز</th>
                  <th>الدرجة</th>
                </tr>
              </thead>
              <tbody>
                @for (d of page.days; track d.date) {
                  <tr>
                    <td class="c-date">
                      {{ d.weekday }}<span class="c-sub">{{ dmy(d.date) }}</span>
                    </td>
                    <!-- حالة الحضور تبقى بلا تلوين تحذيريّ: الطالب كان حاضرًا
                         فعلًا، والنقص في التسجيل أو التسميع لا في حضوره. التلوين
                         يقع على ما أُنجِز، وهو موضع الخلل الحقيقيّ. -->
                    <td>{{ d.status }}</td>
                    <td class="c-detail" [class.c-gap]="d.gap">{{ d.detail }}</td>
                    <td class="c-score">{{ d.score }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (page.no === page.total) {
            @if (sardLines().length > 0) {
              <div class="sc-sec">
                <div class="sc-sec-head">السرد</div>
                @for (l of sardLines(); track l) {
                  <div class="sc-line">{{ l }}</div>
                }
              </div>
            }
            @if (examLines().length > 0) {
              <div class="sc-sec">
                <div class="sc-sec-head">اختبارات الأجزاء</div>
                @for (l of examLines(); track l) {
                  <div class="sc-line">{{ l }}</div>
                }
              </div>
            }
            @if (tajweedLines().length > 0) {
              <div class="sc-sec">
                <div class="sc-sec-head">اختبارات التجويد</div>
                @for (l of tajweedLines(); track l) {
                  <div class="sc-line">{{ l }}</div>
                }
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
        width: 780px;
        background: #fff;
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', system-ui, sans-serif;
        direction: rtl;
        border-radius: 14px;
        overflow: hidden;
      }
      .sc-header {
        padding: 20px 24px 16px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .sc-title {
        font-size: 1.28rem;
        font-weight: 800;
        color: #fff;
      }
      .sc-period {
        margin-top: 4px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .sc-teacher {
        margin-top: 4px;
        font-size: 0.84rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.82);
      }
      .sc-body {
        padding: 16px 20px 20px;
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 46 46'%3E%3Cg fill='none' stroke='%230d5c3f' stroke-width='1' opacity='0.07'%3E%3Cpath d='M23 3 L43 23 L23 43 L3 23 Z'/%3E%3Ccircle cx='23' cy='23' r='3.5'/%3E%3C/g%3E%3C/svg%3E");
        background-repeat: repeat;
      }
      .sc-stats {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }
      .sc-stat {
        flex: 1;
        padding: 10px 6px;
        border-radius: 10px;
        background: #eaf3ee;
        border: 1px solid #cfe3d8;
        text-align: center;
      }
      .sc-num {
        font-size: 1.16rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .sc-lbl {
        margin-top: 2px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #4b6b5c;
      }
      .sc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8rem;
        background: #fff;
      }
      .sc-table th {
        background: #eaf3ee;
        color: #0d5c3f;
        font-weight: 800;
        padding: 8px 5px;
        border-bottom: 2px solid #0d5c3f;
        font-size: 0.75rem;
      }
      .sc-table td {
        padding: 7px 5px;
        border-bottom: 1px solid #e5e0d3;
        text-align: center;
        vertical-align: middle;
      }
      .sc-table .c-date {
        width: 90px;
        font-weight: 700;
        white-space: nowrap;
      }
      .sc-table .c-detail {
        text-align: start;
        font-size: 0.76rem;
      }
      .sc-table .c-score {
        font-weight: 800;
        white-space: nowrap;
      }
      .sc-table .c-gap {
        color: #b3261e;
        font-weight: 700;
      }
      .c-sub {
        display: block;
        font-size: 0.66rem;
        font-weight: 600;
        color: #7a8b82;
      }
      .sc-sec {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #f5f9f7;
        border: 1px solid #dceae3;
      }
      .sc-sec-head {
        font-size: 0.82rem;
        font-weight: 800;
        color: #0d5c3f;
        margin-bottom: 4px;
      }
      .sc-line {
        font-size: 0.78rem;
        line-height: 1.9;
        color: #33413a;
      }
      .sc-note {
        margin: 14px 0 0;
        text-align: center;
        font-size: 0.84rem;
        color: #7a8b82;
      }
      .sc-pageno {
        margin-top: 12px;
        text-align: center;
        font-size: 0.78rem;
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

  /** أيّام الطالب بعد الترشيح بحسب الجمهور — تقرير الأهالي يعرض المُنجَز وحده. */
  private readonly visibleDays = computed<DayView[]>(() => {
    const tl = this.timeline();
    const parents = this.audience() === 'parents';
    const days = parents
      ? tl.days.filter((d) => d.recitations.length || d.serd.length || d.exams.length)
      : tl.days;
    return days.map((d) => this.viewOf(d));
  });

  private viewOf(d: StudentDay): DayView {
    const parts: string[] = [];
    const scores: string[] = [];

    for (const r of d.recitations) {
      const range = `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`;
      const s = scoreOf(r);
      parts.push(`${RECITATION_KIND_LABELS[r.kind]} — ${r.pages} وجه (${range})`);
      scores.push(`${s}٪ ${ratingLabel(s, r.rating)}`);
    }
    for (const s of d.serd) {
      parts.push(`${SERD_LABEL(s.scope)} — الجزء ${s.juz}`);
      scores.push(`${s.score}٪ ${passLabel(s.score, SARD_PASS)}`);
    }
    for (const e of d.exams) {
      parts.push(`${EXAM_SCOPE_LABELS[e.scope ?? 'juz']} — الجزء ${e.juz}`);
      scores.push(`${e.score}٪ ${passLabel(e.score, EXAM_PASS)}`);
    }

    const noActivity = parts.length === 0;
    if (noActivity) parts.push(d.note || DAY_OUTCOME_LABELS[d.outcome]);
    else if (d.note) parts.push(`ملاحظة: ${d.note}`);

    return {
      date: d.date,
      weekday: weekdayAr(d.date),
      status: d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome],
      detail: parts.join(' · '),
      score: scores.join(' · ') || '—',
      gap: d.outcome === 'absent' || d.outcome === 'not_recited' || d.outcome === 'no_record',
    };
  }

  readonly sardLines = computed(() =>
    this.timeline().serd.map(
      (s) =>
        `• ${dmy(s.date)} — ${SERD_LABEL(s.scope)} الجزء ${s.juz}: ${s.score}٪ (${passLabel(s.score, SARD_PASS)})`,
    ),
  );

  readonly examLines = computed(() =>
    this.timeline().exams.map(
      (e) =>
        `• ${dmy(e.date)} — ${EXAM_SCOPE_LABELS[e.scope ?? 'juz']} الجزء ${e.juz}: ${e.score}٪ (${passLabel(e.score, EXAM_PASS)})`,
    ),
  );

  readonly tajweedLines = computed(() =>
    this.timeline().tajweed.map(
      (c) =>
        `• ${dmy(c.date)} — ${c.examName}: ${c.score === null ? '—' : c.score} / ${c.totalScore} (${c.verdict})`,
    ),
  );

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

/** «سرد جزء» / «سرد مجمّع» — مختصرة للعرض داخل خليّة ضيّقة. */
function SERD_LABEL(scope: string): string {
  return scope === 'block' ? 'سرد مجمّع' : 'سرد';
}
