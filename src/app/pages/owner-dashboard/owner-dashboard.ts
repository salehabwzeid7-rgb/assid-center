import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dateTimeFull } from '../../core/format';
import { PageHeaderComponent } from '../../shared/page-header';

const PLATFORM_LABELS: Record<string, string> = { android: 'أندرويد', web: 'ويب' };

/**
 * لوحة المالك الرئيسية (v1.34 — إعادة تصميم). بطاقات الأرقام مدخل فعليّ إلى
 * ما تعدّه — لا رقم جامد لا يستجيب للمس: «حلقة نشطة» ← تصفّح كل الحلقات،
 * «طالب» ← تصفّح كل الطلّاب، «معلّم مسجَّل» ← تمرير للقائمة أدناه (هي أصلًا
 * على نفس الصفحة). «جهاز فريد» و«تسميع مسجَّل» يبقيان عدّادين محضين عمدًا —
 * لا وجهة تصفّح طبيعيّة لهما بلا مجموعة مرآة جديدة كاملة، وجعلهما قابلين
 * للضغط يصنع وعدًا كاذبًا جديدًا بدل حلّ مشكلة (نفس مبدأ إصلاح بطاقتَي
 * الرئيسيّة للمعلّم — راجع dashboard.ts).
 */
@Component({
  selector: 'app-owner-dashboard',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="لوحة المالك" nav="none">
      <button actions class="btn btn-ghost logout-btn" type="button" (click)="logout()">
        خروج
      </button>
    </app-page-header>

    <div class="page">
      <div class="stat-grid">
        <button type="button" class="card stat stat-link" (click)="scrollToTeachers()">
          <span class="stat-num">{{ stats()?.totalTeachers ?? '—' }}</span>
          <span class="stat-label">معلّم مسجَّل</span>
          <span class="stat-go">القائمة أدناه ↓</span>
        </button>
        <div class="card stat is-static">
          <span class="stat-num">{{ stats()?.uniqueDevices ?? '—' }}</span>
          <span class="stat-label">جهاز فريد</span>
        </div>
        <a class="card stat stat-link" routerLink="/sys/circles">
          <span class="stat-num">{{ stats()?.totalCircles ?? '—' }}</span>
          <span class="stat-label">حلقة نشطة</span>
          <span class="stat-go">تصفّح الكلّ ›</span>
        </a>
        <a class="card stat stat-link" routerLink="/sys/search">
          <span class="stat-num">{{ stats()?.totalStudents ?? '—' }}</span>
          <span class="stat-label">طالب</span>
          <span class="stat-go">تصفّح الكلّ ›</span>
        </a>
        <div class="card stat is-static">
          <span class="stat-num">{{ stats()?.totalRecitations ?? '—' }}</span>
          <span class="stat-label">تسميع مسجَّل</span>
        </div>
      </div>

      <div class="quick-links">
        <a class="ql" routerLink="/sys/search">
          <span class="ql-ico">🔍</span>
          <span class="ql-text">
            <span class="ql-title">بحث عن طالب</span>
            <span class="ql-sub">عبر كل المعلّمين دفعة واحدة</span>
          </span>
          <span class="chevron">‹</span>
        </a>
        <a class="ql" routerLink="/sys/circles">
          <span class="ql-ico">📚</span>
          <span class="ql-text">
            <span class="ql-title">كل الحلقات</span>
            <span class="ql-sub">تصفّح عبر كل المعلّمين</span>
          </span>
          <span class="chevron">‹</span>
        </a>
        <a class="ql" routerLink="/sys/deleted">
          <span class="ql-ico">🗑️</span>
          <span class="ql-text">
            <span class="ql-title">سجلّ المحذوفات</span>
            <span class="ql-sub">كل المعلّمين — بما فيها الحسابات الموقوفة</span>
          </span>
          <span class="chevron">‹</span>
        </a>
      </div>

      <div class="section-title" id="teachers">المعلّمون ({{ teachers()?.length ?? 0 }})</div>
      @if (teachers() === undefined) {
        <div class="spinner"></div>
      } @else if (teachers()!.length === 0) {
        <div class="empty"><span class="icon">👥</span> لا يوجد معلّمون مسجَّلون بعد.</div>
      } @else {
        @for (t of teachers(); track t.id) {
          <a
            class="list-item"
            [class.disabled-row]="!!t.disabledAt"
            [routerLink]="['/sys/teacher', t.id]"
          >
            <span class="avatar">{{ t.disabledAt ? '🚫' : '👤' }}</span>
            <span class="grow">
              <span class="primary">
                {{ t.name }}
                @if (t.disabledAt) {
                  <span class="disabled-badge">موقوف</span>
                }
              </span>
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
        border: 1px solid var(--border);
        font-family: inherit;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
      }
      .stat.is-static {
        cursor: default;
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
      .stat-go {
        margin-top: 2px;
        font-size: 0.68rem;
        font-weight: 800;
        color: var(--green-mid);
      }
      .stat-link:active {
        transform: scale(0.96);
      }
      .stat.is-static:active {
        transform: none;
      }

      .quick-links {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }
      .ql {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        text-decoration: none;
        color: inherit;
        transition: transform 0.12s ease;
      }
      .ql:active {
        transform: scale(0.98);
      }
      .ql-ico {
        font-size: 1.3rem;
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--green-tint);
        display: grid;
        place-items: center;
      }
      .ql-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .ql-title {
        font-weight: 700;
        font-size: 0.92rem;
      }
      .ql-sub {
        font-size: 0.76rem;
        color: var(--text-soft);
      }

      .muted {
        color: var(--text-soft);
        font-size: 0.76rem;
      }
      .logout-btn {
        font-size: 0.82rem;
        padding: 6px 12px;
      }

      .disabled-row {
        opacity: 0.6;
      }
      .disabled-badge {
        display: inline-block;
        margin-inline-start: 6px;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--danger-bg);
        color: var(--danger);
        font-size: 0.68rem;
        font-weight: 800;
        vertical-align: middle;
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

  scrollToTeachers(): void {
    document.getElementById('teachers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async logout(): Promise<void> {
    if (!(await this.notify.confirm('تسجيل الخروج؟', { confirmText: 'خروج', danger: true })))
      return;
    await this.auth.logout();
  }
}
