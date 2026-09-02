import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
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
          لا توجد جلسات مسجّلة بعد.
        </div>
      } @else {
        @if (future().length) {
          <div class="section-title">قادمة</div>
          @for (s of future(); track s.id) {
            <a class="list-item" [routerLink]="['/session', s.id]">
              <span class="avatar">{{ dayNum(s.date) }}</span>
              <span class="grow">
                <span class="primary">{{ circleName(s.circleId) }}</span>
                <span class="secondary">{{ fullDate(s.date) }}</span>
              </span>
              <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
                {{ statusLabels[s.status] }}
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
                <span class="secondary">{{ fullDate(s.date) }}</span>
              </span>
              <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
                {{ statusLabels[s.status] }}
              </span>
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

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly circles = this.data.circles(this.destroyRef);

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
  fullDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('ar', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
}
