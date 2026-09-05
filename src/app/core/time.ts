/* ==========================================================================
   التوقيت — التخزين الداخليّ دائمًا بصيغة 24 ساعة «HH:MM».
   العرض للمستخدم بصيغة 12 ساعة + ص/م.
   ========================================================================== */

export const MINUTE_STEPS = [0, 15, 30, 45] as const;
export type Period = 'am' | 'pm';

export const PERIOD_LABEL: Record<Period, string> = { am: 'ص', pm: 'م' };
export const PERIOD_LABEL_LONG: Record<Period, string> = { am: 'صباحي', pm: 'مسائي' };

/** ساعة بصيغة 12: h من 1 إلى 12 */
export interface Clock12 {
  h: number;
  m: number;
  period: Period;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidHHMM(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function to24({ h, m, period }: Clock12): string {
  let h24 = h % 12;
  if (period === 'pm') h24 += 12;
  return `${pad(h24)}:${pad(m)}`;
}

export function to12(hhmm: string): Clock12 {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    h: h % 12 === 0 ? 12 : h % 12,
    m: m || 0,
    period: h >= 12 ? 'pm' : 'am',
  };
}

/** «18:30» → «6:30 م» */
export function fmt12(hhmm: string | null | undefined): string {
  if (!isValidHHMM(hhmm)) return '';
  const { h, m, period } = to12(hhmm);
  return `${h}:${pad(m)} ${PERIOD_LABEL[period]}`;
}

/** «6:00 م – 7:00 م» */
export function fmtRange(from?: string | null, to?: string | null): string {
  if (!isValidHHMM(from) || !isValidHHMM(to)) return '';
  return `${fmt12(from)} – ${fmt12(to)}`;
}

/* ---------- نافذة فتح الحصّة ---------- */

export type WindowState = 'unscheduled' | 'before' | 'now' | 'after';

export interface SessionWindow {
  state: WindowState;
  opensAt?: Date;
  closesAt?: Date;
}

/** يحسب حالة نافذة الحصّة بالنسبة للحظة now (توقيت الجهاز المحلّي). */
export function sessionWindow(
  s: { date: string; fromTime?: string | null; toTime?: string | null },
  now: Date = new Date(),
): SessionWindow {
  if (!isValidHHMM(s.fromTime) || !isValidHHMM(s.toTime)) return { state: 'unscheduled' };
  const opensAt = new Date(`${s.date}T${s.fromTime}:00`);
  const closesAt = new Date(`${s.date}T${s.toTime}:00`);
  const t = now.getTime();
  if (t < opensAt.getTime()) return { state: 'before', opensAt, closesAt };
  if (t > closesAt.getTime()) return { state: 'after', opensAt, closesAt };
  return { state: 'now', opensAt, closesAt };
}

/** «بعد ساعتين و١٥ دقيقة» — تقريب لطيف بالعربية */
export function untilLabel(target: Date, now: Date = new Date()): string {
  let mins = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  if (mins < 1) return 'خلال لحظات';
  const days = Math.floor(mins / 1440);
  mins -= days * 1440;
  const hrs = Math.floor(mins / 60);
  mins -= hrs * 60;
  // تصريف عربيّ: 1 مفرد · 2 مثنّى · 3-10 جمع · 11+ مفرد منصوب
  const word = (n: number, one: string, two: string, few: string, many: string) =>
    n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const parts: string[] = [];
  if (days) parts.push(word(days, 'يوم', 'يومين', 'أيام', 'يومًا'));
  if (hrs) parts.push(word(hrs, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'));
  if (mins && !days) parts.push(word(mins, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'));
  return 'بعد ' + parts.join(' و');
}
