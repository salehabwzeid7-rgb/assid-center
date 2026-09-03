import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmtRange, sessionWindow, untilLabel } from '../../core/time';
import { SchedulerService } from '../../core/scheduler.service';
import {
  SESSION_STATUS_LABELS,
  circleTypeLabel,
  type Circle,
  type Session,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-schedule',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="جدول الحصص" [back]="false" />

    <div class="page">
      @if (sessions() === undefined) {
        <div class="spinner"></div>
      } @else if (sessions()!.length === 0) {
        <div class="empty">
          <span class="icon">🗓️</span>
          لا توجد حصص مجدولة بعد — أضف أيام الحلقة ووقتها عند إنشائها.
        </div>
      } @else {
        @if (future().length) {
          <div class="section-title">الحصص القادمة</div>
          @for (s of future(); track s.id) {
            <a class="list-item" [routerLink]="['/session', s.id]">
              <span class="avatar">{{ dayNum(s.date) }}</span>
              <span class="grow">
                <span class="primary">
                  {{ circleName(s.circleId) }}
                  @if (circleTypeText(s.circleId); as ct) {
                    <span class="stag" [class.t-tajweed]="isTajweed(s.circleId)">{{ ct }}</span>
                  }
                </span>
                <span class="secondary">
                  {{ weekdayAr(s.date) }} · {{ dmy(s.date) }}
                  @if (fmtRange(s.fromTime, s.toTime)) {
                    · {{ fmtRange(s.fromTime, s.toTime) }}
                  }
                </span>
              </span>
              <span class="when">
                <span class="day" [class.now]="windowState(s) === 'now'">{{ hint(s) }}</span>
                <span [class]="'badge b-' + badge(s.status)">{{ statusLabels[s.status] }}</span>
              </span>
            </a>
          }
        }
        @if (past().length) {
          <div class="section-title">سابقة</div>
          @for (s of past(); track s.id) {
            <a class="list-item" [routerLink]="['/session', s.id]">
              <span class="avatar">{{ dayNum(s.date) }}</span>
              <span class="grow">
                <span class="primary">{{ circleName(s.circleId) }}</span>
                <span class="secondary">{{ weekdayAr(s.date) }} · {{ dmy(s.date) }}</span>
              </span>
              <span [class]="'badge b-' + badge(s.status)">{{ statusLabels[s.status] }}</span>
            </a>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .stag {
        font-weight: 700;
        font-size: 0.66rem;
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--green-tint);
        color: var(--green);
        margin-inline-start: 6px;
      }
      .stag.t-tajweed {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .when {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 5px;
        flex-shrink: 0;
        text-align: end;
      }
      .when .day {
        font-size: 0.76rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .when .day.now {
        color: var(--ok);
      }
    `,
  ],
})
export class SchedulePage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private scheduler = inject(SchedulerService);

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmtRange = fmtRange;

  readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly circles = this.data.circles(this.destroyRef);
  private readonly now = signal(Date.now());

  constructor() {
    effect(() => {
      const cs = this.circles();
      if (cs?.length) void this.scheduler.sync(cs);
    });
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  readonly future = computed<Session[]>(() => {
    const t = today();
    return (this.sessions() ?? [])
      .filter((s) => s.status === 'open' || s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt);
  });

  readonly past = computed<Session[]>(() => {
    const t = today();
    return (this.sessions() ?? []).filter((s) => s.status !== 'open' && s.date < t);
  });

  private circle(id: string): Circle | undefined {
    return this.circles()?.find((c) => c.id === id);
  }
  circleName(id: string): string {
    return this.circle(id)?.name ?? 'الحلقة';
  }
  circleTypeText(id: string): string {
    return circleTypeLabel(this.circle(id));
  }
  isTajweed(id: string): boolean {
    return this.circle(id)?.type === 'tajweed';
  }
  dayNum(date: string): string {
    return date.slice(8, 10);
  }
  badge(status: Session['status']): string {
    return status === 'open' ? 'late' : status === 'scheduled' ? 'grade' : 'present';
  }
  windowState(s: Session): string {
    return sessionWindow(s, new Date(this.now())).state;
  }
  hint(s: Session): string {
    if (s.status === 'open') return 'جارية';
    const w = sessionWindow(s, new Date(this.now()));
    if (w.state === 'now') return 'الآن';
    if (w.state === 'after') return 'انتهت';
    if (w.state === 'before' && w.opensAt) return untilLabel(w.opensAt, new Date(this.now()));
    return '';
  }
}
