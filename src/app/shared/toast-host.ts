import { Component, inject } from '@angular/core';
import { NotifyService } from '../core/notify.service';

/** حاوية الإشعارات: التوستات + شريط الاتصال + نافذة التأكيد. تُركَّب مرة في الجذر. */
@Component({
  selector: 'app-toast-host',
  template: `
    @if (!notify.online()) {
      <div class="net-banner">وضع دون اتصال — تُحفظ التغييرات وتُزامَن تلقائيًا لاحقًا</div>
    } @else if (notify.syncing()) {
      <div class="net-banner syncing"><span class="dot"></span> جارٍ المزامنة…</div>
    }

    <div class="toast-stack" role="status" aria-live="polite">
      @for (t of notify.toasts(); track t.id) {
        <div class="toast" [class]="'t-' + t.kind" (click)="notify.dismiss(t.id)">
          <span class="ico">
            @switch (t.kind) {
              @case ('success') {
                ✓
              }
              @case ('error') {
                ✕
              }
              @case ('loading') {
                <span class="spin"></span>
              }
              @default {
                ℹ
              }
            }
          </span>
          <span class="msg">{{ t.text }}</span>
        </div>
      }
    </div>

    @if (notify.confirmRequest(); as req) {
      <div class="modal-backdrop" (click)="notify.answerConfirm(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <h3>{{ req.title }}</h3>
          @if (req.message) {
            <p>{{ req.message }}</p>
          }
          <div class="modal-actions">
            <button class="btn btn-ghost" type="button" (click)="notify.answerConfirm(false)">
              إلغاء
            </button>
            <button
              class="btn"
              [class.btn-danger]="req.danger"
              [class.btn-primary]="!req.danger"
              type="button"
              (click)="notify.answerConfirm(true)"
            >
              {{ req.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ToastHostComponent {
  readonly notify = inject(NotifyService);
}
