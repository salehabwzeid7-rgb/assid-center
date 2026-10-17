/* ==========================================================================
   مصحف المدينة — من الآيات إلى الأوجه. طبقة نقيّة (بلا Angular ولا Firestore).

   الوجه = ١٥ سطرًا. لكلّ آية «كتلة» بالأسطر مأخوذة من موضع كلماتها الفعليّ في المصحف
   (راجع mushaf-data.ts)، فآية قصيرة تتوسّط سطرًا تأخذ جزءًا منه لا سطرًا كاملًا، ومجموع
   آيات أيّ مقطع يعطي عدد أسطره بدقّة. أسطر اسم السورة والبسملة لا تُحسب.

   التقريب (للمجاميع والعرض فقط): الأسطر الزائدة عن الأوجه الكاملة تُقرَّب هكذا —
     ٠–١ سطر ← لا شيء · ٢–٥ ← ربع وجه · ٦–١١ ← نصف وجه · ١٢ فأكثر ← وجه كامل.
   فلا يظهر في أيّ تقرير إلّا «عدد صحيح» أو معه «ربع» أو «نصف».
   ========================================================================== */

import { AYAH_LINES_X1000 } from './mushaf-data';
import { JUZ_START, SURAHS } from './quran-data';

/** أسطر الوجه الواحد في مصحف المدينة. */
export const LINES_PER_PAGE = 15;

/** إزاحة أوّل آية في كلّ سورة ضمن ترتيب القرآن الكلّيّ (الفهرس = رقم السورة). */
const OFFSETS: number[] = (() => {
  const out: number[] = [0, 0];
  let acc = 0;
  for (const s of SURAHS) {
    out[s.n] = acc;
    acc += s.ayahs;
  }
  return out;
})();

/** عدد آيات السورة، أو 0 إن لم تكن السورة صالحة. */
export function ayahCount(surah: number): number {
  return SURAHS[surah - 1]?.ayahs ?? 0;
}

/** فهرس الآية في ترتيب القرآن الكلّيّ (٠..٦٢٣٥)، أو -1 إن لم تكن صالحة. */
export function ayahIndex(surah: number, ayah: number): number {
  const n = ayahCount(surah);
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || ayah < 1 || ayah > n) return -1;
  return OFFSETS[surah] + ayah - 1;
}

/** كتلة آية بالأسطر. */
export function ayahLines(index: number): number {
  return (AYAH_LINES_X1000[index] ?? 0) / 1000;
}

/**
 * فهارس آيات مقطع من (سورة، آية) إلى (سورة، آية) شاملًا الطرفين، بترتيب المصحف.
 * فارغة إن كان أيّ طرف غير صالح أو كانت النهاية قبل البداية.
 */
export function rangeIndexes(
  fromSurah: number,
  fromAyah: number,
  toSurah: number,
  toAyah: number,
): number[] {
  const a = ayahIndex(fromSurah, fromAyah);
  const b = ayahIndex(toSurah, toAyah);
  if (a < 0 || b < 0 || b < a) return [];
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** مقطع داخل سورة واحدة (نفس `AyahSegment` في models). */
interface Seg {
  surah: number;
  from: number;
  to: number;
}

/** فهارس آيات مقاطع بحسب السور — يتجاهل المقطع غير الصالح (لا يكسر الحساب). */
export function segmentIndexes(segments: readonly Seg[]): number[] {
  const out: number[] = [];
  for (const g of segments) out.push(...rangeIndexes(g.surah, g.from, g.surah, g.to));
  return out;
}

/**
 * المقاطع الافتراضيّة لتسميع **بترتيب سور عكسيّ** (`toSurah` قبل `fromSurah` في المصحف):
 * سورة البداية من آية البداية إلى آخرها، والسور بينهما كاملة، وسورة النهاية من آية ١
 * إلى آية النهاية. مثال: من النبأ ١ إلى الإنسان ٣١ ← النبأ ١–٤٠، المرسلات ١–٥٠، الإنسان ١–٣١.
 * فارغة إن لم يكن الترتيب عكسيًّا. الآيات داخل كلّ سورة تصاعديّة دائمًا.
 */
export function descendingSegments(
  fromSurah: number,
  fromAyah: number,
  toSurah: number,
  toAyah: number,
): Seg[] {
  if (!(fromSurah > toSurah) || toSurah < 1 || fromSurah > 114) return [];
  const out: Seg[] = [];
  for (let s = fromSurah; s >= toSurah; s--) {
    const max = ayahCount(s);
    out.push({
      surah: s,
      from: s === fromSurah ? Math.min(Math.max(1, fromAyah), max) : 1,
      to: s === toSurah ? Math.min(Math.max(1, toAyah), max) : max,
    });
  }
  return out;
}

/** «النبأ 1-40، المرسلات 1-50، الإنسان 1-31» — لعرض مقطع بمقاطعه في التقارير. */
export function segmentsText(segments: readonly Seg[], nameOf: (surah: number) => string): string {
  return segments.map((g) => `${nameOf(g.surah)} ${g.from}-${g.to}`).join('، ');
}

/** مجموع أسطر مجموعة آيات. */
export function linesOf(indexes: Iterable<number>): number {
  let sum = 0;
  for (const i of indexes) sum += ayahLines(i);
  return sum;
}

/** يحوّل أسطرًا إلى أوجه بقاعدة التقريب أعلاه: عدد صحيح + (٠ أو ربع أو نصف) أو وجه إضافيّ. */
export function pagesFromLines(lines: number): number {
  if (!(lines > 0)) return 0;
  const whole = Math.floor(lines / LINES_PER_PAGE + 1e-9);
  const rest = Math.round(lines - whole * LINES_PER_PAGE);
  const extra = rest <= 1 ? 0 : rest <= 5 ? 0.25 : rest <= 11 ? 0.5 : 1;
  return whole + extra;
}

const FRACTION_WORDS: Record<number, string> = { 0.25: 'ربع', 0.5: 'نصف', 0.75: 'ثلاثة أرباع' };

/** «وجه واحد» · «وجهان» · «٣ أوجه» … «١٠ أوجه» · «١١ وجهًا» — صياغة عربيّة سليمة للعدد الصحيح. */
function wholeWithUnit(n: number): string {
  if (n === 1) return 'وجه واحد';
  if (n === 2) return 'وجهان';
  return n <= 10 ? `${n} أوجه` : `${n} وجهًا`;
}

/**
 * «10 وربع» · «10 ونصف» · «ربع» · «نصف» · «10». الكسر بالكلمات لا بالرموز: خطّ PDF لا
 * يحوي ¼ ½ فتختفي. `withUnit` يُلحِق الوحدة للنصوص الجارية: «10 أوجه وربع» · «ربع وجه».
 */
export function pagesText(pages: number, withUnit = false): string {
  const p = Math.max(0, Math.round(pages * 4) / 4);
  const whole = Math.floor(p);
  const word = FRACTION_WORDS[p - whole];
  if (whole === 0) {
    if (!word) return withUnit ? 'لا أوجه' : '0';
    return withUnit ? `${word} وجه` : word;
  }
  const base = withUnit ? wholeWithUnit(whole) : String(whole);
  return word ? `${base} و${word}` : base;
}

/* --------------------------------------------------------------------------
   تقدّم الجزء الجاري — بالأسطر الفعليّة لا بعدد السور
   -------------------------------------------------------------------------- */

/** مقاطع جزء بحسب السور: [{سورة، من آية، إلى آية}] — الجزء قد يبدأ أو ينتهي وسط سورة. */
export function juzSegments(juz: number): { surah: number; from: number; to: number }[] {
  const start = JUZ_START[juz - 1];
  if (!start) return [];
  const next = JUZ_START[juz];
  // آخر آية في الجزء: قبل بداية التالي مباشرةً (أو نهاية سورة الناس للجزء الأخير).
  const endSurah = next ? (next[1] > 1 ? next[0] : next[0] - 1) : 114;
  const endAyah = next ? (next[1] > 1 ? next[1] - 1 : ayahCount(next[0] - 1)) : ayahCount(114);
  const out: { surah: number; from: number; to: number }[] = [];
  for (let s = start[0]; s <= endSurah; s++) {
    out.push({
      surah: s,
      from: s === start[0] ? start[1] : 1,
      to: s === endSurah ? endAyah : ayahCount(s),
    });
  }
  return out;
}

const JUZ_INDEX_CACHE = new Map<number, readonly number[]>();

/** فهارس كلّ آيات الجزء (١..٣٠) بترتيب المصحف — مخزَّنة بعد أوّل حساب. */
export function juzIndexes(juz: number): readonly number[] {
  let list = JUZ_INDEX_CACHE.get(juz);
  if (!list) {
    list = juzSegments(juz).flatMap((seg) => rangeIndexes(seg.surah, seg.from, seg.surah, seg.to));
    JUZ_INDEX_CACHE.set(juz, list);
  }
  return list;
}

/**
 * تقدّم حفظ جزء بالآيات: نسبة ما حُفِظ من أسطره، وما يقابلها من «٢٠ صفحة» (الجزء = ٢٠ صفحة
 * اسميًّا). بوزن كلّ آية في المصحف لا بعدد السور (طالب حفظ ١٨ سورة قصيرة من جزء عمّ كان
 * يظهر عنده ١٠/٢٠ وهي نحو ٨ صفحات فقط).
 */
export function juzProgress(
  juz: number,
  memorizedAyahs: ReadonlySet<number>,
): { fraction: number; pages: number; have: number; total: number } {
  const idx = juzIndexes(juz);
  let total = 0;
  let done = 0;
  let have = 0;
  for (const i of idx) {
    const l = ayahLines(i);
    total += l;
    if (memorizedAyahs.has(i)) {
      done += l;
      have++;
    }
  }
  const fraction = total > 0 ? done / total : 0;
  // حفظ شيء من الجزء لا يُعرَض «٠/٢٠» أبدًا — أقلّه صفحة واحدة.
  const pages = fraction > 0 ? Math.max(1, Math.round(fraction * 20)) : 0;
  return { fraction, pages, have, total: idx.length };
}
