import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService, today } from '../../core/data.service';
import { dmy, relativeDay, weekdayAr } from '../../core/format';
import { fmt12, fmtRange, sessionWindow, untilLabel } from '../../core/time';
import { SchedulerService } from '../../core/scheduler.service';
import {
  CIRCLE_TYPE_SINGULAR,
  SESSION_STATUS_LABELS,
  type CircleType,
  type Session,
} from '../../core/models';

/** بطاقة الحلقة المعروضة أعلى الرئيسية */
interface CircleCard {
  session: Session;
  circleId: string;
  circleName: string;
  type: CircleType | null;
  /** active = حلقة جارية الآن ضمن وقتها · upcoming = الحلقة القادمة */
  mode: 'active' | 'upcoming';
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="greet">
        <div class="grow">
          <p class="salam">السلام عليكم</p>
          <h1>أهلاً، {{ firstName() }} 👋</h1>
        </div>
        <div class="greet-actions">
          <button class="bell" type="button" routerLink="/schedule" aria-label="الحلقات المفتوحة">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            @if (openCount() > 0) {
              <span class="dot"></span>
            }
          </button>
          <button
            class="avatar-btn"
            type="button"
            routerLink="/profile"
            [attr.aria-label]="'حساب ' + firstName()"
          >
            {{ initials() }}
          </button>
        </div>
      </header>

      <!-- البانر العلوي: الحلقة الحالية أو القادمة -->
      @if (circleCard(); as card) {
        <a class="ops-card" [routerLink]="['/circle', card.circleId]">
          <p class="kicker" [class.live]="card.mode === 'active'">
            {{ card.mode === 'active' ? '● حلقة حالية الآن' : 'الحلقة القادمة' }} · {{ todayLabel }}
          </p>
          <div class="ops-circle">
            <span class="ops-circle-name">{{ card.circleName }}</span>
            @if (card.type) {
              <span class="ops-tag">{{ typeSingular[card.type] }}</span>
            }
          </div>
          <p class="ops-meta">
            ⏰ {{ fmtRange(card.session.fromTime, card.session.toTime) }}
            @if (cardHint()) {
              <br />{{ cardHint() }}
            }
          </p>
          <span class="ops-btn">
            {{ card.mode === 'active' ? 'دخول الحلقة الآن' : 'عرض تفاصيل الحلقة' }} ‹
          </span>
        </a>
      } @else {
        <section class="ops-card">
          <p class="kicker">{{ todayLabel }}</p>
          <p class="ops-meta" style="margin-bottom:0">لا توجد حلقات مجدولة اليوم.</p>
          <a class="ops-btn" routerLink="/circles" style="margin-top:14px">كل الحلقات ‹</a>
        </section>
      }

      <div class="stat-row">
        <div class="stat">
          <div class="num">{{ circles()?.length ?? 0 }} <span class="unit">حلقة</span></div>
          <div class="label">مسجّلة</div>
        </div>
        <div class="stat">
          <div class="num">{{ students()?.length ?? 0 }} <span class="unit">طالب</span></div>
          <div class="label">مسجّل</div>
        </div>
        <div class="stat">
          <div class="num">
            @if (todayRate() === null) {
              —
            } @else {
              {{ todayRate() }}<span class="unit">٪</span>
            }
          </div>
          <div class="label">حضور اليوم</div>
        </div>
      </div>

      <div class="section-title">إجراءات سريعة</div>
      <div class="qa-grid">
        <a class="qa" routerLink="/circles/new">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M12 6c-1.8-1.3-4.2-2-7-2v14c2.8 0 5.2.7 7 2 1.8-1.3 4.2-2 7-2V4c-2.8 0-5.2.7-7 2Z"
              />
              <path d="M12 6v14" />
            </svg>
          </span>
          <span class="qa-label">حلقة جديدة</span>
        </a>
        <a class="qa" routerLink="/students/new">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="9.5" cy="8" r="3.3" />
              <path d="M3.5 20c.9-3.3 3.3-4.8 6-4.8 1.3 0 2.5.3 3.5 1" />
              <path d="M17.5 14v6M14.5 17h6" />
            </svg>
          </span>
          <span class="qa-label">طالب جديد</span>
        </a>
        <a class="qa" routerLink="/circles">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
              <path d="M3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" />
            </svg>
          </span>
          <span class="qa-label">كل الحلقات</span>
        </a>
        <a class="qa" routerLink="/schedule">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4.5" width="18" height="16" rx="2" />
              <path d="M3 9.5h18M8 3v4M16 3v4" />
            </svg>
          </span>
          <span class="qa-label">الجدول</span>
        </a>
      </div>

      <div class="row-between section-title">
        <span>الحلقات القادمة</span>
        <a routerLink="/schedule">عرض الكل</a>
      </div>

      @if (upcoming() === undefined) {
        <div class="spinner"></div>
      } @else if (upcoming()!.length === 0) {
        <div class="empty">
          <span class="icon">🗓️</span>
          لا توجد حلقات قادمة مجدولة.
        </div>
      } @else {
        @for (s of upcoming(); track s.id) {
          <a class="list-item" [routerLink]="['/session', s.id]">
            <span class="avatar">{{ circleInitial(s.circleId) }}</span>
            <span class="grow">
              <span class="primary">{{ circleName(s.circleId) }}</span>
              <span class="secondary">{{ weekdayAr(s.date) }}{{ timeLabel(s) }}</span>
            </span>
            <span class="when">
              <span class="day">{{ relDay(s.date) }}</span>
              <span
                [class]="
                  'badge b-' +
                  (s.status === 'open' ? 'late' : s.status === 'scheduled' ? 'grade' : 'present')
                "
              >
                {{ statusLabels[s.status] }}
              </span>
            </span>
          </a>
        }
      }
    </div>
  `,
})
export class DashboardPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private auth = inject(AuthService);
  private scheduler = inject(SchedulerService);

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly typeSingular = CIRCLE_TYPE_SINGULAR;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmtRange = fmtRange;
  readonly todayLabel = `${weekdayAr(today())} · ${dmy(today())}`;

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);
  private readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly attendance = this.data.allAttendance(this.destroyRef);

  /** لحظة حيّة تُحدَّث كل ٣٠ ثانية لإعادة تقييم «حالية / قادمة». */
  private readonly now = signal(Date.now());

  constructor() {
    // جدولة تلقائية للحلقات القادمة عند تحميل قائمة الحلقات
    effect(() => {
      const cs = this.circles();
      if (cs?.length) void this.scheduler.sync(cs);
    });
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  readonly firstName = computed(
    () => (this.auth.teacher()?.name ?? 'أستاذ').trim().split(/\s+/)[0],
  );
  readonly initials = computed(() => {
    const parts = (this.auth.teacher()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return (
      parts
        .map((p) => p.charAt(0))
        .join('')
        .slice(0, 2) || 'م'
    ).toUpperCase();
  });

  readonly openCount = computed(
    () => this.sessions()?.filter((s) => s.status === 'open').length ?? 0,
  );

  private rate(rows: { status: string }[] | undefined): number | null {
    if (!rows || rows.length === 0) return null;
    const good = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((good / rows.length) * 100);
  }
  readonly todayRate = computed(() =>
    this.rate(this.attendance()?.filter((a) => a.date === today())),
  );

  /**
   * البطاقة الخضراء أعلى الرئيسية:
   *  ١) حلقة جارية الآن (وقتها الحاليّ ضمن نافذة الحلقة) — mode 'active'.
   *  ٢) وإلا أقرب حلقة قادمة اليوم — mode 'upcoming'.
   *  ٣) وإلا أقرب حلقة مجدولة في الأيام التالية — mode 'upcoming'.
   */
  readonly circleCard = computed<CircleCard | null>(() => {
    const all = this.sessions();
    const cs = this.circles();
    if (!all || !cs) return null;
    const t = today();
    const nowDate = new Date(this.now());
    const build = (s: Session, mode: 'active' | 'upcoming'): CircleCard => {
      const c = cs.find((x) => x.id === s.circleId);
      return {
        session: s,
        circleId: s.circleId,
        circleName: c?.name ?? 'الحلقة',
        type: c?.type ?? null,
        mode,
      };
    };

    const todaySessions = all
      .filter((s) => s.date === t && s.status !== 'closed')
      .sort((a, b) => (a.fromTime ?? '').localeCompare(b.fromTime ?? ''));

    const active = todaySessions.find((s) => sessionWindow(s, nowDate).state === 'now');
    if (active) return build(active, 'active');

    const next = todaySessions.find((s) => sessionWindow(s, nowDate).state === 'before');
    if (next) return build(next, 'upcoming');

    const future = all
      .filter((s) => s.status === 'scheduled' && s.date > t)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || (a.fromTime ?? '').localeCompare(b.fromTime ?? ''),
      )[0];
    return future ? build(future, 'upcoming') : null;
  });

  /** سطر توضيحيّ أسفل الوقت: «تنتهي الساعة …» أو «تبدأ بعد …». */
  readonly cardHint = computed(() => {
    const card = this.circleCard();
    if (!card) return '';
    const nowDate = new Date(this.now());
    const w = sessionWindow(card.session, nowDate);
    if (card.mode === 'active') {
      return w.closesAt ? `جارية الآن · تنتهي الساعة ${fmt12(card.session.toTime)}` : 'جارية الآن';
    }
    if (card.session.date !== today()) {
      return `${weekdayAr(card.session.date)} ${dmy(card.session.date)}`;
    }
    return w.opensAt ? `تبدأ ${untilLabel(w.opensAt, nowDate)}` : 'اليوم';
  });

  /** حلقات مفتوحة أو مجدولة اليوم فما بعد — مرتّبة تصاعديًّا، حتى ٣. */
  readonly upcoming = computed<Session[] | undefined>(() => {
    const all = this.sessions();
    if (all === undefined) return undefined;
    const t = today();
    return all
      .filter((s) => s.status === 'open' || s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt)
      .slice(0, 3);
  });

  private circle(id: string) {
    return this.circles()?.find((c) => c.id === id);
  }
  circleName(id: string): string {
    return this.circle(id)?.name ?? 'الحلقة';
  }
  circleInitial(id: string): string {
    return this.circleName(id).charAt(0);
  }
  timeLabel(s: Session): string {
    const r = fmtRange(s.fromTime, s.toTime);
    return r ? ' · ' + r : '';
  }

  relDay(date: string): string {
    return relativeDay(date, today());
  }
}
