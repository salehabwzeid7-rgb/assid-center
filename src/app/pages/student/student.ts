import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ATTENDANCE_LABELS, CIRCLE_TYPE_SHORT, type Circle, type Student } from '../../core/models';
import { dmy } from '../../core/format';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * ملفّ الطالب — يعرض كلّ التفاصيل مباشرةً (المستوى، جوال ولي الأمر، المقرّر)
 * دون الحاجة لفتح شاشة فرعيّة. تسجيل التسميع والتقييم اليوميّ لا يتمّ من هنا،
 * بل من داخل الحلقة أو الجلسة النشطة فقط.
 */
@Component({
  selector: 'app-student',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="student()?.name || 'الطالب'" />

    <div class="page">
      @if (student() === null && loaded()) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الطالب.</div>
      } @else if (student(); as s) {
        <!-- بطاقة الهوية -->
        <div class="card">
          <div class="row-between">
            <div class="grow">
              <h2 style="font-size:1.15rem;margin:0">{{ s.name }}</h2>
              <div class="id-meta">
                <a
                  class="circle-chip"
                  [class.t-tajweed]="circle()?.type === 'tajweed'"
                  [routerLink]="['/circle', s.circleId]"
                >
                  {{ circle()?.name || 'حلقة محذوفة' }}
                  @if (circle()?.type) {
                    <span class="dot-sep">·</span> {{ typeShort[circle()!.type!] }}
                  }
                </a>
                @if (!s.active) {
                  <span class="off">غير نشط</span>
                }
              </div>
            </div>
            <a class="btn btn-ghost" [routerLink]="['/student', s.id, 'edit']">تعديل</a>
          </div>
        </div>

        <!-- التفاصيل الكاملة — تُعرض مباشرةً -->
        <div class="card details">
          <div class="det-row">
            <span class="k">المستوى / الصف</span>
            <span class="v">{{ s.level || '—' }}</span>
          </div>
          <div class="det-row">
            <span class="k">تاريخ الميلاد</span>
            <span class="v">{{ s.birthDate ? dmy(s.birthDate) : '—' }}</span>
          </div>
          <div class="det-row">
            <span class="k">جوال ولي الأمر</span>
            @if (s.guardianPhone) {
              <a class="v link" [href]="'tel:' + s.guardianPhone" dir="ltr">{{
                s.guardianPhone
              }}</a>
            } @else {
              <span class="v">—</span>
            }
          </div>
          <div class="det-row col">
            <span class="k">المقرّر الحالي</span>
            <span class="v plan">{{ s.currentPlan || '—' }}</span>
          </div>
        </div>

        <!-- مؤشّرات موجزة -->
        <div class="stat-grid">
          <div class="stat">
            <div class="num">{{ recitationsCount() }}</div>
            <div class="label">جلسات تسميع</div>
          </div>
          <div class="stat">
            <div class="num">{{ totalPages() }}</div>
            <div class="label">مجموع الأوجه</div>
          </div>
          <div class="stat">
            <div class="num">{{ presentRate() }}٪</div>
            <div class="label">نسبة الحضور</div>
          </div>
          <div class="stat">
            <div class="num">{{ sessionsCount() }}</div>
            <div class="label">أيام مسجّلة</div>
          </div>
        </div>

        <p class="hint" style="margin:12px 2px 4px">
          يُسجَّل التسميع والتقييم اليوميّ من داخل جلسة الحلقة النشطة.
        </p>

        <!-- سجلّ الحضور -->
        <div class="section-title">سجلّ الحضور</div>
        <div class="card" style="display:flex;gap:14px;flex-wrap:wrap">
          <span
            >حاضر: <b>{{ attCount('present') }}</b></span
          >
          <span
            >متأخر: <b>{{ attCount('late') }}</b></span
          >
          <span
            >مأذون: <b>{{ attCount('excused') }}</b></span
          >
          <span
            >غائب: <b>{{ attCount('absent') }}</b></span
          >
        </div>
        @if (attendance() === undefined) {
          <div class="spinner"></div>
        } @else if (attendance()!.length === 0) {
          <div class="empty"><span class="icon">📋</span> لا يوجد سجل حضور بعد.</div>
        } @else {
          @for (a of attendance(); track a.id) {
            <div class="list-item" style="cursor:default">
              <span class="grow"
                ><span class="primary">{{ dmy(a.date) }}</span></span
              >
              <span [class]="'badge b-' + a.status">{{ attLabels[a.status] }}</span>
            </div>
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: [
    `
      .id-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .circle-chip {
        font-weight: 700;
        font-size: 0.8rem;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--green-tint);
        color: var(--green);
      }
      .circle-chip.t-tajweed {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .dot-sep {
        opacity: 0.6;
      }
      .off {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--danger);
      }
      .details {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-top: 10px;
        padding: 4px 16px;
      }
      .det-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 0;
        border-bottom: 1px solid var(--border);
      }
      .det-row:last-child {
        border-bottom: 0;
      }
      .det-row.col {
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
      }
      .det-row .k {
        color: var(--text-soft);
        font-size: 0.85rem;
      }
      .det-row .v {
        font-weight: 700;
      }
      .det-row .v.link {
        color: var(--green);
      }
      .det-row .v.plan {
        font-weight: 400;
        line-height: 1.7;
      }
    `,
  ],
})
export class StudentPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly student = signal<Student | null>(null);
  readonly loaded = signal(false);
  readonly circle = signal<Circle | null>(null);

  readonly typeShort = CIRCLE_TYPE_SHORT;
  readonly attLabels = ATTENDANCE_LABELS;
  readonly dmy = dmy;

  private readonly recitations = this.data.studentRecitations(this.id, this.destroyRef);
  readonly attendance = this.data.studentAttendance(this.id, this.destroyRef);

  readonly recitationsCount = computed(() => this.recitations()?.length ?? 0);
  readonly totalPages = computed(() => {
    const sum = (this.recitations() ?? []).reduce((t, r) => t + (Number(r.pages) || 0), 0);
    return Math.round(sum * 10) / 10;
  });
  readonly sessionsCount = computed(() => this.attendance()?.length ?? 0);
  readonly presentRate = computed(() => {
    const list = this.attendance() ?? [];
    if (list.length === 0) return 0;
    const ok = list.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((ok / list.length) * 100);
  });

  async ngOnInit(): Promise<void> {
    const s = await this.data.getStudent(this.id);
    this.student.set(s);
    this.loaded.set(true);
    if (s) this.circle.set(await this.data.getCircle(s.circleId));
  }

  attCount(status: string): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }
}
