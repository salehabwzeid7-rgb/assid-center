import { Component, computed, input } from '@angular/core';
import type { PdfCell, PdfColumn, PdfDoc, PdfSection } from '../core/report-pdf';

/* ==========================================================================
   بطاقة التقرير المصوَّرة — تُرسَم من **نموذج المستند نفسه** (`PdfDoc`) الذي يُبنى منه PDF.

   لهذا السبب تتطابق الصورة وPDF حرفيًّا في كلّ تركيبة من محتوى التقرير (حضور، تسميع، أوجه،
   سرد، اختبارات، مقرر، إنذارات) وكلّ موضوع (حلقة، حلقات، طلّاب): لا بطاقة لكلّ نوع تقرير
   تتعفّن على حدة، وأيّ عمود يضيفه الباني يظهر هنا تلقائيًّا.

   كلّ عنصر `.rx-page` يصير صورةً مستقلّة يلتقطها `app-report-export`. التقسيم على صفحات
   بوحدات: كلّ قسم له كلفة، والجداول الطويلة تُقسَّم على صفحات تكرّر ترويسة الجدول، ولا
   يبقى عنوان وحيدًا في آخر الصفحة.

   الألوان ثابتة عمدًا (أخضر داكن على أبيض) ولا تتبع سمة التطبيق — التقرير المُصدَّر يُشارَك
   خارج التطبيق فيجب أن يبدو واحدًا لكلّ من يستلمه.
   ========================================================================== */

/** سعة الصفحة الواحدة بوحدات الكلفة أدناه. */
const PAGE_UNITS = 17;
const COST = { stats: 3.4, heading: 1.7, note: 1.6, title: 1.6, head: 1.5, row: 1, wideRow: 1.55 };

type StatItem = { label: string; value: string };

interface TableSlice {
  title: string;
  continued: boolean;
  columns: PdfColumn[];
  widths: number[];
  rows: PdfCell[][];
}

type Block =
  | { kind: 'stats'; items: StatItem[] }
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string; danger: boolean }
  | ({ kind: 'table' } & TableSlice);

interface CardPage {
  no: number;
  total: number;
  blocks: Block[];
}

/** صفّ فيه نصّ طويل يلتفّ على سطرين فيحتاج ارتفاعًا أكبر. */
const rowCost = (cells: readonly PdfCell[]): number =>
  cells.some((c) => c.text.length > 38) ? COST.wideRow : COST.row;

const noteCost = (text: string): number => COST.note + Math.floor(text.length / 90) * 0.8;

/** أقلّ كلفة يحتاجها القسم ليبدأ في صفحة — لمنع بقاء عنوان وحيد في آخرها. */
function minCost(sec: PdfSection | undefined): number {
  if (!sec) return 0;
  switch (sec.kind) {
    case 'stats':
      return COST.stats;
    case 'note':
      return noteCost(sec.text);
    case 'table':
      return (sec.title ? COST.title : 0) + COST.head + (sec.rows[0] ? rowCost(sec.rows[0]) : 0);
    default:
      return 0;
  }
}

function paginate(sections: readonly PdfSection[]): Block[][] {
  const pages: Block[][] = [[]];
  let used = 0;
  const cur = () => pages[pages.length - 1];
  const newPage = () => {
    if (cur().length > 0) {
      pages.push([]);
      used = 0;
    }
  };
  const place = (cost: number, block: Block) => {
    if (used + cost > PAGE_UNITS && used > 0) newPage();
    cur().push(block);
    used += cost;
  };

  sections.forEach((sec, i) => {
    switch (sec.kind) {
      case 'pageBreak':
        newPage();
        break;
      case 'heading': {
        const need = COST.heading + minCost(sections[i + 1]);
        if (used + need > PAGE_UNITS && used > 0) newPage();
        place(COST.heading, { kind: 'heading', text: sec.text });
        break;
      }
      case 'stats':
        place(COST.stats, { kind: 'stats', items: sec.items });
        break;
      case 'note':
        place(noteCost(sec.text), { kind: 'note', text: sec.text, danger: !!sec.danger });
        break;
      case 'table': {
        const total = sec.columns.reduce((a, c) => a + c.weight, 0) || 1;
        const widths = sec.columns.map((c) => (c.weight / total) * 100);
        const overhead = (sec.title ? COST.title : 0) + COST.head;
        let from = 0;
        let first = true;
        while (first || from < sec.rows.length) {
          const firstCost = sec.rows[from] ? rowCost(sec.rows[from]) : 0;
          if (used + overhead + firstCost > PAGE_UNITS && used > 0) newPage();
          let acc = overhead;
          const slice: PdfCell[][] = [];
          while (from < sec.rows.length) {
            const c = rowCost(sec.rows[from]);
            if (slice.length > 0 && used + acc + c > PAGE_UNITS) break;
            slice.push(sec.rows[from]);
            acc += c;
            from++;
          }
          cur().push({
            kind: 'table',
            title: sec.title ?? '',
            continued: !first,
            columns: sec.columns,
            widths,
            rows: slice,
          });
          used += acc;
          first = false;
          if (from < sec.rows.length) newPage();
        }
        break;
      }
    }
  });

  return pages.filter((p, i) => p.length > 0 || i === 0);
}

@Component({
  selector: 'app-sections-report-card',
  template: `
    @for (page of pages(); track page.no) {
      <div class="rx-page">
        <div class="sr-header">
          <div class="sr-title">{{ doc().title }}</div>
          <div class="sr-period">{{ doc().subtitle }}</div>
          @if (doc().teacher) {
            <div class="sr-teacher">المعلّم: {{ doc().teacher }}</div>
          }
        </div>

        <div class="sr-body">
          @for (b of page.blocks; track $index) {
            @switch (b.kind) {
              @case ('stats') {
                <div class="sr-stats">
                  @for (s of b.items; track s.label) {
                    <div class="sr-stat">
                      <div class="sr-num">{{ s.value }}</div>
                      <div class="sr-lbl">{{ s.label }}</div>
                    </div>
                  }
                </div>
              }
              @case ('heading') {
                <div class="sr-heading">{{ b.text }}</div>
              }
              @case ('note') {
                <p class="sr-note" [class.is-danger]="b.danger">{{ b.text }}</p>
              }
              @case ('table') {
                @if (b.title) {
                  <div class="sr-block-head">
                    {{ b.title }}
                    @if (b.continued) {
                      <span class="sr-cont">(تتمّة)</span>
                    }
                  </div>
                }
                <table class="sr-table">
                  <colgroup>
                    @for (w of b.widths; track $index) {
                      <col [style.width.%]="w" />
                    }
                  </colgroup>
                  <thead>
                    <tr>
                      @for (c of b.columns; track $index) {
                        <th [class.al-start]="c.align === 'start'">{{ c.header }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of b.rows; track $index) {
                      <tr>
                        @for (cell of row; track $index) {
                          <td
                            [class.al-start]="b.columns[$index]?.align === 'start'"
                            [class.is-ltr]="(cell.dir ?? b.columns[$index]?.dir) === 'ltr'"
                            [class.is-bold]="cell.bold"
                            [class.is-danger]="cell.danger"
                            [class.is-strong]="cell.strong"
                          >
                            {{ cell.text }}
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          }

          @if (page.total > 1) {
            <div class="sr-pageno">صفحة {{ page.no }} من {{ page.total }}</div>
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
      .sr-header {
        padding: 22px 26px 18px;
        text-align: center;
        background: linear-gradient(135deg, #0d5c3f, #083f2b);
      }
      .sr-title {
        font-size: 1.3rem;
        font-weight: 800;
        color: #fff;
      }
      .sr-period {
        margin-top: 4px;
        font-size: 0.92rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      }
      .sr-teacher {
        margin-top: 4px;
        font-size: 0.84rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.82);
      }
      .sr-body {
        padding: 18px 22px 22px;
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46' viewBox='0 0 46 46'%3E%3Cg fill='none' stroke='%230d5c3f' stroke-width='1' opacity='0.06'%3E%3Cpath d='M23 3 L43 23 L23 43 L3 23 Z'/%3E%3Ccircle cx='23' cy='23' r='3.5'/%3E%3C/g%3E%3C/svg%3E");
        background-repeat: repeat;
      }
      .sr-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
        gap: 10px;
        margin-bottom: 16px;
      }
      .sr-stat {
        padding: 10px 6px;
        border-radius: 10px;
        background: #eaf3ee;
        border: 1px solid #cfe3d8;
        text-align: center;
      }
      .sr-num {
        font-size: 1.14rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .sr-lbl {
        margin-top: 2px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #4b6b5c;
      }
      .sr-heading {
        margin: 6px 0 10px;
        padding: 7px 12px;
        border-radius: 8px;
        background: #0d5c3f;
        color: #fff;
        font-size: 0.92rem;
        font-weight: 800;
      }
      .sr-block-head {
        margin: 14px 0 6px;
        font-size: 0.9rem;
        font-weight: 800;
        color: #0d5c3f;
      }
      .sr-cont {
        font-size: 0.72rem;
        font-weight: 600;
        color: #9aa8a1;
      }
      .sr-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 0.82rem;
        background: #fff;
      }
      .sr-table th {
        background: #eaf3ee;
        color: #0d5c3f;
        font-weight: 800;
        padding: 8px 5px;
        border-bottom: 2px solid #0d5c3f;
        font-size: 0.76rem;
      }
      .sr-table td {
        padding: 8px 5px;
        border-bottom: 1px solid #e5e0d3;
        text-align: center;
        vertical-align: middle;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .sr-table .al-start {
        text-align: start;
      }
      .sr-table td.is-ltr {
        direction: ltr;
        unicode-bidi: isolate;
      }
      .sr-table td.is-bold {
        font-weight: 700;
      }
      .sr-table td.is-strong {
        font-weight: 800;
        color: #0d5c3f;
      }
      .sr-table td.is-danger {
        font-weight: 700;
        color: #b3261e;
      }
      .sr-note {
        margin: 12px 0 0;
        padding: 9px 12px;
        border-radius: 10px;
        background: #f7f9f8;
        border: 1px dashed #dde7e2;
        text-align: center;
        font-size: 0.82rem;
        color: #7a8b82;
        line-height: 1.8;
      }
      .sr-note.is-danger {
        background: #fdf3f2;
        border: 1px solid #f0d4d1;
        color: #b3261e;
        font-weight: 700;
      }
      .sr-pageno {
        margin-top: 14px;
        text-align: center;
        font-size: 0.78rem;
        font-weight: 700;
        color: #9aa8a1;
      }
    `,
  ],
})
export class SectionsReportCardComponent {
  /** نموذج المستند — هو نفسه الذي يُبنى منه PDF. */
  readonly doc = input.required<PdfDoc>();

  readonly pages = computed<CardPage[]>(() => {
    const pages = paginate(this.doc().sections);
    return pages.map((blocks, i) => ({ no: i + 1, total: pages.length, blocks }));
  });
}
