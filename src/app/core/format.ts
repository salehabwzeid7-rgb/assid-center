import { WEEKDAY_LABELS } from './models';

/* ==========================================================================
   تنسيق التواريخ — أرقام لاتينية واضحة (يوم/شهر/سنة) بدل أسماء الأشهر.
   المدخلات دائمًا بصيغة ISO «YYYY-MM-DD».
   ========================================================================== */

/** «2026-09-02» → «02/09/2026» */
export function dmy(date: string | null | undefined): string {
  if (!date || date.length < 10) return date ?? '';
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** «2026-09-02» → «02/09» */
export function dm(date: string | null | undefined): string {
  if (!date || date.length < 10) return date ?? '';
  const [, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** رقم اليوم من الشهر: «2026-09-02» → «02» */
export function dayNum(date: string | null | undefined): string {
  return date && date.length >= 10 ? date.slice(8, 10) : '';
}

/** اسم يوم الأسبوع بالعربية من سلسلة تاريخ ISO */
export function weekdayAr(date: string | null | undefined): string {
  if (!date || date.length < 10) return '';
  return WEEKDAY_LABELS[new Date(date + 'T00:00:00').getDay()] ?? '';
}

/** تسمية مختصرة نسبية: اليوم / غدًا / أمس، وإلا «02/09/2026» */
export function relativeDay(date: string, todayStr: string): string {
  if (date === todayStr) return 'اليوم';
  const t = new Date(todayStr + 'T00:00:00').getTime();
  const d = new Date(date + 'T00:00:00').getTime();
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return 'غدًا';
  if (diff === -1) return 'أمس';
  return dmy(date);
}
