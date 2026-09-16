import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dateTimeFull } from '../../core/format';
import { PageHeaderComponent } from '../../shared/page-header';

const PLATFORM_LABELS: Record<string, string> = { android: 'أندرويد', web: 'ويب' };

@Component({
  selector: 'app-owner-dashboard',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="لوحة المالك" [back]="false">
      <button actions class="btn btn-ghost" type="button" (click)="logout()">خروج</button>
    </app-page-header>

    <div class="page">
      <div class="stat-grid">
        <div class="card stat">
          <span class="stat-num">{{ stats()?.totalTeachers ?? '—' }}</span>
          <span class="stat-label">معلّم مسجَّل</span>
        </div>
        <div class="card stat">
          <span class="stat-num">{{ stats()?.uniqueDevices ?? '—' }}</span>
          <span class="stat-label">جهاز فريد</span>
        </div>
        <div class="card stat">
          <span class="stat-num">{{ stats()?.totalCircles ?? '—' }}</span>
          <span class="stat-label">حلقة نشطة</span>
        </div>
        <div class="card stat">
          <span class="stat-num">{{ stats()?.totalStudents ?? '—' }}</span>
          <span class="stat-label">طالب</span>
        </div>
        <div class="card stat">
          <span class="stat-num">{{ stats()?.totalRecitations ?? '—' }}</span>
          <span class="stat-label">تسميع مسجَّل</span>
        </div>
      </div>

      <div class="quick-links">
        <a class="btn btn-ghost btn-block" routerLink="/owner/search"
          >🔍 بحث عن طالب عبر كل المعلّمين</a
        >
        <a class="btn btn-ghost btn-block" routerLink="/owner/deleted"
          >🗑️ سجلّ المحذوفات (كل المعلّمين)</a
        >
      </div>

      <div class="section-title">المعلّمون ({{ teachers()?.length ?? 0 }})</div>
      @if (teachers() === undefined) {
        <div class="spinner"></div>
      } @else if (teachers()!.length === 0) {
        <div class="empty"><span class="icon">👥</span> لا يوجد معلّمون مسجَّلون بعد.</div>
      } @else {
        @for (t of teachers(); track t.id) {
          <a class="list-item" [routerLink]="['/owner/teacher', t.id]">
            <span class="avatar">👤</span>
            <span class="grow">
              <span class="primary">{{ t.name }}</span>
              <span class="secondary">
                {{ t.email }} · {{ platformLabel(t.platform) }} · {{ t.circleCount }} حلقة ·
                {{ t.studentCount }} طالب
              </span>
              <span class="secondary muted">آخر نشاط: {{ dateTimeFull(t.lastActiveAt) }}</span>
            </span>
            <span class="chevron">‹</span>
          </a>
        }
      }
    </div>
  `,
  styles: [
    `
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-bottom: 16px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 14px 8px;
      }
      .stat-num {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--green);
      }
      .stat-label {
        font-size: 0.78rem;
        color: var(--text-soft);
      }
      .quick-links {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .muted {
        color: var(--text-soft);
        font-size: 0.76rem;
      }
    `,
  ],
})
export class OwnerDashboardPage {
  private auth = inject(AuthService);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly stats = this.data.platformStats(this.destroyRef);
  readonly teachers = this.data.platformTeachers(this.destroyRef);
  readonly dateTimeFull = dateTimeFull;

  platformLabel(p?: string): string {
    return (p && PLATFORM_LABELS[p]) || p || '—';
  }

  async logout(): Promise<void> {
    if (!(await this.notify.confirm('تسجيل الخروج؟', { confirmText: 'خروج', danger: true })))
      return;
    await this.auth.logout();
  }
}
