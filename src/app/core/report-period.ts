/* ==========================================================================
   المدى الزمنيّ للتقارير — التقويم الميلاديّ حصرًا.

   كلّ تواريخ المشروع مخزَّنة نصًّا بصيغة «YYYY-MM-DD»، وهي صيغة تجعل
   المقارنة المعجميّة (‎<=‎ / ‎>=‎ بين نصّين) مطابقة تمامًا للمقارنة الزمنيّة —
   فلا حاجة إطلاقًا لتحويل إلى `Date` عند الترشيح، ولا لأيّ اعتبار للمنطقة
   الزمنيّة أو التوقيت الصيفيّ. `Date` تُستعمل هنا فقط لاشتقاق حدود الأسبوع
   والشهر (حساب تقويميّ حقيقيّ)، لا للمقارنة.
   ========================================================================== */

import { dmy, weekdayAr } from './format';

/** نوع المدى — يحدّد شكل مُنتقي المدى في الواجهة وصياغة تسميته. */
export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';

/** مدى زمنيّ مغلق الطرفين: `from` و`to` داخلان في المدى. */
export interface Period {
  kind: PeriodKind;
  /** «YYYY-MM-DD» — أوّل يوم داخل المدى. */
  from: string;
  /** «YYYY-MM-DD» — آخر يوم داخل المدى (داخلٌ فيه). */
  to: string;
}

/** `Date` → «YYYY-MM-DD» بتوقيت الجهاز المحلّيّ (لا UTC — تاريخ الجلسة محلّيّ). */
export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** تاريخ اليوم «YYYY-MM-DD». */
export function todayISO(): string {
  return isoOf(new Date());
}

/** «YYYY-MM-DD» → `Date` عند منتصف ليل التوقيت المحلّيّ. */
function dateOf(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00');
}

/** يوم واحد. */
export function dayPeriod(date: string): Period {
  const d = date.slice(0, 10);
  return { kind: 'day', from: d, to: d };
}

/**
 * الأسبوع الذي يقع فيه التاريخ — من **السبت إلى الجمعة**، وهو ترتيب أيّام
 * الأسبوع المعتمد في التطبيق كلّه (`WEEKDAY_ORDER` يبدأ بـ ٦ = السبت).
 */
export function weekPeriod(anyDateInWeek: string): Period {
  const d = dateOf(anyDateInWeek);
  // getDay(): الأحد ٠ … السبت ٦. المسافة رجوعًا حتى السبت = (getDay() + 1) % 7.
  const back = (d.getDay() + 1) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - back);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { kind: 'week', from: isoOf(start), to: isoOf(end) };
}

/** شهر كامل — يستقبل «YYYY-MM» أو «YYYY-MM-DD». */
export function monthPeriod(ym: string): Period {
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  // اليوم ٠ من الشهر التالي = آخر يوم في هذا الشهر (يعالج ٢٨/٢٩/٣٠/٣١ تلقائيًّا).
  const last = new Date(y, m, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { kind: 'month', from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}

/** سنة كاملة. */
export function yearPeriod(year: string | number): Period {
  const y = Number(String(year).slice(0, 4));
  return { kind: 'year', from: `${y}-01-01`, to: `${y}-12-31` };
}

/** مدى مخصّص — يصحّح ترتيب الطرفين إن أُدخلا معكوسين. */
export function customPeriod(from: string, to: string): Period {
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  return a <= b ? { kind: 'custom', from: a, to: b } : { kind: 'custom', from: b, to: a };
}

/**
 * مدى يشمل كلّ التواريخ الممكنة — للتقرير المرجعيّ «تاريخ الطالب الكامل».
 * الحدّان نصّان خارج أيّ تاريخ واقعيّ، فيمرّ كلّ شيء عبر `inPeriod` بلا استثناء.
 */
export function allTimePeriod(): Period {
  return { kind: 'custom', from: '0000-01-01', to: '9999-12-31' };
}

/** هل التاريخ «YYYY-MM-DD» داخل المدى؟ مقارنة نصّيّة بحتة. */
export function inPeriod(date: string | null | undefined, p: Period): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= p.from && d <= p.to;
}

/** عدد الأيّام التقويميّة في المدى (شاملًا الطرفين). */
export function periodDays(p: Period): number {
  const ms = dateOf(p.to).getTime() - dateOf(p.from).getTime();
  return Math.round(ms / 86400000) + 1;
}

/**
 * تسمية عربيّة للمدى — بأرقام التاريخ لا بأسماء الأشهر، التزامًا بأسلوب
 * `format.ts` المعتمد في المشروع («يوم/شهر/سنة» بأرقام واضحة).
 */
export function periodLabel(p: Period): string {
  switch (p.kind) {
    case 'day':
      return `${weekdayAr(p.from)} ${dmy(p.from)}`;
    case 'week':
      return `أسبوع ${dmy(p.from)} — ${dmy(p.to)}`;
    case 'month':
      return `شهر ${p.from.slice(5, 7)}/${p.from.slice(0, 4)}`;
    case 'year':
      return `سنة ${p.from.slice(0, 4)}`;
    default:
      return p.from === p.to ? dmy(p.from) : `من ${dmy(p.from)} إلى ${dmy(p.to)}`;
  }
}

/** تسمية مختصرة للملفّات المصدَّرة (بلا مسافات ولا محارف ممنوعة في أسماء الملفّات). */
export function periodFileTag(p: Period): string {
  if (p.kind === 'month') return p.from.slice(0, 7);
  if (p.kind === 'year') return p.from.slice(0, 4);
  if (p.from === p.to) return p.from;
  return `${p.from}_${p.to}`;
}

/** إزاحة شهر «YYYY-MM» بعدد أشهر (سالبًا للخلف) — لأزرار «السابق/التالي». */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** إزاحة المدى بأكمله خطوة واحدة للخلف/الأمام بحسب نوعه. */
export function shiftPeriod(p: Period, delta: number): Period {
  switch (p.kind) {
    case 'day': {
      const d = dateOf(p.from);
      d.setDate(d.getDate() + delta);
      return dayPeriod(isoOf(d));
    }
    case 'week': {
      const d = dateOf(p.from);
      d.setDate(d.getDate() + delta * 7);
      return weekPeriod(isoOf(d));
    }
    case 'month':
      return monthPeriod(shiftMonth(p.from.slice(0, 7), delta));
    case 'year':
      return yearPeriod(Number(p.from.slice(0, 4)) + delta);
    default: {
      // مدى مخصّص: يُزاح بطوله كاملًا حتى لا تتداخل المدَيات المتتالية.
      const len = periodDays(p);
      const a = dateOf(p.from);
      const b = dateOf(p.to);
      a.setDate(a.getDate() + delta * len);
      b.setDate(b.getDate() + delta * len);
      return customPeriod(isoOf(a), isoOf(b));
    }
  }
}
