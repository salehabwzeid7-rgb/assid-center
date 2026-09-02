import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataService } from '../../core/data.service';
import {
  GRADE_LABELS,
  GRADE_ORDER,
  GRADE_VALUE,
  gradeFromValue,
  type Circle,
  type Grade,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle-stats',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header [title]="'إحصائيات ' + (circle()?.name || 'الحلقة')" />

    <div class="page">
      @if (loading()) {
        <div class="spinner"></div>
      } @else {
        <div class="stat-grid">
          <div class="stat">
            <div class="num">{{ sessionCount() }}</div>
            <div class="label">عدد الجلسات</div>
          </div>
          <div class="stat">
            <div class="num">{{ studentCount() }}</div>
            <div class="label">عدد الطلاب</div>
          </div>
          <div class="stat">
            <div class="num">{{ attendanceRate() }}٪</div>
            <div class="label">نسبة الحضور العامة</div>
          </div>
          <div class="stat">
            <div class="num">{{ recitationCount() }}</div>
            <div class="label">جلسات تسميع</div>
          </div>
          <div class="stat">
            <div class="num">{{ totalPages() }}</div>
            <div class="label">مجموع الأوجه المسمَّعة</div>
          </div>
          <div class="stat">
            <div class="num">{{ avgGrade() }}</div>
            <div class="label">متوسط التقدير</div>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="section-title" style="margin:0 0 8px">توزيع تقديرات التسميع</div>
          @for (g of gradeOrder; track g) {
            <div style="display:flex;align-items:center;gap:8px;margin:5px 0">
              <span style="width:64px;font-size:.85rem">{{ gradeLabels[g] }}</span>
              <span class="bar"><i [style.width.%]="gradePct(g)"></i></span>
              <span class="muted" style="font-size:.8rem">{{ gradeCount(g) }}</span>
            </div>
          }
          @if (recitationCount() === 0) {
            <p class="muted" style="margin:0">لا توجد سجلات تسميع بعد.</p>
          }
        </div>

        <div class="section-title">حسب الطالب</div>
        @if (perStudent().length === 0) {
          <div class="empty"><span class="icon">👤</span> لا يوجد طلاب.</div>
        } @else {
          @for (row of perStudent(); track row.id) {
            <div class="list-item" style="cursor:default">
              <span class="avatar">{{ row.name.charAt(0) }}</span>
              <span class="grow">
                <span class="primary">{{ row.name }}</span>
                <span class="secondary">
                  حضور {{ row.rate }}٪ · تسميع {{ row.recites }} · {{ row.pages }} وجه
                </span>
              </span>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .bar {
        flex: 1;
        height: 10px;
        background: var(--surface-2);
        border-radius: 6px;
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        background: var(--green);
        border-radius: 6px;
      }
    `,
  ],
})
export class CircleStatsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);

  readonly gradeLabels = GRADE_LABELS;
  readonly gradeOrder = GRADE_ORDER;

  private readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  private readonly sessions = this.data.sessionsByCircle(this.id, this.destroyRef);
  private readonly attendance = this.data.circleAttendance(this.id, this.destroyRef);
  private readonly recitations = this.data.circleRecitations(this.id, this.destroyRef);

  readonly loading = computed(
    () =>
      this.students() === undefined ||
      this.sessions() === undefined ||
      this.attendance() === undefined ||
      this.recitations() === undefined,
  );

  readonly sessionCount = computed(() => this.sessions()?.length ?? 0);
  readonly studentCount = computed(() => this.students()?.filter((s) => s.active).length ?? 0);
  readonly recitationCount = computed(() => this.recitations()?.length ?? 0);
  readonly totalPages = computed(() => {
    const sum = (this.recitations() ?? []).reduce((t, r) => t + (Number(r.pages) || 0), 0);
    return Math.round(sum * 10) / 10;
  });
  readonly attendanceRate = computed(() => {
    const list = this.attendance() ?? [];
    if (!list.length) return 0;
    const ok = list.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((ok / list.length) * 100);
  });
  readonly avgGrade = computed(() => {
    const list = this.recitations() ?? [];
    if (!list.length) return '—';
    const avg = list.reduce((t, r) => t + GRADE_VALUE[r.grade], 0) / list.length;
    return GRADE_LABELS[gradeFromValue(avg)];
  });

  gradeCount(g: Grade): number {
    return this.recitations()?.filter((r) => r.grade === g).length ?? 0;
  }
  gradePct(g: Grade): number {
    const n = this.recitationCount();
    return n ? (this.gradeCount(g) / n) * 100 : 0;
  }

  readonly perStudent = computed(() => {
    const students = this.students() ?? [];
    const att = this.attendance() ?? [];
    const rec = this.recitations() ?? [];
    return students
      .filter((s) => s.active)
      .map((s) => {
        const mine = att.filter((a) => a.studentId === s.id);
        const ok = mine.filter((a) => a.status === 'present' || a.status === 'late').length;
        const myRec = rec.filter((r) => r.studentId === s.id);
        const pages = myRec.reduce((t, r) => t + (Number(r.pages) || 0), 0);
        return {
          id: s.id,
          name: s.name,
          rate: mine.length ? Math.round((ok / mine.length) * 100) : 0,
          recites: myRec.length,
          pages: Math.round(pages * 10) / 10,
        };
      })
      .sort((a, b) => b.rate - a.rate || b.pages - a.pages);
  });

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.id));
  }
}
