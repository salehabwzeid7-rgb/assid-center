import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { SchedulerService } from '../../core/scheduler.service';
import {
  CIRCLE_TYPE_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  circleTypeLabel,
  studentCircleIds,
  type Circle,
  type CircleType,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

type Filter = 'all' | CircleType;

@Component({
  selector: 'app-circles',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="الحلقات" [back]="false" />

    <div class="page">
      <div class="tabs" style="margin-bottom:14px">
        <button [class.active]="filter() === 'all'" (click)="setFilter('all')">الكل</button>
        <button [class.active]="filter() === 'memorization'" (click)="setFilter('memorization')">
          {{ typeLabels.memorization }}
        </button>
        <button [class.active]="filter() === 'tajweed'" (click)="setFilter('tajweed')">
          {{ typeLabels.tajweed }}
        </button>
      </div>

      @if (circles() === undefined) {
        <div class="spinner"></div>
      } @else if (visible().length === 0) {
        <div class="empty">
          <span class="icon">📖</span>
          {{ circles()!.length === 0 ? 'لا توجد حلقات بعد.' : 'لا توجد حلقات بهذا النوع.' }}
          <div style="margin-top:12px">
            <a class="btn btn-primary" routerLink="/circles/new">إنشاء حلقة</a>
          </div>
        </div>
      } @else {
        <p class="muted" style="margin:2px 2px 12px">{{ visible().length }} حلقة</p>
        @for (c of visible(); track c.id) {
          <a class="list-item" [routerLink]="['/circle', c.id]">
            <span class="avatar">{{ c.name.charAt(0) }}</span>
            <span class="grow">
              <span class="primary">{{ c.name }}</span>
              <span class="secondary">
                {{ studentCount(c.id) }} طالب
                @if (c.weekdays?.length) {
                  · {{ shortDays(c.weekdays!) }}
                } @else if (c.schedule) {
                  · {{ c.schedule }}
                }
              </span>
            </span>
            @if (typeLabel(c)) {
              <span class="ctype" [class.t-tajweed]="c.type === 'tajweed'">
                {{ typeLabel(c) }}
              </span>
            }
          </a>
        }
      }
    </div>

    <button class="fab" type="button" routerLink="/circles/new">＋ حلقة جديدة</button>
  `,
  styles: [
    `
      .ctype {
        flex-shrink: 0;
        font-weight: 700;
        font-size: 0.72rem;
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--green-tint);
        color: var(--green);
      }
      .ctype.t-tajweed {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
    `,
  ],
})
export class CirclesPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private scheduler = inject(SchedulerService);

  readonly typeLabels = CIRCLE_TYPE_LABELS;
  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);

  constructor() {
    effect(() => {
      const cs = this.circles();
      if (cs?.length) void this.scheduler.sync(cs);
    });
  }

  readonly filter = signal<Filter>(
    ((): Filter => {
      const t = this.route.snapshot.queryParamMap.get('type');
      return t === 'memorization' || t === 'tajweed' ? t : 'all';
    })(),
  );

  readonly visible = computed<Circle[]>(() => {
    const f = this.filter();
    const list = this.circles() ?? [];
    return f === 'all' ? list : list.filter((c) => (c.type ?? 'memorization') === f);
  });

  setFilter(f: Filter): void {
    this.filter.set(f);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { type: f === 'all' ? null : f },
      replaceUrl: true,
    });
  }

  shortDays(days: number[]): string {
    return WEEKDAY_ORDER.filter((d) => days.includes(d))
      .map((d) => WEEKDAY_LABELS[d])
      .join('، ');
  }
  typeLabel(c: Circle): string {
    return circleTypeLabel(c);
  }
  studentCount(circleId: string): number {
    return this.students()?.filter((s) => studentCircleIds(s).includes(circleId)).length ?? 0;
  }
}
