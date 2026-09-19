import { Component, computed, input } from '@angular/core';
import { periodLabel } from '../core/report-period';
import type { HifzCircleReport, OverviewReport, TajweedCircleReport } from '../core/reports';

/* ==========================================================================
   بطاقة التقرير العامّ المصوَّرة — عدّة حلقات دفعةً واحدة.

   **صفحة مستقلّة لكلّ نوع حلقات.** الفصل هنا بصريّ كما هو بنيويّ في طبقة
   الحساب: جدول التحفيظ فيه أوجه ومتوسّط تسميع، وجدول التجويد فيه علامات خام
   واختبارات — ولا عمود مشترك بينهما غير الحضور. دمجهما في جدول واحد يُنتج
   أعمدة فارغة بنيويًّا يقرأها المستلم نقصًا في البيانات، وهي ليست كذلك.
   ========================================================================== */

/** أقصى عدد حلقات في الصفحة الواحدة. */
const ROWS_PER_PAGE = 14;

interface OverviewPage {
  no: number;
  total: number;
  kind: 'hifz' | 'tajweed';
  stats: { value: string; label: string }[];
  hifzRows: HifzCircleReport[];
  tajweedRows: TajweedCircleReport[];
}

@Component({
  selector: 'app-overview-report-card',
  template: `
    @for (page of pages(); track page.no) {
      <div class="rx-page">
        <div class="oc-header">
          <div class="oc-title">تقرير عامّ</div>
          <div class="oc-period">{{ periodText() }}</div>
          @if (teacherName()) {
            <div class="oc-teacher">المعلّم: {{ teacherName() }}</div>
          }
        </div>

        <div class="oc-body">
          <div class="oc-kind">
            {{ page.kind === 'hifz' ? 'حلقات التحفيظ' : 'حلقات التجويد' }}
          </div>

          <div class="oc-stats">
            @for (s of page.stats; track s.label) {
              <div class="oc-stat">
                <div class="oc-num">{{ s.value }}</div>
                <div class="oc-lbl">{{ s.label }}</div>
              </div>
            }
          </div>

          @if (page.kind === 'hifz') {
            <table class="oc-table">
              <thead>
                <tr>
                  <th class="c-name">الحلقة</th>
                  <th>طلّاب</th>
                  <th>جلسات</th>
                  <th>الحضور</th>
                  <th>الأوجه</th>
                  <th>المتوسّط</th>
                  <th>سرد/اختبار</th>
                </tr>
              </thead>
              <tbody>
                @for (c of page.hifzRows; track c.circleId) {
                  <tr>
                    <td class="c-name">{{ c.circleName }}</td>
                    <td>{{ c.studentCount }}</td>
                    <td>{{ c.heldCount }}</td>
                    <td>{{ c.att.rate === null ? '—' : c.att.rate + '٪' }}</td>
                    <td>{{ c.totalPages }}</td>
                    <td>{{ c.avgScore === null ? '—' : c.avgScore + '٪' }}</td>
                    <td>{{ c.sardCount }} / {{ c.examCount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <table class="oc-table">
              <thead>
                <tr>
                  <th class="c-name">الحلقة</th>
                  <th>طلّاب</th>
                  <th>جلسات</th>
                  <th>الحضور</th>
                  <th>اختبارات</th>
                  <th>المجموع</th>
                </tr>
              </thead>
              <tbody>
                @for (c of page.tajweedRows; track c.circleId) {
                  <tr>
                    <td class="c-name">{{ c.circleName }}</td>
                    <td>{{ c.studentCount }}</td>
                    <td>{{ c.heldCount }}</td>
                    <td>{{ c.att.rate === null ? '—' : c.att.rate + '٪' }}</td>
                    <td>{{ c.exams.length }}</td>
                    <td class="c-total">
                      {{ c.maxScore > 0 ? c.achieved + ' / ' + c.maxScore : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (page.total > 1) {
            <div class="oc-pageno">صفحة {{ page.no }} من {{ page.total }}</div>
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
      .oc-header {
        padding: 20px 24px 16px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .oc-title {
        font-size: 1.28rem;
        font-weight: 800;
        color: #fff;
      }
      .oc-period {
        margin-top: 4px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .oc-teacher {
        margin-top: 4px;
        font-size: 0.84rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.82);
      }
      .oc-body {
        padding: 16px 20px 20px;
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 46 46'%3E%3Cg fill='none' stroke='%230d5c3f' stroke-width='1' opacity='0.07'%3E%3Cpath d='M23 3 L43 23 L23 43 L3 23 Z'/%3E%3Ccircle cx='23' cy='23' r='3.5'/%3E%3C/g%3E%3C/svg%3E");
        background-repeat: repeat;
      }
      .oc-kind {
        margin-bottom: 12px;
        font-size: 0.94rem;
        font-weight: 800;
        color: #0d5c3f;
        text-align: center;
      }
      .oc-stats {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }
      .oc-stat {
        flex: 1;
        padding: 10px 6px;
        border-radius: 10px;
        background: #eaf3ee;
        border: 1px solid #cfe3d8;
        text-align: center;
      }
      .oc-num {
        font-size: 1.12rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .oc-lbl {
        margin-top: 2px;
        font-size: 0.7rem;
        font-weight: 700;
        color: #4b6b5c;
      }
      .oc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
        background: #fff;
      }
      .oc-table th {
        background: #eaf3ee;
        color: #0d5c3f;
        font-weight: 800;
        padding: 8px 5px;
        border-bottom: 2px solid #0d5c3f;
        font-size: 0.75rem;
      }
      .oc-table td {
        padding: 8px 5px;
        border-bottom: 1px solid #e5e0d3;
        text-align: center;
      }
      .oc-table .c-name {
        text-align: start;
        font-weight: 700;
      }
      .oc-table .c-total {
        font-weight: 800;
        color: #0d5c3f;
      }
      .oc-pageno {
        margin-top: 12px;
        text-align: center;
        font-size: 0.78rem;
        font-weight: 700;
        color: #9aa8a1;
      }
    `,
  ],
})
export class OverviewReportCardComponent {
  readonly overview = input.required<OverviewReport>();
  readonly teacherName = input<string>('');

  readonly periodText = computed(() => periodLabel(this.overview().period));

  readonly pages = computed<OverviewPage[]>(() => {
    const ov = this.overview();
    const out: OverviewPage[] = [];

    if (ov.hifz.length > 0) {
      const t = ov.hifzTotals;
      const stats = [
        { value: String(t.circles), label: 'حلقة' },
        { value: String(t.students), label: 'طالب' },
        { value: t.att.rate === null ? '—' : t.att.rate + '٪', label: 'الحضور' },
        { value: String(t.pages), label: 'وجه' },
        { value: t.avgScore === null ? '—' : t.avgScore + '٪', label: 'المتوسّط' },
      ];
      for (const rows of chunk(ov.hifz, ROWS_PER_PAGE)) {
        out.push({ no: 0, total: 0, kind: 'hifz', stats, hifzRows: rows, tajweedRows: [] });
      }
    }

    if (ov.tajweed.length > 0) {
      const t = ov.tajweedTotals;
      const stats = [
        { value: String(t.circles), label: 'حلقة' },
        { value: String(t.students), label: 'طالب' },
        { value: t.att.rate === null ? '—' : t.att.rate + '٪', label: 'الحضور' },
        { value: String(t.exams), label: 'اختبار' },
        { value: t.maxScore > 0 ? `${t.achieved} / ${t.maxScore}` : '—', label: 'المجموع' },
      ];
      for (const rows of chunk(ov.tajweed, ROWS_PER_PAGE)) {
        out.push({ no: 0, total: 0, kind: 'tajweed', stats, hifzRows: [], tajweedRows: rows });
      }
    }

    return out.map((p, i) => ({ ...p, no: i + 1, total: out.length }));
  });
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
