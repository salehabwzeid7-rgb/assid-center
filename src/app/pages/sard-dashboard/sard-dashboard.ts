import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import {
  circleLabel,
  isHifzCircle,
  studentCircleIds,
  type Circle,
  type Student,
} from '../../core/models';
import { analyzeSard, type SardAnalysis } from '../../core/sard';
import { analyzeExam, type ExamAnalysis } from '../../core/exam';
import { PageHeaderComponent } from '../../shared/page-header';
import { ProgressRingComponent } from '../../shared/progress-ring';

interface Row {
  student: Student;
  circles: string;
  a: SardAnalysis;
  e: ExamAnalysis;
}

/**
 * لوحة «السرد والاختبار» — إحصائيات عامّة قابلة للطيّ في الأعلى تعرض السرد
 * والاختبار جنبًا إلى جنب، ثم قائمة بطلاب حلقات التحفيظ فقط (تُستثنى حلقات
 * التجويد) مع تقدّم كلٍّ من السرد والاختبار وحلقة تقدّم الجزء الجاري.
 *
 * الفرق الجوهريّ: السرد يتطلّب كتلة مجمّعة (٣ أجزاء) عند مرحلته النهائيّة،
 * أمّا الاختبار فمستقلّ تمامًا لكلّ جزء على حِدة.
 */
@Component({
  selector: 'app-sard-dashboard',
  imports: [RouterLink, PageHeaderComponent, ProgressRingComponent],
  template: `
    <app-page-header title="السرد والاختبار" [back]="false" />

    <div class="page">
      @if (
        students() === undefined ||
        serds() === undefined ||
        exams() === undefined ||
        circles() === undefined
      ) {
        <div class="spinner"></div>
      } @else {
        <!-- إحصائيات عامّة (قابلة للطيّ) — السرد والاختبار جنبًا إلى جنب -->
        <button class="stats-toggle" type="button" (click)="showStats.set(!showStats())">
          <span>📊 إحصائيات عامّة</span>
          <span class="chev">{{ showStats() ? '▲' : '▼' }}</span>
        </button>

        @if (showStats()) {
          <div class="card stats-card">
            <div class="grp-title"><span class="dot d-sard"></span> السرد</div>
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ sardCount('revised') }}</div>
                <div class="label">أتمّوا السرد</div>
              </div>
              <div class="stat">
                <div class="num">{{ sardCount('due') + sardCount('not_revised') }}</div>
                <div class="label">عليهم سرد</div>
              </div>
              <div class="stat">
                <div class="num">{{ sardNearCount() }}</div>
                <div class="label">قريبون من السرد</div>
              </div>
              <div class="stat">
                <div class="num">{{ totalRevisedJuz() }}</div>
                <div class="label">مجموع الأجزاء المسرودة</div>
              </div>
              <div class="stat">
                <div class="num">{{ totalBlocks() }}</div>
                <div class="label">كتل مُتقنة (٣ أجزاء)</div>
              </div>
              <div class="stat">
                <div class="num">{{ sardAvg() === null ? '—' : sardAvg() + '٪' }}</div>
                <div class="label">متوسّط درجات السرد</div>
              </div>
            </div>

            <div class="grp-title" style="margin-top:16px">
              <span class="dot d-exam"></span> الاختبار
            </div>
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ examCount('examined') }}</div>
                <div class="label">أتمّوا الاختبار</div>
              </div>
              <div class="stat">
                <div class="num">{{ examCount('due') + examCount('not_examined') }}</div>
                <div class="label">عليهم اختبار</div>
              </div>
              <div class="stat">
                <div class="num">{{ examNearCount() }}</div>
                <div class="label">قريبون من الاختبار</div>
              </div>
              <div class="stat">
                <div class="num">{{ totalExaminedJuz() }}</div>
                <div class="label">مجموع الأجزاء المُختبَرة</div>
              </div>
              <div class="stat">
                <div class="num">{{ totalPendingExams() }}</div>
                <div class="label">أجزاء تنتظر الاختبار</div>
              </div>
              <div class="stat">
                <div class="num">{{ examAvg() === null ? '—' : examAvg() + '٪' }}</div>
                <div class="label">متوسّط درجات الاختبار</div>
              </div>
            </div>

            <p class="muted" style="margin:12px 2px 0;font-size:.82rem">
              من إجمالي {{ hifzRows().length }} طالب في حلقات التحفيظ · عتبة النجاح ٩٠٪ · الاختبار
              مستقلّ لكلّ جزء بلا كتل
            </p>
          </div>
        }

        <!-- طلاب حلقات التحفيظ -->
        <div class="section-title">طلاب التحفيظ ({{ hifzRows().length }})</div>

        @if (hifzRows().length === 0) {
          <div class="empty">
            <span class="icon">📗</span>
            لا يوجد طلاب في حلقات تحفيظ بعد.
          </div>
        } @else {
          @for (r of hifzRows(); track r.student.id) {
            <div class="list-item srow">
              <app-progress-ring
                [size]="46"
                [value]="r.a.currentJuz ? r.a.currentJuz.fraction : r.a.completedJuz.length ? 1 : 0"
                [text]="ringText(r.a)"
              />
              <span class="grow">
                <span class="primary">{{ r.student.name }}</span>
                <span class="secondary">{{ r.circles }}</span>
                <span class="srow-data">
                  <span class="chip-j">{{ r.a.revisedJuz.length }} جزء مسرود</span>
                  <span class="chip-e">{{ r.e.examinedJuz.length }} جزء مُختبَر</span>
                  @if (r.a.currentJuz) {
                    <span class="chip-p">
                      الجزء {{ r.a.currentJuz.juz }} · {{ r.a.currentJuz.pages }}/20 صفحة
                    </span>
                  }
                </span>
                <span class="srow-data">
                  <span class="chip-st" [class]="'st-' + r.a.category"
                    >سرد: {{ sardStatus(r.a) }}</span
                  >
                  <span class="chip-st" [class]="'st-' + r.e.category"
                    >اختبار: {{ examStatus(r.e) }}</span
                  >
                </span>
              </span>
              <span class="srow-actions">
                <a class="btn btn-ghost" [routerLink]="['/student', r.student.id, 'serd']">سرد</a>
                <a class="btn btn-ghost" [routerLink]="['/student', r.student.id, 'exam']"
                  >اختبار</a
                >
              </span>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .stats-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        font-weight: 800;
        cursor: pointer;
      }
      .stats-toggle .chev {
        font-size: 0.7rem;
        color: var(--text-soft);
      }
      .stats-card {
        margin-top: 10px;
      }
      .grp-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-weight: 800;
        font-size: 0.92rem;
        margin-bottom: 8px;
      }
      .grp-title .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .grp-title .d-sard {
        background: var(--green);
      }
      .grp-title .d-exam {
        background: var(--gold-deep);
      }
      .srow {
        align-items: center;
        gap: 12px;
        cursor: default;
      }
      .srow-data {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 6px;
      }
      .srow-data span {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
      }
      .chip-j {
        background: var(--green-tint);
        color: var(--green);
      }
      .chip-e {
        background: var(--gold-tint2);
        color: var(--gold-deep);
      }
      .chip-p {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .chip-st.st-revised,
      .chip-st.st-examined {
        background: var(--ok-bg, #e7ede1);
        color: var(--ok, #3b6b4a);
      }
      .chip-st.st-due,
      .chip-st.st-not_revised,
      .chip-st.st-not_examined {
        background: var(--warn-bg, #f3e8d8);
        color: var(--warn, #a07030);
      }
      .chip-st.st-none {
        background: var(--surface-2);
        color: var(--text-soft);
      }
      .srow-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }
      .srow-actions .btn {
        padding: 5px 12px;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class SardDashboardPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);

  readonly students = this.data.allStudents(this.destroyRef);
  readonly circles = this.data.circles(this.destroyRef);
  readonly serds = this.data.allSerds(this.destroyRef);
  readonly exams = this.data.allExams(this.destroyRef);
  readonly showStats = signal(false);

  private readonly circleMap = computed(() => {
    const m = new Map<string, Circle>();
    for (const c of this.circles() ?? []) m.set(c.id, c);
    return m;
  });

  /** الطلاب في حلقات تحفيظ فقط (تُستثنى حلقات التجويد الخالصة). */
  readonly hifzRows = computed<Row[]>(() => {
    const serds = this.serds() ?? [];
    const exams = this.exams() ?? [];
    const cm = this.circleMap();
    return (this.students() ?? [])
      .filter((s) => s.active)
      .map((student) => {
        const cs = studentCircleIds(student)
          .map((id) => cm.get(id))
          .filter((c): c is Circle => !!c);
        return {
          student,
          cs,
          a: analyzeSard(student, serds),
          e: analyzeExam(student, exams),
        };
      })
      .filter(({ cs }) => cs.length === 0 || cs.some((c) => isHifzCircle(c)))
      .map(({ student, cs, a, e }) => ({
        student,
        circles: cs.map((c) => circleLabel(c)).join(' · ') || 'بلا حلقة',
        a,
        e,
      }))
      .sort(
        (x, y) =>
          y.a.pendingCount + y.e.pendingCount - (x.a.pendingCount + x.e.pendingCount) ||
          y.a.revisedJuz.length - x.a.revisedJuz.length ||
          x.student.name.localeCompare(y.student.name, 'ar'),
      );
  });

  // ---- إحصائيات السرد ----
  sardCount(cat: 'revised' | 'due' | 'not_revised'): number {
    return this.hifzRows().filter((r) => r.a.category === cat).length;
  }
  readonly sardNearCount = computed(
    () => this.hifzRows().filter((r) => r.a.nearJuz.length > 0).length,
  );
  readonly totalRevisedJuz = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.a.revisedJuz.length, 0),
  );
  readonly totalBlocks = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.a.doneBlocks.length, 0),
  );
  readonly sardAvg = computed<number | null>(() => avg(this.hifzRows().map((r) => r.a.avgScore)));

  // ---- إحصائيات الاختبار ----
  examCount(cat: 'examined' | 'due' | 'not_examined'): number {
    return this.hifzRows().filter((r) => r.e.category === cat).length;
  }
  readonly examNearCount = computed(
    () => this.hifzRows().filter((r) => r.e.nearJuz.length > 0).length,
  );
  readonly totalExaminedJuz = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.e.examinedJuz.length, 0),
  );
  readonly totalPendingExams = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.e.pendingCount, 0),
  );
  readonly examAvg = computed<number | null>(() => avg(this.hifzRows().map((r) => r.e.avgScore)));

  ringText(a: SardAnalysis): string {
    if (a.currentJuz) return `${a.currentJuz.pages}/20`;
    return a.completedJuz.length ? '✓' : '—';
  }
  sardStatus(a: SardAnalysis): string {
    if (a.category === 'revised') return 'مكتمل';
    if (a.category === 'not_revised') return 'لم يسرد';
    if (a.category === 'due') return `عليه ${a.pendingCount}`;
    return a.nearJuz.length ? 'قريب من جزء' : 'لم يبدأ';
  }
  examStatus(e: ExamAnalysis): string {
    if (e.category === 'examined') return 'مكتمل';
    if (e.category === 'not_examined') return 'لم يُختبر';
    if (e.category === 'due') return `عليه ${e.pendingCount}`;
    return e.nearJuz.length ? 'قريب من جزء' : 'لم يبدأ';
  }
}

/** متوسّط قائمة قد تحوي null — يتجاهل null، ويُرجع null إن كانت كلّها فارغة. */
function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v !== null);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}
