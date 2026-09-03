import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { SARD_PASS, circleLabel, passLabel, type Circle, type Student } from '../../core/models';
import { analyzeSard, type SardAnalysis } from '../../core/sard';
import { PageHeaderComponent } from '../../shared/page-header';

interface Row {
  student: Student;
  circle: string;
  a: SardAnalysis;
}

/**
 * لوحة «السرد» — إدارة مراجعة الأجزاء المحفوظة لكلّ طلاب المركز،
 * موزّعة على أقسام: سردوا · لم يسردوا · عليهم سرد · قريبون من السرد.
 */
@Component({
  selector: 'app-sard-dashboard',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="السرد" [back]="false" />

    <div class="page">
      @if (students() === undefined || serds() === undefined) {
        <div class="spinner"></div>
      } @else {
        <!-- ملخّص علويّ -->
        <div class="stat-grid">
          <div class="stat">
            <div class="num">{{ byCat('revised').length }}</div>
            <div class="label">سردوا</div>
          </div>
          <div class="stat">
            <div class="num">{{ byCat('due').length + byCat('not_revised').length }}</div>
            <div class="label">عليهم سرد</div>
          </div>
          <div class="stat">
            <div class="num">{{ near().length }}</div>
            <div class="label">قريبون</div>
          </div>
        </div>

        @if (activeRows().length === 0 && near().length === 0) {
          <div class="empty">
            <span class="icon">📗</span>
            لا يوجد طلاب أكملوا حفظ جزء بعد. تظهر متابعة السرد هنا فور إكمال أوّل جزء.
          </div>
        }

        <!-- ١ · عليهم سرد (بدؤوا وبقي عليهم) -->
        @if (byCat('due').length) {
          <div class="section-title">طلاب عليهم سرد ({{ byCat('due').length }})</div>
          @for (r of byCat('due'); track r.student.id) {
            <a class="list-item due" [routerLink]="['/student', r.student.id, 'serd']">
              <span class="avatar">{{ r.a.pendingCount }}</span>
              <span class="grow">
                <span class="primary">{{ r.student.name }}</span>
                <span class="secondary">{{ r.circle }} · {{ subtitle(r) }}</span>
                <span class="tags">
                  @for (j of r.a.unrevisedJuz; track j) {
                    <span class="t warn">الجزء {{ j }}</span>
                  }
                  @for (b of r.a.readyBlocks; track b) {
                    <span class="t gold">سرد مجمّع {{ blockJuz(b) }}</span>
                  }
                </span>
              </span>
              @if (r.a.avgScore !== null) {
                <span
                  class="badge"
                  [class.b-present]="r.a.avgScore >= sardPass"
                  [class.b-absent]="r.a.avgScore < sardPass"
                  >{{ r.a.avgScore }}٪</span
                >
              }
            </a>
          }
        }

        <!-- ٢ · لم يسردوا (أكملوا جزءًا ولم يسجّلوا أيّ سرد) -->
        @if (byCat('not_revised').length) {
          <div class="section-title">
            الطلاب الذين لم يسردوا ({{ byCat('not_revised').length }})
          </div>
          @for (r of byCat('not_revised'); track r.student.id) {
            <a class="list-item warn-row" [routerLink]="['/student', r.student.id, 'serd']">
              <span class="avatar">{{ r.a.completedJuz.length }}</span>
              <span class="grow">
                <span class="primary">{{ r.student.name }}</span>
                <span class="secondary">
                  {{ r.circle }} · {{ r.a.completedJuz.length }} جزء مكتمل لم يُسرد
                </span>
              </span>
              <span class="chevron">‹</span>
            </a>
          }
        }

        <!-- ٣ · سردوا (لا معلّقات) -->
        @if (byCat('revised').length) {
          <div class="section-title">الطلاب الذين سردوا ({{ byCat('revised').length }})</div>
          @for (r of byCat('revised'); track r.student.id) {
            <a class="list-item ok" [routerLink]="['/student', r.student.id, 'serd']">
              <span class="avatar">✓</span>
              <span class="grow">
                <span class="primary">{{ r.student.name }}</span>
                <span class="secondary">
                  {{ r.circle }} · {{ r.a.revisedJuz.length }} جزء مسرود
                  @if (r.a.doneBlocks.length) {
                    · {{ r.a.doneBlocks.length }} كتلة مُتقنة
                  }
                </span>
                <span class="tags">
                  @for (j of r.a.revisedJuz; track j) {
                    <span class="t ok">{{ j }} · {{ r.a.juzLastScore.get(j) }}٪</span>
                  }
                </span>
              </span>
              @if (r.a.avgScore !== null) {
                <span
                  class="badge"
                  [class.b-present]="r.a.avgScore >= sardPass"
                  [class.b-absent]="r.a.avgScore < sardPass"
                  >{{ r.a.avgScore }}٪ · {{ verdict(r.a.avgScore) }}</span
                >
              }
            </a>
          }
        }

        <!-- ٤ · قريبون من السرد -->
        @if (near().length) {
          <div class="section-title">طلاب قريبون من السرد ({{ near().length }})</div>
          @for (r of near(); track r.student.id) {
            <a class="list-item near" [routerLink]="['/student', r.student.id, 'serd']">
              <span class="avatar">≈</span>
              <span class="grow">
                <span class="primary">{{ r.student.name }}</span>
                <span class="secondary">{{ r.circle }}</span>
                <span class="tags">
                  @for (n of r.a.nearJuz; track n.juz) {
                    <span class="t">الجزء {{ n.juz }} — {{ n.have }}/{{ n.total }}</span>
                  }
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
      .list-item {
        align-items: flex-start;
      }
      .list-item .avatar {
        margin-top: 2px;
      }
      .list-item.due {
        border-inline-start: 4px solid var(--warn, #a07030);
      }
      .list-item.warn-row {
        border-inline-start: 4px solid var(--danger);
      }
      .list-item.ok {
        border-inline-start: 4px solid var(--green);
      }
      .list-item.near {
        border-inline-start: 4px solid var(--gold);
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
      }
      .t {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--surface-2);
        color: var(--text-soft);
      }
      .t.warn {
        background: var(--warn-bg, #f3e8d8);
        color: var(--warn, #a07030);
      }
      .t.gold {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .t.ok {
        background: var(--green-tint);
        color: var(--green);
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
  readonly sardPass = SARD_PASS;

  private readonly circleMap = computed(() => {
    const m = new Map<string, Circle>();
    for (const c of this.circles() ?? []) m.set(c.id, c);
    return m;
  });

  readonly rows = computed<Row[]>(() => {
    const serds = this.serds() ?? [];
    return (this.students() ?? [])
      .filter((s) => s.active)
      .map((student) => ({
        student,
        circle: circleLabel(this.circleMap().get(student.circleId)),
        a: analyzeSard(student, serds),
      }))
      .sort(
        (x, y) =>
          y.a.pendingCount - x.a.pendingCount || x.student.name.localeCompare(y.student.name, 'ar'),
      );
  });

  /** كلّ الطلاب الذين لديهم جزء مكتمل (بأيّ تصنيف عدا 'none'). */
  readonly activeRows = computed(() => this.rows().filter((r) => r.a.category !== 'none'));

  byCat(cat: 'revised' | 'not_revised' | 'due'): Row[] {
    return this.rows().filter((r) => r.a.category === cat);
  }
  readonly near = computed(() => this.rows().filter((r) => r.a.nearJuz.length > 0));

  subtitle(r: Row): string {
    const parts: string[] = [];
    if (r.a.unrevisedJuz.length) parts.push(`${r.a.unrevisedJuz.length} جزء غير مسرود`);
    if (r.a.readyBlocks.length) parts.push(`${r.a.readyBlocks.length} سرد مجمّع مطلوب`);
    return parts.join(' · ') || 'مكتمل';
  }
  blockJuz(block: number): string {
    return `${block * 3 - 2}·${block * 3 - 1}·${block * 3}`;
  }
  verdict(score: number): string {
    return passLabel(score, SARD_PASS);
  }
}
