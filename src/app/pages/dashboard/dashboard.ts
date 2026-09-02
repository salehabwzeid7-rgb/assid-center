import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { ThemeService } from '../../core/theme.service';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="مركز أسيد" [back]="false">
      <span actions style="display:flex;gap:8px">
        <button class="icon-btn" type="button" (click)="theme.toggle()" aria-label="تبديل السمة">
          🎨
        </button>
        <button class="icon-btn" type="button" routerLink="/profile" aria-label="الحساب">⚙</button>
      </span>
    </app-page-header>

    <div class="page">
      <p class="muted page-date">{{ todayLabel }}</p>

      <div class="stat-grid" style="margin-top:12px">
        <div class="stat">
          <div class="num">{{ circles()?.length ?? '…' }}</div>
          <div class="label">حلقاتي</div>
        </div>
        <div class="stat">
          <div class="num">{{ students()?.length ?? '…' }}</div>
          <div class="label">إجمالي الطلاب</div>
        </div>
        <div class="stat">
          <div class="num">
            {{ presentToday() }}<span style="font-size:.9rem">/{{ markedToday() }}</span>
          </div>
          <div class="label">حضور اليوم</div>
        </div>
        <div class="stat">
          <div class="num">{{ recitationsToday() }}</div>
          <div class="label">تسميع اليوم</div>
        </div>
      </div>

      <div class="row-between section-title">
        <span>حلقاتي</span>
        <a routerLink="/circles/new">+ إضافة حلقة</a>
      </div>

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
export class DashboardPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  readonly theme = inject(ThemeService);

  readonly todayLabel = new Date().toLocaleDateString('ar', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);
  private readonly attToday = this.data.attendanceForDate(today(), this.destroyRef);
  private readonly recToday = this.data.recitationsForDate(today(), this.destroyRef);

  readonly markedToday = computed(() => this.attToday()?.length ?? 0);
  readonly presentToday = computed(
    () => this.attToday()?.filter((a) => a.status === 'present' || a.status === 'late').length ?? 0,
  );
  readonly recitationsToday = computed(() => this.recToday()?.length ?? 0);

  studentCount(circleId: string): number {
    return this.students()?.filter((s) => s.circleId === circleId).length ?? 0;
  }
}
