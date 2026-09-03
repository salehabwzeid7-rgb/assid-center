import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12, fmtRange, sessionWindow, untilLabel } from '../../core/time';
import {
  SESSION_STATUS_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  circleTypeLabel,
  type Circle,
  type Session,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle',
  imports: [RouterLink, PageHeaderComponent],
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
          @if (typeLabel(c)) {
            <span class="tag" [class.t-tajweed]="c.type === 'tajweed'"
              >حلقة {{ typeLabel(c) }}</span
            >
          }
          @if (c.weekdays?.length) {
            <span class="muted">{{ weekdaysLabel(c.weekdays!) }}</span>
          }
          @if (rangeLabel(c)) {
            <span class="muted">⏰ {{ rangeLabel(c) }}</span>
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
          @switch (cardState()) {
            @case ('open') {
              <p class="muted" style="margin:0 0 10px">
                الحصّة مفتوحة · الحضور {{ presentCount() }}/{{ studentTotal() }}
              </p>
              <button class="btn btn-primary btn-block btn-lg" type="button" (click)="go(ts.id)">
                متابعة حصّة اليوم ›
              </button>
            }
            @case ('closed') {
              <p class="muted" style="margin:0 0 10px">
                انتهت الحصّة · الحضور {{ presentCount() }}/{{ studentTotal() }}
              </p>
              <button class="btn btn-block btn-lg" type="button" (click)="go(ts.id)">
                مراجعة حصّة اليوم ›
              </button>
            }
            @case ('ready') {
              <button
                class="btn btn-primary btn-block btn-lg"
                type="button"
                [disabled]="studentTotal() === 0"
                (click)="go(ts.id)"
              >
                بدء حصّة اليوم ›
              </button>
            }
            @case ('before') {
              <div class="locked">
                <span class="lock-ico">🔒</span>
                <div>
                  <b>تُفتح الساعة {{ fmt12(ts.fromTime) }}</b>
                  <span class="muted">{{ untilOpen() }}</span>
                </div>
              </div>
              <button class="btn btn-block btn-lg" type="button" disabled>غير متاحة الآن</button>
            }
            @case ('after') {
              <div class="locked">
                <span class="lock-ico">⛔</span>
                <div>
                  <b>انتهى وقت حصّة اليوم</b>
                  <span class="muted">لبدء حصّة خارج موعدها، عدّل توقيت الحلقة من التعديل.</span>
                </div>
              </div>
              <button class="btn btn-block btn-lg" type="button" disabled>مُقفلة</button>
            }
          }
        } @else {
          <p class="muted" style="margin:0">لا توجد حصّة لهذه الحلقة اليوم.</p>
          @if (upcoming()[0]; as next) {
            <p class="muted" style="margin:6px 0 0">
              الحصّة القادمة: {{ weekdayAr(next.date) }} {{ dmy(next.date) }} ·
              {{ fmtRange(next.fromTime, next.toTime) }}
            </p>
          }
        }

        @if (studentTotal() === 0) {
          <p class="hint">أضف طلابًا إلى الحلقة أولًا لبدء حصّة.</p>
        }
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
              <span class="secondary">
                {{ weekdayAr(s.date) }}
                @if (fmtRange(s.fromTime, s.toTime)) {
                  · {{ fmtRange(s.fromTime, s.toTime) }}
                }
              </span>
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
      .locked {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        margin-bottom: 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface-2);
      }
      .locked > div {
        display: flex;
        flex-direction: column;
      }
      .lock-ico {
        font-size: 1.3rem;
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
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);
  readonly statusLabels = SESSION_STATUS_LABELS;
  typeLabel(c: Circle): string {
    return circleTypeLabel(c);
  }
  readonly todayIso = today();
  readonly todayLabel = dmy(this.todayIso);

  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmt12 = fmt12;
  readonly fmtRange = fmtRange;

  /** لحظة حيّة تتحدّث كل ٣٠ ثانية لفتح/إقفال الزرّ تلقائيًّا */
  private readonly now = signal(Date.now());

  readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  readonly sessions = this.data.sessionsByCircle(this.id, this.destroyRef);
  private readonly attendance = this.data.circleAttendance(this.id, this.destroyRef);
  private readonly recitations = this.data.circleRecitations(this.id, this.destroyRef);

  readonly studentTotal = computed(() => this.students()?.filter((s) => s.active).length ?? 0);
  readonly todaySession = computed(
    () => this.sessions()?.find((s) => s.date === this.todayIso) ?? null,
  );
  readonly presentCount = computed(() => {
    const sid = this.todaySession()?.id;
    return sid ? this.countPresent(sid) : 0;
  });

  private readonly todayWindow = computed(() => {
    const ts = this.todaySession();
    return ts ? sessionWindow(ts, new Date(this.now())) : null;
  });

  /** الحالة المعروضة في بطاقة «حصّة اليوم» */
  readonly cardState = computed<'open' | 'closed' | 'ready' | 'before' | 'after'>(() => {
    const ts = this.todaySession();
    if (!ts) return 'ready';
    if (ts.status === 'open') return 'open';
    if (ts.status === 'closed') return 'closed';
    const w = this.todayWindow();
    if (!w || w.state === 'unscheduled' || w.state === 'now') return 'ready';
    return w.state; // 'before' | 'after'
  });

  readonly untilOpen = computed(() => {
    const w = this.todayWindow();
    return w?.opensAt ? untilLabel(w.opensAt, new Date(this.now())) : '';
  });

  readonly upcoming = computed<Session[]>(() =>
    (this.sessions() ?? [])
      .filter((s) => s.date > this.todayIso)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  readonly past = computed<Session[]>(() =>
    (this.sessions() ?? []).filter((s) => s.date < this.todayIso),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.id));
  }

  rangeLabel(c: Circle): string {
    return fmtRange(c.fromTime, c.toTime) || (c.time ? fmt12(c.time) : '');
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
}
