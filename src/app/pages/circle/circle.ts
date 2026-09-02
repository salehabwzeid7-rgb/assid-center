import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { SESSION_STATUS_LABELS, type Circle } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="circle()?.name || 'الحلقة'">
      <button actions class="icon-btn" type="button" [routerLink]="['/circle', id, 'edit']" aria-label="تعديل">
        ✎
      </button>
    </app-page-header>

    <div class="page">
      @if (circle(); as c) {
        @if (c.schedule) {
          <p class="muted" style="margin:2px 2px 12px">🕌 {{ c.schedule }}</p>
        }
      }

      <!-- جلسة اليوم -->
      <div class="card">
        <div class="section-title" style="margin:0 0 10px">جلسة اليوم — {{ todayLabel }}</div>
        @if (todaySession(); as ts) {
          <p class="muted" style="margin:0 0 10px">
            الجلسة {{ statusLabels[ts.status] }} · الحضور {{ presentCount() }}/{{ studentTotal() }}
          </p>
          <button class="btn btn-primary btn-block btn-lg" type="button" (click)="go(ts.id)">
            متابعة جلسة اليوم ›
          </button>
        } @else {
          <button
            class="btn btn-primary btn-block btn-lg"
            type="button"
            [disabled]="starting() || studentTotal() === 0"
            (click)="startToday()"
          >
            {{ starting() ? '…' : '＋ بدء جلسة اليوم' }}
          </button>
          @if (studentTotal() === 0) {
            <p class="hint">أضف طلابًا إلى الحلقة أولًا لبدء جلسة.</p>
          }
        }

        <details style="margin-top:10px">
          <summary class="muted" style="cursor:pointer;font-size:.86rem">بدء جلسة بتاريخ آخر</summary>
          <div class="field-row" style="margin-top:8px;align-items:end">
            <div class="field" style="margin:0">
              <input type="date" name="otherDate" [(ngModel)]="otherDate" [max]="todayIso" />
            </div>
            <button class="btn" type="button" [disabled]="starting()" (click)="startOther()">فتح</button>
          </div>
        </details>
      </div>

      <!-- بلاطات -->
      <div class="tiles" style="margin-top:12px">
        <a class="tile" [routerLink]="['/circle', id, 'students']">
          <span class="tile-num">{{ studentTotal() }}</span>
          <span class="tile-label">الطلاب</span>
        </a>
        <a class="tile" [routerLink]="['/circle', id, 'stats']">
          <span class="tile-ico">📊</span>
          <span class="tile-label">الإحصائيات</span>
        </a>
      </div>

      <div class="section-title">الجلسات السابقة</div>
      @if (sessions() === undefined) {
        <div class="spinner"></div>
      } @else if (sessions()!.length === 0) {
        <div class="empty"><span class="icon">📅</span> لا توجد جلسات بعد.</div>
      } @else {
        @for (s of sessions(); track s.id) {
          <button class="list-item" type="button" (click)="go(s.id)">
            <span class="avatar">{{ dayNum(s.date) }}</span>
            <span class="grow">
              <span class="primary">{{ dateLabel(s.date) }}</span>
              <span class="secondary">
                حضور {{ countPresent(s.id) }}/{{ studentTotal() }} · تسميع {{ countRecite(s.id) }}
              </span>
            </span>
            <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
              {{ statusLabels[s.status] }}
            </span>
          </button>
        }
      }
    </div>

    <button
      class="fab"
      type="button"
      [disabled]="starting() || studentTotal() === 0"
      (click)="startToday()"
    >
      ＋ جلسة
    </button>
  `,
  styles: [
    `
      .tiles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 16px 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow);
        color: var(--text);
      }
      .tile-num {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--green);
      }
      .tile-ico {
        font-size: 1.5rem;
      }
      .tile-label {
        color: var(--text-soft);
        font-size: 0.85rem;
        font-weight: 700;
      }
    `,
  ],
})
export class CirclePage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);
  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly starting = signal(false);
  readonly todayIso = today();
  otherDate = today();

  readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  readonly sessions = this.data.sessionsByCircle(this.id, this.destroyRef);
  private readonly attendance = this.data.circleAttendance(this.id, this.destroyRef);
  private readonly recitations = this.data.circleRecitations(this.id, this.destroyRef);

  readonly todayLabel = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
  readonly studentTotal = computed(() => this.students()?.filter((s) => s.active).length ?? 0);
  readonly todaySession = computed(() => this.sessions()?.find((s) => s.date === this.todayIso) ?? null);
  readonly presentCount = computed(() => {
    const sid = this.todaySession()?.id;
    return sid ? this.countPresent(sid) : 0;
  });

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.id));
  }

  countPresent(sessionId: string): number {
    return (
      this.attendance()?.filter(
        (a) => a.sessionId === sessionId && (a.status === 'present' || a.status === 'late'),
      ).length ?? 0
    );
  }
  countRecite(sessionId: string): number {
    return this.recitations()?.filter((r) => r.sessionId === sessionId).length ?? 0;
  }

  dayNum(date: string): string {
    return date.slice(8, 10);
  }
  dateLabel(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('ar', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  go(sessionId: string): void {
    this.router.navigate(['/session', sessionId]);
  }

  async startToday(): Promise<void> {
    await this.start(this.todayIso);
  }
  async startOther(): Promise<void> {
    if (this.otherDate) await this.start(this.otherDate);
  }
  private async start(date: string): Promise<void> {
    if (this.studentTotal() === 0) return;
    this.starting.set(true);
    const sid = await this.notify.run(() => this.data.openSession(this.id, date), {
      loading: 'جارٍ فتح الجلسة…',
      error: 'تعذّر فتح الجلسة',
    });
    this.starting.set(false);
    if (sid) await this.router.navigate(['/session', sid]);
  }
}
