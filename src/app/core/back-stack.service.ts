import { DestroyRef, Injectable, effect, inject, untracked } from '@angular/core';

/**
 * مكدّس الطبقات المفتوحة فوق الصفحة (نوافذ منبثقة، معاينة صورة، تأكيد).
 *
 * الطبقات ليست مسارات، فزرّ الرجوع في أندرويد كان يتجاوزها ويُرجِع الصفحة كلّها
 * — من معاينة صورة التقرير إلى الرئيسيّة مباشرةً. «رجوع» يجب أن يعني خطوة واحدة:
 * إغلاق آخر طبقة فُتحت، ثمّ الصفحة السابقة حين لا تبقى طبقة.
 */
@Injectable({ providedIn: 'root' })
export class BackStackService {
  private readonly stack: { close: () => void }[] = [];

  push(close: () => void): { close: () => void } {
    const entry = { close };
    this.stack.push(entry);
    return entry;
  }

  remove(entry: { close: () => void }): void {
    const i = this.stack.lastIndexOf(entry);
    if (i >= 0) this.stack.splice(i, 1);
  }

  /** يُغلق أحدث طبقة مفتوحة. `false` إن لم تكن هناك طبقة — فيُترَك الرجوع للمسار. */
  closeTop(): boolean {
    const top = this.stack.pop();
    if (!top) return false;
    top.close();
    return true;
  }
}

/**
 * يربط طبقة بزرّ الرجوع: ما دام `isOpen()` صحيحًا فالرجوع يستدعي `close()`
 * بدل مغادرة الصفحة. يُستدعى داخل سياق حقن (منشئ مكوّن أو تهيئة حقل).
 */
export function closeOnBack(isOpen: () => boolean, close: () => void): void {
  const back = inject(BackStackService);
  let entry: { close: () => void } | null = null;
  const drop = () => {
    if (entry) back.remove(entry);
    entry = null;
  };
  effect(() => {
    const open = isOpen();
    untracked(() => {
      if (open && !entry) entry = back.push(() => (drop(), close()));
      else if (!open) drop();
    });
  });
  inject(DestroyRef).onDestroy(drop);
}
