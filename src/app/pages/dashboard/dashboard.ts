import { Component, DestroyRef, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService, today, toDateStr } from '../../core/data.service';
import { SESSION_STATUS_LABELS, type Session } from '../../core/models';

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
          <button class="bell" type="button" routerLink="/schedule" aria-label="الحصص المفتوحة">
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

      <!-- البانر العلوي: ملخّص المعلّم لليوم -->
      <section class="ops-card">
        <p class="kicker">ملخّص اليوم · {{ todayLabel }}</p>
        <div class="ops-stats">
          <div>
            <span class="v">{{ activeToday() }}</span>
            <span class="k">حلقة نشطة اليوم</span>
          </div>
          <div>
            <span class="v">{{ overallRate() === null ? '—' : overallRate() + '٪' }}</span>
            <span class="k">معدّل الحضور العام</span>
          </div>
        </div>
        <button class="ops-btn" type="button" (click)="goToSessions()">
          {{ openToday() ? 'متابعة حصص اليوم' : 'بدء حصص اليوم' }} ‹
        </button>
      </section>

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
        <span>الحصص القادمة</span>
        <a routerLink="/schedule">عرض الكل</a>
      </div>

      @if (upcoming() === undefined) {
        <div class="spinner"></div>
      } @else if (upcoming()!.length === 0) {
        <div class="empty">
          <span class="icon">🗓️</span>
          لا توجد حصص قادمة — ابدأ حصّة من صفحة الحلقة.
        </div>
      } @else {
        @for (s of upcoming(); track s.id) {
          <a class="list-item" [routerLink]="['/session', s.id]">
            <span class="avatar">{{ circleInitial(s.circleId) }}</span>
            <span class="grow">
              <span class="primary">{{ circleName(s.circleId) }}</span>
              <span class="secondary">{{ circleSchedule(s.circleId) || 'حصّة الحلقة' }}</span>
            </span>
            <span class="when">
              <span class="day">{{ relDay(s.date) }}</span>
              <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
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
  private router = inject(Router);

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly todayLabel = new Date().toLocaleDateString('ar', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);
  private readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly attendance = this.data.allAttendance(this.destroyRef);

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

  /** عدد الحلقات التي لها حصّة بتاريخ اليوم. */
  readonly activeToday = computed(() => {
    const t = today();
    return new Set((this.sessions() ?? []).filter((s) => s.date === t).map((s) => s.circleId)).size;
  });

  readonly openToday = computed(() =>
    (this.sessions() ?? []).some((s) => s.date === today() && s.status === 'open'),
  );

  private rate(rows: { status: string }[] | undefined): number | null {
    if (!rows || rows.length === 0) return null;
    const good = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((good / rows.length) * 100);
  }
  readonly overallRate = computed(() => this.rate(this.attendance()));
  readonly todayRate = computed(() =>
    this.rate(this.attendance()?.filter((a) => a.date === today())),
  );

  /** حصص مفتوحة أو مجدولة اليوم فما بعد — مرتّبة تصاعديًّا، حتى ٣. */
  readonly upcoming = computed<Session[] | undefined>(() => {
    const all = this.sessions();
    if (all === undefined) return undefined;
    const t = today();
    return all
      .filter((s) => s.status === 'open' || s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt)
      .slice(0, 3);
  });

  goToSessions(): void {
    const open = (this.sessions() ?? []).find((s) => s.date === today() && s.status === 'open');
    void this.router.navigate(open ? ['/session', open.id] : ['/circles']);
  }

  private circle(id: string) {
    return this.circles()?.find((c) => c.id === id);
  }
  circleName(id: string): string {
    return this.circle(id)?.name ?? 'الحلقة';
  }
  circleInitial(id: string): string {
    return this.circleName(id).charAt(0);
  }
  circleSchedule(id: string): string {
    return this.circle(id)?.schedule ?? '';
  }

  relDay(date: string): string {
    const t = today();
    if (date === t) return 'اليوم';
    if (date === toDateStr(new Date(Date.now() + 86400000))) return 'غدًا';
    if (date === toDateStr(new Date(Date.now() - 86400000))) return 'أمس';
    return new Date(date + 'T00:00:00').toLocaleDateString('ar', { weekday: 'long' });
  }
}
