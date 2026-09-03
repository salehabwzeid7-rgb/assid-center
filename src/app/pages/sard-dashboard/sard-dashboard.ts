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
import { PageHeaderComponent } from '../../shared/page-header';
import { ProgressRingComponent } from '../../shared/progress-ring';

interface Row {
  student: Student;
  circles: string;
  a: SardAnalysis;
}

/**
 * لوحة «السرد» — إحصائيات عامّة قابلة للطيّ في الأعلى، ثم قائمة بطلاب حلقات
 * التحفيظ فقط (تُستثنى حلقات التجويد) مع عدد الأجزاء المسرودة وحلقة تقدّم
 * الجزء الجاري (الجزء = ٢٠ صفحة).
 */
@Component({
  selector: 'app-sard-dashboard',
  imports: [RouterLink, PageHeaderComponent, ProgressRingComponent],
  template: `
    <app-page-header title="السرد" [back]="false" />

    <div class="page">
      @if (students() === undefined || serds() === undefined || circles() === undefined) {
        <div class="spinner"></div>
      } @else {
        <!-- إحصائيات عامّة (قابلة للطيّ) -->
        <button class="stats-toggle" type="button" (click)="showStats.set(!showStats())">
          <span>📊 إحصائيات عامّة</span>
          <span class="chev">{{ showStats() ? '▲' : '▼' }}</span>
        </button>

        @if (showStats()) {
          <div class="card stats-card">
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ count('revised') }}</div>
                <div class="label">أتمّوا السرد</div>
              </div>
              <div class="stat">
                <div class="num">{{ count('due') + count('not_revised') }}</div>
                <div class="label">عليهم سرد</div>
              </div>
              <div class="stat">
                <div class="num">{{ nearCount() }}</div>
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
                <div class="num">{{ avgScore() === null ? '—' : avgScore() + '٪' }}</div>
                <div class="label">متوسّط درجات السرد</div>
              </div>
            </div>
            <p class="muted" style="margin:10px 2px 0;font-size:.82rem">
              من إجمالي {{ hifzRows().length }} طالب في حلقات التحفيظ · عتبة النجاح ٩٠٪
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
            <a class="list-item srow" [routerLink]="['/student', r.student.id, 'serd']">
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
                  @if (r.a.currentJuz) {
                    <span class="chip-p">
                      الجزء {{ r.a.currentJuz.juz }} · {{ r.a.currentJuz.pages }}/20 صفحة
                    </span>
                  }
                  <span class="chip-st" [class]="'st-' + r.a.category">{{ status(r.a) }}</span>
                </span>
              </span>
              <span class="chevron">‹</span>
            </a>
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
      .srow {
        align-items: center;
        gap: 12px;
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
      .chip-p {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .chip-st.st-revised {
        background: var(--ok-bg, #e7ede1);
        color: var(--ok, #3b6b4a);
      }
      .chip-st.st-due,
      .chip-st.st-not_revised {
        background: var(--warn-bg, #f3e8d8);
        color: var(--warn, #a07030);
      }
      .chip-st.st-none {
        background: var(--surface-2);
        color: var(--text-soft);
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
  readonly showStats = signal(false);

  private readonly circleMap = computed(() => {
    const m = new Map<string, Circle>();
    for (const c of this.circles() ?? []) m.set(c.id, c);
    return m;
  });

  /** الطلاب في حلقات تحفيظ فقط (تُستثنى حلقات التجويد الخالصة). */
  readonly hifzRows = computed<Row[]>(() => {
    const serds = this.serds() ?? [];
    const cm = this.circleMap();
    return (this.students() ?? [])
      .filter((s) => s.active)
      .map((student) => {
        const cs = studentCircleIds(student)
          .map((id) => cm.get(id))
          .filter((c): c is Circle => !!c);
        return { student, cs, a: analyzeSard(student, serds) };
      })
      .filter(({ cs }) => cs.length === 0 || cs.some((c) => isHifzCircle(c)))
      .map(({ student, cs, a }) => ({
        student,
        circles: cs.map((c) => circleLabel(c)).join(' · ') || 'بلا حلقة',
        a,
      }))
      .sort(
        (x, y) =>
          y.a.pendingCount - x.a.pendingCount ||
          y.a.revisedJuz.length - x.a.revisedJuz.length ||
          x.student.name.localeCompare(y.student.name, 'ar'),
      );
  });

  count(cat: 'revised' | 'due' | 'not_revised'): number {
    return this.hifzRows().filter((r) => r.a.category === cat).length;
  }
  readonly nearCount = computed(() => this.hifzRows().filter((r) => r.a.nearJuz.length > 0).length);
  readonly totalRevisedJuz = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.a.revisedJuz.length, 0),
  );
  readonly totalBlocks = computed(() =>
    this.hifzRows().reduce((t, r) => t + r.a.doneBlocks.length, 0),
  );
  readonly avgScore = computed<number | null>(() => {
    const vals = this.hifzRows()
      .map((r) => r.a.avgScore)
      .filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  ringText(a: SardAnalysis): string {
    if (a.currentJuz) return `${a.currentJuz.pages}/20`;
    return a.completedJuz.length ? '✓' : '—';
  }
  status(a: SardAnalysis): string {
    if (a.category === 'revised') return 'مكتمل';
    if (a.category === 'not_revised') return 'لم يسرد';
    if (a.category === 'due') return `عليه ${a.pendingCount} سرد`;
    return a.nearJuz.length ? 'قريب من جزء' : 'لم يبدأ';
  }
}
