import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circles',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="الحلقات" [back]="false" />

    <div class="page">
      @if (circles() === undefined) {
        <div class="spinner"></div>
      } @else if (circles()!.length === 0) {
        <div class="empty">
          <span class="icon">📖</span>
          لا توجد حلقات بعد.
          <div style="margin-top:12px">
            <a class="btn btn-primary" routerLink="/circles/new">إنشاء أول حلقة</a>
          </div>
        </div>
      } @else {
        <p class="muted" style="margin:2px 2px 12px">
          {{ circles()!.length }} حلقة · {{ studentTotal() }} طالب
        </p>
        @for (c of circles(); track c.id) {
          <a class="list-item" [routerLink]="['/circle', c.id]">
            <span class="avatar">{{ c.name.charAt(0) }}</span>
            <span class="grow">
              <span class="primary">{{ c.name }}</span>
              <span class="secondary">
                {{ studentCount(c.id) }} طالب
                @if (c.schedule) {
                  · {{ c.schedule }}
                }
              </span>
            </span>
            <span class="chevron">‹</span>
          </a>
        }
      }
    </div>

    <button class="fab" type="button" routerLink="/circles/new">＋ حلقة جديدة</button>
  `,
})
export class CirclesPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);

  studentCount(circleId: string): number {
    return this.students()?.filter((s) => s.circleId === circleId).length ?? 0;
  }
  studentTotal(): number {
    return this.students()?.length ?? 0;
  }
}
