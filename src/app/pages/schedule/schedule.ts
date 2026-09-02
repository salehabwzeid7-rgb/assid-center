import { Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { dmy, weekdayAr } from '../../core/format';
import { SchedulerService } from '../../core/scheduler.service';
import { SESSION_STATUS_LABELS, type Session } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-schedule',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="الجدول" [back]="false" />

    <div class="page">
      @if (sessions() === undefined) {
        <div class="spinner"></div>
      } @else if (sessions()!.length === 0) {
        <div class="empty">
          <span class="icon">🗓️</span>
          لا توجد حصص مجدولة بعد — أضف أيام التكرار عند إنشاء الحلقة.
        </div>
      } @else {
        @if (future().length) {
          <div class="section-title">قادمة</div>
          @for (s of future(); track s.id) {
            <a class="list-item" [routerLink]="['/session', s.id]">
              <span class="avatar">{{ dayNum(s.date) }}</span>
              <span class="grow">
                <span class="primary">{{ circleName(s.circleId) }}</span>
                <span class="secondary">
                  {{ weekdayAr(s.date) }} · {{ dmy(s.date) }}{{ s.time ? ' · ' + s.time : '' }}
                </span>
              </span>
              <span [class]="'badge b-' + badge(s.status)">{{ statusLabels[s.status] }}</span>
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
})
export class SchedulePage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private scheduler = inject(SchedulerService);

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly circles = this.data.circles(this.destroyRef);

  constructor() {
    effect(() => {
      const cs = this.circles();
      if (cs?.length) void this.scheduler.sync(cs);
    });
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

  circleName(id: string): string {
    return this.circles()?.find((c) => c.id === id)?.name ?? 'الحلقة';
  }
  dayNum(date: string): string {
    return date.slice(8, 10);
  }
  badge(status: Session['status']): string {
    return status === 'open' ? 'late' : status === 'scheduled' ? 'grade' : 'present';
  }
}
