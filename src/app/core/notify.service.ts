import { Injectable, computed, signal } from '@angular/core';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';

export type ToastKind = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmText: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * إشعارات احترافية: توستات (نجاح/خطأ/معلومة/تحميل)، نوافذ تأكيد،
 * ومؤشّر حالة الاتصال والمزامنة — بديلًا عن alert() و confirm().
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  readonly toasts = signal<Toast[]>([]);
  readonly confirmRequest = signal<ConfirmRequest | null>(null);

  readonly online = signal<boolean>(navigator.onLine);
  private readonly pending = signal(0);
  /** true أثناء وجود عملية حفظ جارية */
  readonly syncing = computed(() => this.pending() > 0);

  private seq = 0;

  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      waitForPendingWrites(db)
        .then(() => this.success('عاد الاتصال واكتملت المزامنة'))
        .catch(() => this.success('عاد الاتصال'));
    });
    window.addEventListener('offline', () => {
      this.online.set(false);
      this.info('لا يوجد اتصال — يعمل التطبيق محليًا وتُحفظ التغييرات مؤقتًا');
    });
  }

  // ---------- توستات ----------
  private push(kind: ToastKind, text: string, ttl: number): number {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    if (ttl > 0) setTimeout(() => this.dismiss(id), ttl);
    return id;
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  success(text: string): void {
    this.push('success', text, 3200);
  }
  error(text: string): void {
    this.push('error', text, 5000);
  }
  info(text: string): void {
    this.push('info', text, 3600);
  }

  /** توست تحميل يبقى حتى استدعاء الدالة المُعادة */
  loading(text = 'جارٍ الحفظ…'): () => void {
    const id = this.push('loading', text, 0);
    return () => this.dismiss(id);
  }

  /**
   * تشغيل عملية غير متزامنة مع مؤشّر تحميل + توست نتيجة.
   * تُعيد النتيجة عند النجاح، أو undefined عند الفشل (مع توست خطأ).
   */
  async run<T>(
    action: () => Promise<T>,
    opts: { loading?: string; success?: string; error?: string } = {},
  ): Promise<T | undefined> {
    const done = this.loading(opts.loading ?? 'جارٍ الحفظ…');
    this.pending.update((n) => n + 1);
    try {
      const result = await action();
      done();
      if (opts.success) this.success(opts.success);
      return result;
    } catch (e) {
      done();
      console.error(e);
      this.error(opts.error ?? mapError(e));
      return undefined;
    } finally {
      this.pending.update((n) => Math.max(0, n - 1));
    }
  }

  // ---------- تأكيد (بديل confirm) ----------
  confirm(
    title: string,
    opts: { message?: string; confirmText?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmRequest.set({
        title,
        message: opts.message,
        confirmText: opts.confirmText ?? 'تأكيد',
        danger: opts.danger ?? false,
        resolve,
      });
    });
  }

  answerConfirm(ok: boolean): void {
    const req = this.confirmRequest();
    if (req) {
      this.confirmRequest.set(null);
      req.resolve(ok);
    }
  }
}

function mapError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('unavailable') || code.includes('network'))
    return 'تعذّر الاتصال — سيُعاد المحاولة تلقائيًا';
  if (code.includes('permission-denied')) return 'لا تملك صلاحية لهذه العملية';
  return 'حدث خطأ، حاول مرة أخرى';
}
