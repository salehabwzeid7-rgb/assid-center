import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { dmy, weekdayAr } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import {
  CIRCLE_TYPE_SINGULAR,
  SESSION_STATUS_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type Circle,
  type Session,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="circle()?.name || 'الحلقة'">
      <button
        actions
        class="icon-btn"
        type="button"
        [routerLink]="['/circle', id, 'edit']"
        aria-label="تعديل"
      >
        ✎
      </button>
    </app-page-header>

    <div class="page">
      @if (circle(); as c) {
        <div class="circle-meta">
          @if (c.type) {
            <span class="tag" [class.t-tajweed]="c.type === 'tajweed'">{{
              typeSingular[c.type]
            }}</span>
          }
          @if (c.weekdays?.length) {
            <span class="muted">{{ weekdaysLabel(c.weekdays!) }}</span>
          }
          @if (c.time) {
            <span class="muted">⏰ {{ c.time }}</span>
          }
          @if (!c.weekdays?.length && c.schedule) {
            <span class="muted">🕌 {{ c.schedule }}</span>
          }
        </div>
      }

      <!-- حصّة اليوم -->
      <div class="card">
        <div class="section-title" style="margin:0 0 10px">حصّة اليوم — {{ todayLabel }}</div>
        @if (todaySession(); as ts) {
          @if (ts.status === 'open') {
            <p class="muted" style="margin:0 0 10px">
              الحصّة مفتوحة · الحضور {{ presentCount() }}/{{ studentTotal() }}
            </p>
            <button class="btn btn-primary btn-block btn-lg" type="button" (click)="go(ts.id)">
              متابعة حصّة اليوم ›
            </button>
          } @else if (ts.status === 'scheduled') {
            <p class="muted" style="margin:0 0 10px">هذه الحصّة مجدولة لهذا اليوم.</p>
            <button
              class="btn btn-primary btn-block btn-lg"
              type="button"
              [disabled]="studentTotal() === 0"
              (click)="go(ts.id)"
            >
              بدء حصّة اليوم ›
            </button>
          } @else {
            <p class="muted" style="margin:0 0 10px">
              انتهت حصّة اليوم · الحضور {{ presentCount() }}/{{ studentTotal() }}
            </p>
            <button class="btn btn-block btn-lg" type="button" (click)="go(ts.id)">
              مراجعة حصّة اليوم ›
            </button>
          }
        } @else {
          <button
            class="btn btn-primary btn-block btn-lg"
            type="button"
            [disabled]="starting() || studentTotal() === 0"
            (click)="startToday()"
          >
            {{ starting() ? '…' : '＋ بدء حصّة اليوم' }}
          </button>
        }
        @if (studentTotal() === 0) {
          <p class="hint">أضف طلابًا إلى الحلقة أولًا لبدء حصّة.</p>
        }

        <details style="margin-top:10px">
          <summary class="muted" style="cursor:pointer;font-size:.86rem">
            بدء حصّة بتاريخ آخر
          </summary>
          <div class="field-row" style="margin-top:8px;align-items:end">
            <div class="field" style="margin:0">
              <input type="date" name="otherDate" [(ngModel)]="otherDate" [max]="todayIso" />
            </div>
            <button class="btn" type="button" [disabled]="starting()" (click)="startOther()">
              فتح
            </button>
          </div>
        </details>
      </div>

      <!-- بلاطات -->
      <div class="tiles" style="margin-top:12px">
        <a class="tile" [routerLink]="['/circle', id, 'students']">
          <span class="tile-num">{{ studentTotal() }}</span>
          <span class="tile-label">الطلاب</span>
        </a>
        <a class="tile" [routerLink]="['/circle', id, 'stats']">
          <span class="tile-ico">📊</span>
          <span class="tile-label">الإحصائيات</span>
        </a>
      </div>

      @if (upcoming().length) {
        <div class="section-title">الحصص القادمة</div>
        @for (s of upcoming(); track s.id) {
          <button class="list-item" type="button" (click)="go(s.id)">
            <span class="avatar">{{ dayNum(s.date) }}</span>
            <span class="grow">
              <span class="primary">{{ dmy(s.date) }}</span>
              <span class="secondary"
                >{{ weekdayAr(s.date) }}{{ s.time ? ' · ' + s.time : '' }}</span
              >
            </span>
            <span class="badge b-grade">{{ statusLabels[s.status] }}</span>
          </button>
        }
      }

      <div class="section-title">الحصص السابقة</div>
      @if (sessions() === undefined) {
        <div class="spinner"></div>
      } @else if (past().length === 0) {
        <div class="empty"><span class="icon">📅</span> لا توجد حصص سابقة بعد.</div>
      } @else {
        @for (s of past(); track s.id) {
          <button class="list-item" type="button" (click)="go(s.id)">
            <span class="avatar">{{ dayNum(s.date) }}</span>
            <span class="grow">
              <span class="primary">{{ dmy(s.date) }}</span>
              <span class="secondary">
                حضور {{ countPresent(s.id) }}/{{ studentTotal() }} · تسميع {{ countRecite(s.id) }}
              </span>
            </span>
            <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
              {{ statusLabels[s.status] }}
            </span>
          </button>
        }
      }
    </div>

    <button
      class="fab"
      type="button"
      [disabled]="starting() || studentTotal() === 0"
      (click)="startToday()"
    >
      ＋ حصّة
    </button>
  `,
  styles: [
    `
      .circle-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin: 2px 2px 12px;
        font-size: 0.85rem;
      }
      .tag {
        font-weight: 700;
        font-size: 0.78rem;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--green-tint);
        color: var(--green);
      }
      .tag.t-tajweed {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .tiles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 16px 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow);
        color: var(--text);
      }
      .tile-num {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--green);
      }
      .tile-ico {
        font-size: 1.5rem;
      }
      .tile-label {
        color: var(--text-soft);
        font-size: 0.85rem;
        font-weight: 700;
      }
    `,
  ],
})
export class CirclePage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);
  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly typeSingular = CIRCLE_TYPE_SINGULAR;
  readonly starting = signal(false);
  readonly todayIso = today();
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  otherDate = today();

  readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  readonly sessions = this.data.sessionsByCircle(this.id, this.destroyRef);
  private readonly attendance = this.data.circleAttendance(this.id, this.destroyRef);
  private readonly recitations = this.data.circleRecitations(this.id, this.destroyRef);

  readonly todayLabel = dmy(this.todayIso);
  readonly studentTotal = computed(() => this.students()?.filter((s) => s.active).length ?? 0);
  readonly todaySession = computed(
    () => this.sessions()?.find((s) => s.date === this.todayIso) ?? null,
  );
  readonly presentCount = computed(() => {
    const sid = this.todaySession()?.id;
    return sid ? this.countPresent(sid) : 0;
  });

  /** حصص قادمة (بعد اليوم) — تصاعديًّا */
  readonly upcoming = computed<Session[]>(() =>
    (this.sessions() ?? [])
      .filter((s) => s.date > this.todayIso)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  /** حصص سابقة (قبل اليوم) — القائمة مرتّبة تنازليًّا من الخدمة */
  readonly past = computed<Session[]>(() =>
    (this.sessions() ?? []).filter((s) => s.date < this.todayIso),
  );

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.id));
  }

  countPresent(sessionId: string): number {
    return (
      this.attendance()?.filter(
        (a) => a.sessionId === sessionId && (a.status === 'present' || a.status === 'late'),
      ).length ?? 0
    );
  }
  countRecite(sessionId: string): number {
    return this.recitations()?.filter((r) => r.sessionId === sessionId).length ?? 0;
  }
  dayNum(date: string): string {
    return date.slice(8, 10);
  }
  weekdaysLabel(days: number[]): string {
    return WEEKDAY_ORDER.filter((d) => days.includes(d))
      .map((d) => WEEKDAY_LABELS[d])
      .join('، ');
  }

  go(sessionId: string): void {
    void this.router.navigate(['/session', sessionId]);
  }

  async startToday(): Promise<void> {
    await this.start(this.todayIso);
  }
  async startOther(): Promise<void> {
    if (this.otherDate) await this.start(this.otherDate);
  }
  private async start(date: string): Promise<void> {
    if (this.studentTotal() === 0) return;
    this.starting.set(true);
    const sid = await this.notify.run(
      () => this.data.openSession(this.id, date, this.circle()?.time),
      { loading: 'جارٍ فتح الحصّة…', error: 'تعذّر فتح الحصّة' },
    );
    this.starting.set(false);
    if (sid) await this.router.navigate(['/session', sid]);
  }
}
