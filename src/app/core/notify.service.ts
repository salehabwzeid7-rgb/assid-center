import { Injectable, computed, signal } from '@angular/core';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';

export type ToastKind = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** عدد مرّات تكرّر الرسالة نفسها (١ = مرّة واحدة، فلا يُعرَض عدّاد). */
  count: number;
}

/** أقصى عدد توستات مرئيّة معًا — ما زاد يُسقِط أقدمها. */
const MAX_TOASTS = 4;

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
  /** مؤقّت الإخفاء لكلّ توست — يُعاد ضبطه عند تكرار الرسالة نفسها. */
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * رسالة متطابقة مع واحدة معروضة الآن تزيد عدّادها بدل أن تُكدّس نسخةً جديدة.
   *
   * لماذا: أيّ خلل عامّ (انقطاع شبكة أو رفض صلاحيّات) يُفشِل كلّ مستمعي Firestore
   * دفعةً واحدة، فكانت الشاشة تمتلئ بستّ نسخ من الرسالة نفسها تحجب المحتوى
   * ولا تضيف معلومة واحدة زائدة (رُصد فعليًّا أثناء اختبار الواجهة).
   */
  private push(kind: ToastKind, text: string, ttl: number): number {
    const existing = this.toasts().find((t) => t.kind === kind && t.text === text);
    if (existing) {
      this.toasts.update((list) =>
        list.map((t) => (t.id === existing.id ? { ...t, count: t.count + 1 } : t)),
      );
      this.arm(existing.id, ttl);
      return existing.id;
    }
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, text, count: 1 }].slice(-MAX_TOASTS));
    this.arm(id, ttl);
    return id;
  }

  private arm(id: number, ttl: number): void {
    const prev = this.timers.get(id);
    if (prev) clearTimeout(prev);
    if (ttl > 0)
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), ttl),
      );
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
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

  /**
   * يتحقّق يدويًّا من اكتمال مزامنة كلّ التغييرات المحفوظة محلّيًّا مع خادم
   * Firestore (`waitForPendingWrites`) — مفيد بعد حادثة فقدان بيانات لتأكيد
   * وصول أيّ تغييرات معلّقة على جهاز بعينه، خصوصًا بعد انقطاع اتصال. يُحدّ
   * الانتظار بمهلة حتى لا يُعلَّق الزرّ للأبد إن كان الجهاز فعليًّا بلا اتصال.
   */
  async checkSync(timeoutMs = 15000): Promise<'synced' | 'timeout'> {
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), timeoutMs),
    );
    const synced = waitForPendingWrites(db).then(() => 'synced' as const);
    return Promise.race([synced, timeout]);
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
