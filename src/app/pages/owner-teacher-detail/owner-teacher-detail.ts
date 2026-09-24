import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dateTimeFull } from '../../core/format';
import { SESSION_STATUS_LABELS } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

const PLATFORM_LABELS: Record<string, string> = { android: 'أندرويد', web: 'ويب' };

/**
 * تفاصيل معلّم واحد من منظور المالك — للتصفّح، ولإيقاف/استعادة حسابه
 * (v1.34)، من نسخ لوحة المالك الخفيفة لا البيانات الحقيقيّة.
 */
@Component({
  selector: 'app-owner-teacher-detail',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header [title]="teacherName() || 'تفاصيل المعلّم'" />

    <div class="page">
      @if (teacher(); as t) {
        @if (t.disabledAt) {
          <div class="banner banner-danger">
            <b>🚫 هذا الحساب موقوف</b>
            <p style="margin:6px 0 10px">لا يستطيع صاحبه الدخول للتطبيق حتى تُعاد استعادته.</p>
            <button
              class="btn btn-primary btn-block"
              type="button"
              [disabled]="restoring()"
              (click)="restore()"
            >
              {{ restoring() ? 'جارٍ الاستعادة…' : '↺ استعادة الحساب الآن' }}
            </button>
          </div>
        }

        <div class="card">
          <p style="margin:0 0 6px">
            <b>{{ t.name }}</b>
          </p>
          <p class="muted" style="margin:0 0 4px">{{ t.email }}</p>
          <p class="muted" style="margin:0">
            انضمّ {{ dateTimeFull(t.createdAt) }} · آخر نشاط {{ dateTimeFull(t.lastActiveAt) }}
          </p>
        </div>

        <div class="section-title">جهاز إنشاء الحساب</div>
        <div class="card device-card">
          <span class="device-ico">{{ t.platform === 'android' ? '📱' : '💻' }}</span>
          <span class="grow">
            <span class="primary">{{ platformLabel(t.platform) }}</span>
            <span class="secondary" dir="ltr" style="text-align:start;display:block">{{
              t.deviceId || '—'
            }}</span>
          </span>
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

      <div class="section-title">الأجهزة والجلسات الأخيرة ({{ sessions()?.length ?? 0 }})</div>
      @if (sessions() === undefined) {
        <div class="spinner"></div>
      } @else if (sessions()!.length === 0) {
        <div class="empty"><span class="icon">📱</span> لا جلسات مسجَّلة بعد.</div>
      } @else {
        @for (s of sessions(); track s.id) {
          <div class="list-item is-static session-row">
            <span class="avatar">{{ s.platform === 'android' ? '📱' : '💻' }}</span>
            <span class="grow">
              <span class="primary"
                >{{ s.circleName || 'حلقة' }} — {{ statusLabels[s.status] ?? s.status }}</span
              >
              <span class="secondary">{{ s.date }} · {{ platformLabel(s.platform) }}</span>
              <span class="secondary muted">{{ dateTimeFull(s.updatedAt) }}</span>
            </span>
          </div>
        }
      }

      <div class="section-title">الحلقات ({{ circles()?.length ?? 0 }})</div>
      @if (circles() === undefined) {
        <div class="spinner"></div>
      } @else if (circles()!.length === 0) {
        <div class="empty"><span class="icon">📚</span> لا حلقات.</div>
      } @else {
        @for (c of circles(); track c.id) {
          <div class="list-item is-static">
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
          <div class="list-item is-static">
            <span class="avatar">🧒</span>
            <span class="grow"
              ><span class="primary">{{ s.name }}</span></span
            >
          </div>
        }
      }

      @if (teacher(); as t) {
        @if (!t.disabledAt) {
          <div class="section-title">منطقة الخطر</div>
          <div class="card danger-zone">
            @if (!confirmStep()) {
              <p class="muted" style="margin:0 0 10px;font-size:.86rem">
                إيقاف الحساب يمنع صاحبه من الدخول للتطبيق فورًا. بياناته (حلقاته وطلّابه) تبقى سليمة
                تمامًا، ويمكن استعادة الحساب في أيّ وقت من «سجلّ المحذوفات».
              </p>
              <button class="btn btn-danger btn-block" type="button" (click)="beginDelete()">
                🚫 إيقاف هذا الحساب
              </button>
            } @else {
              <p style="margin:0 0 10px;font-size:.9rem">
                للتأكيد، اكتب اسم المعلّم بالضبط:
                <b>{{ t.name }}</b>
              </p>
              <input
                type="text"
                [(ngModel)]="confirmName"
                placeholder="اكتب الاسم هنا…"
                style="margin-bottom:10px"
              />
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost" type="button" (click)="cancelDelete()">إلغاء</button>
                <button
                  class="btn btn-danger"
                  style="flex:1"
                  type="button"
                  [disabled]="confirmName.trim() !== t.name || disabling()"
                  (click)="confirmDelete(t.id, t.name, t.email)"
                >
                  {{ disabling() ? 'جارٍ الإيقاف…' : 'تأكيد الإيقاف نهائيًّا' }}
                </button>
              </div>
            }
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
      .device-card {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .device-ico {
        font-size: 1.4rem;
        flex-shrink: 0;
      }
      .session-row .secondary {
        font-size: 0.78rem;
      }
      .banner {
        border-radius: var(--radius);
        padding: 14px;
        margin-bottom: 14px;
      }
      .banner-danger {
        background: var(--danger-bg);
        color: var(--danger);
        border: 1px solid var(--danger);
      }
      .danger-zone {
        border-color: var(--danger);
        margin-bottom: 20px;
      }
    `,
  ],
})
export class OwnerTeacherDetailPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly uid = this.route.snapshot.paramMap.get('uid')!;
  readonly teachers = this.data.platformTeachers(this.destroyRef);
  readonly teacher = computed(() => this.teachers()?.find((t) => t.id === this.uid) ?? null);
  readonly circles = this.data.platformTeacherCircles(this.uid, this.destroyRef);
  readonly students = this.data.platformTeacherStudents(this.uid, this.destroyRef);
  readonly sessions = this.data.platformTeacherSessions(this.uid, this.destroyRef);
  private readonly deletedItems = this.data.platformDeletedItems(this.destroyRef);
  readonly dateTimeFull = dateTimeFull;
  readonly statusLabels = SESSION_STATUS_LABELS;

  readonly confirmStep = signal(false);
  confirmName = '';
  readonly disabling = signal(false);
  readonly restoring = signal(false);

  teacherName(): string {
    return this.teacher()?.name ?? '';
  }

  platformLabel(p?: string): string {
    return (p && PLATFORM_LABELS[p]) || p || '—';
  }

  beginDelete(): void {
    this.confirmStep.set(true);
    this.confirmName = '';
  }

  cancelDelete(): void {
    this.confirmStep.set(false);
    this.confirmName = '';
  }

  async confirmDelete(uid: string, name: string, email: string): Promise<void> {
    const ok = await this.notify.confirm(`إيقاف حساب «${name}» نهائيًّا؟`, {
      message: 'لن يستطيع صاحب هذا الحساب الدخول للتطبيق بعد الآن، حتى تُعاد استعادته.',
      confirmText: 'إيقاف الحساب',
      danger: true,
    });
    if (!ok) return;
    this.disabling.set(true);
    await this.notify.run(() => this.data.disableTeacherAccount(uid, name, email), {
      loading: 'جارٍ إيقاف الحساب…',
      success: 'أُوقف الحساب — يمكن استعادته من سجلّ المحذوفات',
      error: 'تعذّر إيقاف الحساب',
    });
    this.disabling.set(false);
    this.confirmStep.set(false);
    this.confirmName = '';
  }

  async restore(): Promise<void> {
    const entry = this.deletedItems()?.find(
      (e) => e.target === 'teacher' && e.teacherUid === this.uid && !e.restoredAt,
    );
    if (!entry) {
      this.notify.error('تعذّر العثور على سجلّ الإيقاف لاستعادته — جرّب سجلّ المحذوفات مباشرةً');
      return;
    }
    this.restoring.set(true);
    await this.notify.run(() => this.data.restorePlatformDeletedItem(entry.id), {
      loading: 'جارٍ الاستعادة…',
      success: 'أُعيد تفعيل الحساب',
      error: 'تعذّرت الاستعادة',
    });
    this.restoring.set(false);
  }
}
