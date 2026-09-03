import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService, today } from '../../core/data.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12, sessionWindow, untilLabel } from '../../core/time';
import { SchedulerService } from '../../core/scheduler.service';
import { CIRCLE_TYPE_SINGULAR, type CircleType, type Session } from '../../core/models';

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

      <!-- البانر العلوي: الحلقة الجارية (عدّاد تنازليّ) أو الحلقة القادمة (تفاصيلها) -->
      @if (circleCard(); as card) {
        <a class="ops-card" [routerLink]="['/circle', card.circleId]">
          @if (card.mode === 'active') {
            <p class="kicker live">● حلقة جارية الآن · {{ todayLabel }}</p>
          } @else {
            <!-- ترويسة الحلقة القادمة: التصنيف يمينًا، ويوم الجدولة كشارة بارزة يسارًا -->
            <div class="ops-head">
              <span class="kicker">الحلقة القادمة</span>
              <span class="ops-daypill" [class.soon]="cardIsToday()">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4.5" width="18" height="16" rx="2" />
                  <path d="M3 9.5h18M8 3v4M16 3v4" />
                </svg>
                <span class="odp-day">{{
                  cardIsToday() ? 'اليوم' : weekdayAr(card.session.date)
                }}</span>
                @if (!cardIsToday()) {
                  <span class="odp-date">{{ dmy(card.session.date) }}</span>
                }
              </span>
            </div>
          }

          <div class="ops-circle">
            <span class="ops-circle-name">{{ card.circleName }}</span>
            @if (card.type) {
              <span class="ops-tag">{{ typeSingular[card.type] }}</span>
            }
          </div>

          @if (card.mode === 'active') {
            <!-- عدّاد تنازليّ حيّ حتى نهاية الحلقة -->
            <div class="ops-countdown">
              <span class="ocd-label">تنتهي بعد</span>
              <span class="ocd-time" aria-live="polite">{{ countdownLabel() }}</span>
              <span class="ocd-sub">
                من {{ fmt12(card.session.fromTime) }} إلى {{ fmt12(card.session.toTime) }}
              </span>
            </div>
          } @else {
            <p class="ops-meta">
              ⏰ من {{ fmt12(card.session.fromTime) }} إلى {{ fmt12(card.session.toTime) }}
              @if (cardHint()) {
                <br />{{ cardHint() }}
              }
            </p>
          }

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

      <!-- بطاقتا الملخّص: نصفان متساويان يملآن عرض الشاشة بالتساوي -->
      <div class="stat-row">
        <div class="stat">
          <span class="stat-body">
            <span class="num">{{ circles()?.length ?? 0 }} <span class="unit">حلقة</span></span>
            <span class="label">مسجّلة</span>
          </span>
          <span class="stat-ico" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </span>
        </div>
        <div class="stat">
          <span class="stat-body">
            <span class="num">{{ students()?.length ?? 0 }} <span class="unit">طالب</span></span>
            <span class="label">مسجّل</span>
          </span>
          <span class="stat-ico" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15.5 19v-1.4a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V19" />
              <circle cx="9.5" cy="8" r="3.2" />
              <path d="M20.5 19v-1.4a3.5 3.5 0 0 0-2.7-3.4M15.5 5.1a3.2 3.2 0 0 1 0 5.8" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  `,
})
export class DashboardPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private auth = inject(AuthService);
  private scheduler = inject(SchedulerService);

  readonly typeSingular = CIRCLE_TYPE_SINGULAR;
  readonly fmt12 = fmt12;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly todayLabel = `${weekdayAr(today())} · ${dmy(today())}`;

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);
  private readonly sessions = this.data.allSessions(this.destroyRef);

  /** لحظة حيّة تُحدَّث كل ثانية — لتشغيل العدّاد التنازليّ وإعادة تقييم «جارية / قادمة». */
  private readonly now = signal(Date.now());

  constructor() {
    // جدولة تلقائية للحلقات القادمة عند تحميل قائمة الحلقات
    effect(() => {
      const cs = this.circles();
      if (cs?.length) void this.scheduler.sync(cs);
    });
    const timer = setInterval(() => this.now.set(Date.now()), 1_000);
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

  /**
   * العدّاد التنازليّ الحيّ للحلقة الجارية — الزمن المتبقّي حتى وقت انتهائها.
   * الصيغة: «س:دد:ثث» عند تجاوز الساعة، وإلا «دد:ثث».
   */
  readonly countdownLabel = computed(() => {
    const card = this.circleCard();
    if (!card || card.mode !== 'active') return '';
    const w = sessionWindow(card.session, new Date(this.now()));
    if (!w.closesAt) return '';
    let sec = Math.max(0, Math.round((w.closesAt.getTime() - this.now()) / 1000));
    const h = Math.floor(sec / 3600);
    sec -= h * 3600;
    const m = Math.floor(sec / 60);
    sec -= m * 60;
    const p = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  });

  /** هل موعد الحلقة القادمة اليوم نفسه؟ (تُبرَز الشارة بلون تنبيهيّ حينها) */
  readonly cardIsToday = computed(() => this.circleCard()?.session.date === today());

  /** سطر توضيحيّ إضافيّ أسفل التفاصيل: «تبدأ بعد …». */
  readonly cardHint = computed(() => {
    const card = this.circleCard();
    if (!card || card.mode !== 'upcoming') return '';
    const w = sessionWindow(card.session, new Date(this.now()));
    return w.opensAt ? `تبدأ ${untilLabel(w.opensAt, new Date(this.now()))}` : '';
  });
}
