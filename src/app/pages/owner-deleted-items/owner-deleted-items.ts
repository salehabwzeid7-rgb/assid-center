import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dateTimeFull } from '../../core/format';
import { ACTIVITY_TARGET_LABELS, type ActivityLogEntry } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

/** سجلّ محذوفات كل المعلّمين — للمالك فقط. استعادة كل عنصر تعيده لصاحبه الأصليّ تحديدًا. */
@Component({
  selector: 'app-owner-deleted-items',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="سجلّ المحذوفات — كل المعلّمين" />

    <div class="page">
      @if (items() === undefined) {
        <div class="spinner"></div>
      } @else if (items()!.length === 0) {
        <div class="empty"><span class="icon">🗑️</span> لا يوجد شيء محذوف بعد.</div>
      } @else {
        @for (e of items(); track e.id) {
          <div class="card entry">
            <div class="row-between">
              <span class="badge">{{ targetLabel(e.target) }}</span>
              <span class="muted" style="font-size:.76rem">{{ dateTimeFull(e.createdAt) }}</span>
            </div>
            <p style="margin:6px 0">{{ e.summary }}</p>
            <p class="muted" style="margin:0 0 8px;font-size:.78rem">
              بواسطة: {{ e.actorName || '—' }}
            </p>
            @if (e.restoredAt) {
              <span class="muted restored"
                >✅ تمّت الاستعادة — {{ dateTimeFull(e.restoredAt) }}</span
              >
            } @else if (e.snapshots?.length) {
              <button
                class="btn btn-ghost btn-block"
                type="button"
                [disabled]="restoringId() === e.id"
                (click)="restore(e)"
              >
                {{ restoringId() === e.id ? 'جارٍ الاستعادة…' : '↺ استعادة' }}
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .entry {
        margin-bottom: 10px;
      }
      .restored {
        font-size: 0.8rem;
        color: var(--green);
        font-weight: 700;
      }
    `,
  ],
})
export class OwnerDeletedItemsPage {
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly items = this.data.platformDeletedItems(this.destroyRef);
  readonly restoringId = signal<string | null>(null);
  readonly dateTimeFull = dateTimeFull;

  targetLabel(t: string): string {
    return ACTIVITY_TARGET_LABELS[t as keyof typeof ACTIVITY_TARGET_LABELS] ?? t;
  }

  async restore(entry: ActivityLogEntry): Promise<void> {
    const ok = await this.notify.confirm('استعادة هذا العنصر لصاحبه الأصليّ؟', {
      confirmText: 'استعادة',
    });
    if (!ok) return;
    this.restoringId.set(entry.id);
    await this.notify.run(() => this.data.restorePlatformDeletedItem(entry.id), {
      loading: 'جارٍ الاستعادة…',
      success: 'تمّت الاستعادة بنجاح',
      error: 'تعذّرت الاستعادة',
    });
    this.restoringId.set(null);
  }
}
