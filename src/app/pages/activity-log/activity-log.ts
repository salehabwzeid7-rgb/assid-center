import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dateTimeFull } from '../../core/format';
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_TARGET_LABELS,
  ATTENDANCE_LABELS,
  RECITATION_KIND_LABELS,
  SESSION_STATUS_LABELS,
  type ActivityAction,
  type ActivityLogEntry,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

type Tab = 'delete' | 'update' | 'all';
type RangeFilter = 'today' | 'week' | 'month' | 'all';

const TAB_ORDER: Tab[] = ['delete', 'update', 'all'];
const TAB_LABELS: Record<Tab, string> = {
  delete: 'سجل الحذف',
  update: 'سجل الاستبدال/التعديل',
  all: 'سجل الحركات الشامل',
};
const RANGE_ORDER: RangeFilter[] = ['today', 'week', 'month', 'all'];
const RANGE_LABELS: Record<RangeFilter, string> = {
  today: 'اليوم',
  week: 'آخر أسبوع',
  month: 'آخر شهر',
  all: 'كل الوقت',
};

/** يحوّل قيمة حقل خامّة إلى نصّ عربيّ مقروء — يعرف بعض الحقول الشائعة، وإلا يعرضها كما هي. */
function formatFieldValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'status' && typeof v === 'string' && v in ATTENDANCE_LABELS) {
    return ATTENDANCE_LABELS[v as keyof typeof ATTENDANCE_LABELS];
  }
  if (field === 'sessionStatus' && typeof v === 'string' && v in SESSION_STATUS_LABELS) {
    return SESSION_STATUS_LABELS[v as keyof typeof SESSION_STATUS_LABELS];
  }
  if (field === 'kind' && typeof v === 'string' && v in RECITATION_KIND_LABELS) {
    return RECITATION_KIND_LABELS[v as keyof typeof RECITATION_KIND_LABELS];
  }
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  return String(v);
}

/**
 * سجل الحركات — تدقيق كامل + حذف ناعم + استعادة (v1.21.0). كل حذف أو
 * استبدال لبيانات حسّاسة يُسجَّل هنا مع لقطة كاملة تسمح باستعادته بضغطة
 * واحدة، إلى الأبد (لا تنظيف تلقائيّ).
 */
@Component({
  selector: 'app-activity-log',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="سجل الحركات" />

    <div class="page">
      <div class="tabs">
        @for (t of tabs; track t) {
          <button [class.active]="tab() === t" (click)="tab.set(t)">{{ tabLabels[t] }}</button>
        }
      </div>

      <div class="range-row">
        @for (r of ranges; track r) {
          <button type="button" class="chip" [class.active]="range() === r" (click)="range.set(r)">
            {{ rangeLabels[r] }}
          </button>
        }
      </div>

      @if (entries() === undefined) {
        <div class="spinner"></div>
      } @else if (filtered().length === 0) {
        <div class="empty"><span class="icon">🗂️</span> لا توجد حركات ضمن هذا الفلتر.</div>
      } @else {
        @for (e of filtered(); track e.id) {
          <div class="card entry">
            <div class="row-between" (click)="toggle(e.id)" style="cursor:pointer">
              <span class="badges">
                <span [class]="'badge b-' + e.action">{{ actionLabels[e.action] }}</span>
                <span class="badge b-target">{{ targetLabels[e.target] }}</span>
              </span>
              <span class="muted" style="font-size:.78rem">{{ dateTimeFull(e.createdAt) }}</span>
            </div>
            <p class="summary">{{ e.summary }}</p>
            @if (e.actorName) {
              <p class="muted" style="margin:2px 0 0;font-size:.78rem">بواسطة: {{ e.actorName }}</p>
            }

            @if (expanded() === e.id && e.fieldChanges?.length) {
              <div class="diff-list">
                @for (c of e.fieldChanges; track c.field) {
                  <div class="diff-row">
                    <span class="diff-label">{{ c.label }}</span>
                    <span class="diff-before">{{ fmtVal(c.field, c.before) }}</span>
                    <span class="diff-arrow">←</span>
                    <span class="diff-after">{{ fmtVal(c.field, c.after) }}</span>
                  </div>
                }
              </div>
            }

            <div class="entry-actions">
              @if (e.action !== 'create' && e.snapshots?.length) {
                @if (e.restoredAt) {
                  <span class="muted restored"
                    >✅ تمّت الاستعادة — {{ dateTimeFull(e.restoredAt) }}</span
                  >
                } @else {
                  <button
                    class="btn btn-ghost"
                    type="button"
                    [disabled]="restoringId() === e.id"
                    (click)="restore(e)"
                  >
                    {{ restoringId() === e.id ? 'جارٍ الاستعادة…' : '↺ استعادة' }}
                  </button>
                }
              }
              @if (e.fieldChanges?.length) {
                <button class="btn btn-ghost" type="button" (click)="toggle(e.id)">
                  {{ expanded() === e.id ? 'إخفاء التفاصيل' : 'عرض التفاصيل ›' }}
                </button>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .range-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 10px 0 14px;
      }
      .entry {
        margin-bottom: 10px;
      }
      .badges {
        display: flex;
        gap: 6px;
      }
      .badge.b-create {
        background: var(--green-tint);
        color: var(--green);
      }
      .badge.b-update {
        background: var(--gold-tint2, #faf4e4);
        color: var(--gold-deep, #a07030);
      }
      .badge.b-delete {
        background: var(--danger-bg, #fbe4e4);
        color: var(--danger);
      }
      .badge.b-target {
        background: var(--surface-2);
        color: var(--text-soft);
      }
      .summary {
        margin: 8px 0 0;
        font-weight: 700;
        line-height: 1.6;
      }
      .diff-list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        border-radius: var(--radius-xs);
        background: var(--surface-2);
      }
      .diff-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.85rem;
      }
      .diff-label {
        font-weight: 700;
        color: var(--text-soft);
        min-width: 90px;
      }
      .diff-before {
        text-decoration: line-through;
        color: var(--danger);
      }
      .diff-after {
        color: var(--green);
        font-weight: 700;
      }
      .diff-arrow {
        opacity: 0.5;
      }
      .entry-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        flex-wrap: wrap;
      }
      .entry-actions .btn {
        padding: 8px 14px;
        font-size: 0.85rem;
      }
      .restored {
        font-weight: 700;
        color: var(--green);
        font-size: 0.85rem;
        align-self: center;
      }
    `,
  ],
})
export class ActivityLogPage {
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly tabs = TAB_ORDER;
  readonly tabLabels = TAB_LABELS;
  readonly ranges = RANGE_ORDER;
  readonly rangeLabels = RANGE_LABELS;
  readonly actionLabels = ACTIVITY_ACTION_LABELS;
  readonly targetLabels = ACTIVITY_TARGET_LABELS;
  readonly dateTimeFull = dateTimeFull;
  readonly fmtVal = formatFieldValue;

  readonly tab = signal<Tab>('delete');
  readonly range = signal<RangeFilter>('all');
  readonly expanded = signal<string | null>(null);
  readonly restoringId = signal<string | null>(null);

  readonly entries = this.data.activityLog(this.destroyRef);

  readonly filtered = computed(() => {
    const tab = this.tab();
    const list = (this.entries() ?? []).filter(
      (e): e is ActivityLogEntry => tab === 'all' || (e.action as ActivityAction) === tab,
    );
    const r = this.range();
    if (r === 'all') return list;
    let cutoff: number;
    if (r === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      cutoff = d.getTime();
    } else if (r === 'week') {
      cutoff = Date.now() - 7 * 86400000;
    } else {
      cutoff = Date.now() - 30 * 86400000;
    }
    return list.filter((e) => e.createdAt >= cutoff);
  });

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  async restore(entry: ActivityLogEntry): Promise<void> {
    const ok = await this.notify.confirm('استعادة هذه الحركة؟', {
      message: entry.summary + ' — سيُعاد كلّ ما تغيّر إلى حالته السابقة تمامًا.',
      confirmText: 'استعادة',
    });
    if (!ok) return;
    this.restoringId.set(entry.id);
    await this.notify.run(() => this.data.restoreActivity(entry.id), {
      loading: 'جارٍ الاستعادة…',
      success: 'تمّت الاستعادة بنجاح',
      error: 'تعذّرت الاستعادة',
    });
    this.restoringId.set(null);
  }
}
