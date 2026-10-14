import { Component, computed, input } from '@angular/core';
import { periodLabel, type Period } from '../core/report-period';
import {
  COURSE_STATUS_LABELS,
  marksTitle,
  isMarksEmpty,
  warningText,
  type MarkRow,
  type MarksReport,
} from '../core/report-marks';

/* ==========================================================================
   بطاقة المقرر/الإنذار المصوَّرة — صفحات `.rx-page` يلتقطها `app-report-export`.

   الألوان ثابتة عمدًا كبقيّة بطاقات التقارير (تُشارَك خارج التطبيق فلا تتبع
   سمته). الإنذار و«لم ينهِ المقرر» بالأحمر، و«اجتاز» بالأخضر الداكن.

   التقسيم على صفحات بوحدات: عنوان الحلقة بوحدتين وكلّ صفّ بوحدة، فلا يُقطَع
   عنوان حلقة في آخر الصفحة وحده، ويتكرّر عند استكمال حلقة في صفحة تالية.
   ========================================================================== */

const UNITS_PER_PAGE = 16;
const HEAD_UNITS = 2;

interface PageBlock {
  circleTitle: string;
  continued: boolean;
  rows: { index: number; row: MarkRow }[];
}

interface MarksPage {
  no: number;
  total: number;
  blocks: PageBlock[];
}

@Component({
  selector: 'app-marks-report-card',
  template: `
    @for (page of pages(); track page.no) {
      <div class="rx-page">
        <div class="mk-header">
          <div class="mk-title">تقرير {{ title() }}</div>
          <div class="mk-period">{{ periodText() }}</div>
          @if (teacherName()) {
            <div class="mk-teacher">المعلّم: {{ teacherName() }}</div>
          }
        </div>

        <div class="mk-body">
          @if (page.no === 1 && stats().length > 0) {
            <div class="mk-stats">
              @for (s of stats(); track s.label) {
                <div class="mk-stat" [class.is-danger]="s.danger">
                  <div class="mk-num">{{ s.value }}</div>
                  <div class="mk-lbl">{{ s.label }}</div>
                </div>
              }
            </div>
          }

          @if (empty()) {
            <p class="mk-note">لا طلّاب معلَّمون.</p>
          }

          @for (b of page.blocks; track b.circleTitle + b.continued) {
            <div class="mk-circle">
              {{ b.circleTitle }}
              @if (b.continued) {
                <span class="mk-cont">(تتمّة)</span>
              }
            </div>
            <table class="mk-table">
              <thead>
                <tr>
                  <th class="c-idx">#</th>
                  <th class="c-name">اسم الطالب</th>
                  @if (report().showCourse) {
                    <th>المقرر</th>
                  }
                  @if (report().showWarnings) {
                    <th class="c-warn">الإنذار</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of b.rows; track r.row.studentId) {
                  <tr>
                    <td class="c-idx">{{ r.index }}</td>
                    <td class="c-name">{{ r.row.name }}</td>
                    @if (report().showCourse) {
                      <td
                        [class.c-passed]="r.row.course === 'passed'"
                        [class.c-fail]="r.row.course === 'incomplete'"
                      >
                        {{ r.row.course ? courseLabels[r.row.course] : '—' }}
                      </td>
                    }
                    @if (report().showWarnings) {
                      <td class="c-warn" [class.c-fail]="r.row.warning !== null">
                        {{ r.row.warning === null ? '' : warningText(r.row.warning) }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (page.total > 1) {
            <div class="mk-pageno">صفحة {{ page.no }} من {{ page.total }}</div>
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
      .mk-header {
        padding: 20px 24px 16px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .mk-title {
        font-size: 1.24rem;
        font-weight: 800;
        color: #fff;
      }
      .mk-period {
        margin-top: 4px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .mk-teacher {
        margin-top: 4px;
        font-size: 0.84rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.82);
      }
      .mk-body {
        padding: 16px 20px 20px;
        background: #fff;
      }
      .mk-stats {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }
      .mk-stat {
        flex: 1;
        padding: 10px 6px;
        border-radius: 10px;
        background: #eaf3ee;
        border: 1px solid #cfe3d8;
        text-align: center;
      }
      .mk-stat.is-danger {
        background: #fdf3f2;
        border-color: #f0d4d1;
      }
      .mk-num {
        font-size: 1.16rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .mk-stat.is-danger .mk-num,
      .mk-stat.is-danger .mk-lbl {
        color: #b3261e;
      }
      .mk-lbl {
        margin-top: 2px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #4b6b5c;
      }
      .mk-circle {
        margin: 14px 0 6px;
        font-size: 0.92rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .mk-circle:first-of-type {
        margin-top: 0;
      }
      .mk-cont {
        font-size: 0.72rem;
        font-weight: 600;
        color: #9aa8a1;
      }
      .mk-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.86rem;
        background: #fff;
      }
      .mk-table th {
        background: #eaf3ee;
        color: #0d5c3f;
        font-weight: 800;
        padding: 8px 6px;
        border-bottom: 2px solid #0d5c3f;
        font-size: 0.78rem;
      }
      .mk-table td {
        padding: 9px 6px;
        border-bottom: 1px solid #e5e0d3;
        text-align: center;
        vertical-align: middle;
      }
      .mk-table .c-idx {
        width: 32px;
        color: #7a8b82;
      }
      .mk-table .c-name {
        text-align: start;
        font-weight: 700;
      }
      .mk-table .c-warn {
        text-align: start;
      }
      .mk-table .c-passed {
        color: #0d5c3f;
        font-weight: 800;
      }
      .mk-table .c-fail {
        color: #b3261e;
        font-weight: 800;
      }
      .mk-note {
        margin: 12px 0 0;
        text-align: center;
        font-size: 0.86rem;
        color: #7a8b82;
      }
      .mk-pageno {
        margin-top: 14px;
        text-align: center;
        font-size: 0.78rem;
        font-weight: 700;
        color: #9aa8a1;
      }
    `,
  ],
})
export class MarksReportCardComponent {
  readonly report = input.required<MarksReport>();
  readonly period = input.required<Period>();
  readonly teacherName = input<string>('');

  readonly courseLabels = COURSE_STATUS_LABELS;
  readonly warningText = warningText;

  readonly title = computed(() => marksTitle(this.report()));
  readonly periodText = computed(() => periodLabel(this.period()));
  readonly empty = computed(() => isMarksEmpty(this.report()));

  readonly stats = computed<{ value: string; label: string; danger?: boolean }[]>(() => {
    const rep = this.report();
    if (isMarksEmpty(rep)) return [];
    const out: { value: string; label: string; danger?: boolean }[] = [];
    if (rep.showCourse) {
      out.push(
        { value: String(rep.courseCounts.passed), label: 'اجتاز المقرر' },
        { value: String(rep.courseCounts.completed), label: 'أنهى المقرر' },
        { value: String(rep.courseCounts.incomplete), label: 'لم ينهِ المقرر', danger: true },
      );
    }
    if (rep.showWarnings) {
      out.push({ value: String(rep.warnedCount), label: 'إنذار', danger: true });
    }
    return out;
  });

  readonly pages = computed<MarksPage[]>(() => {
    const rep = this.report();
    const raw: PageBlock[][] = [[]];
    let used = 0;
    for (const sec of rep.sections) {
      let block: PageBlock | null = null;
      for (const [i, row] of sec.rows.entries()) {
        const need = block ? 1 : HEAD_UNITS + 1;
        if (used + need > UNITS_PER_PAGE && used > 0) {
          raw.push([]);
          used = 0;
          block = null;
        }
        if (!block) {
          block = {
            circleTitle: sec.circleTitle,
            continued: i > 0,
            rows: [],
          };
          raw[raw.length - 1].push(block);
          used += HEAD_UNITS;
        }
        block.rows.push({ index: i + 1, row });
        used += 1;
      }
    }
    return raw.map((blocks, i) => ({ no: i + 1, total: raw.length, blocks }));
  });
}
