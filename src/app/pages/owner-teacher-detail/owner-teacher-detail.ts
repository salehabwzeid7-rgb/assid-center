import { Component, DestroyRef, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataService } from '../../core/data.service';
import { dateTimeFull } from '../../core/format';
import { PageHeaderComponent } from '../../shared/page-header';

const PLATFORM_LABELS: Record<string, string> = { android: 'أندرويد', web: 'ويب' };

/** تفاصيل معلّم واحد من منظور المالك — للتصفّح فقط، من نسخ لوحة المالك الخفيفة لا البيانات الحقيقيّة. */
@Component({
  selector: 'app-owner-teacher-detail',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header [title]="teacherName() || 'تفاصيل المعلّم'" />

    <div class="page">
      @if (teacher(); as t) {
        <div class="card">
          <p style="margin:0 0 6px">
            <b>{{ t.name }}</b>
          </p>
          <p class="muted" style="margin:0 0 4px">{{ t.email }}</p>
          <p class="muted" style="margin:0">
            {{ platformLabel(t.platform) }} · انضمّ {{ dateTimeFull(t.createdAt) }}
          </p>
          <p class="muted" style="margin:4px 0 0">آخر نشاط: {{ dateTimeFull(t.lastActiveAt) }}</p>
        </div>

        <div class="stat-grid">
          <div class="card stat">
            <span class="stat-num">{{ t.circleCount }}</span>
            <span class="stat-label">حلقة</span>
          </div>
          <div class="card stat">
            <span class="stat-num">{{ t.studentCount }}</span>
            <span class="stat-label">طالب</span>
          </div>
          <div class="card stat">
            <span class="stat-num">{{ t.recitationCount }}</span>
            <span class="stat-label">تسميع</span>
          </div>
          <div class="card stat">
            <span class="stat-num">{{ t.memorizedCount }}</span>
            <span class="stat-label">سورة محفوظة</span>
          </div>
        </div>
      }

      <div class="section-title">الحلقات ({{ circles()?.length ?? 0 }})</div>
      @if (circles() === undefined) {
        <div class="spinner"></div>
      } @else if (circles()!.length === 0) {
        <div class="empty"><span class="icon">📚</span> لا حلقات.</div>
      } @else {
        @for (c of circles(); track c.id) {
          <div class="list-item">
            <span class="avatar">📗</span>
            <span class="grow"
              ><span class="primary">{{ c.name }}</span></span
            >
          </div>
        }
      }

      <div class="section-title">الطلّاب ({{ students()?.length ?? 0 }})</div>
      @if (students() === undefined) {
        <div class="spinner"></div>
      } @else if (students()!.length === 0) {
        <div class="empty"><span class="icon">👤</span> لا طلّاب.</div>
      } @else {
        @for (s of students(); track s.id) {
          <div class="list-item">
            <span class="avatar">🧒</span>
            <span class="grow"
              ><span class="primary">{{ s.name }}</span></span
            >
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin: 12px 0 4px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 4px;
      }
      .stat-num {
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--green);
      }
      .stat-label {
        font-size: 0.7rem;
        color: var(--text-soft);
      }
    `,
  ],
})
export class OwnerTeacherDetailPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly uid = this.route.snapshot.paramMap.get('uid')!;
  readonly teachers = this.data.platformTeachers(this.destroyRef);
  readonly teacher = computed(() => this.teachers()?.find((t) => t.id === this.uid) ?? null);
  readonly circles = this.data.platformTeacherCircles(this.uid, this.destroyRef);
  readonly students = this.data.platformTeacherStudents(this.uid, this.destroyRef);
  readonly dateTimeFull = dateTimeFull;

  teacherName(): string {
    return this.teacher()?.name ?? '';
  }

  platformLabel(p?: string): string {
    return (p && PLATFORM_LABELS[p]) || p || '—';
  }
}
