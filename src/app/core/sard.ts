/* ==========================================================================
   تحليل حالة السرد لطالب — يُستخدم في لوحة «السرد» وصفحة سرد الطالب.
   ========================================================================== */

import { SARD_PASS, scoreOf, type SerdRecord, type Student } from './models';
import { juzIndexes, ayahLines } from './mushaf';
import { completedJuzOf, juzCoverage } from './memorized';
import { juzOfBlock } from './quran-data';

/** أسطر الجزء بالمصحف — لقياس ما تبقّى منه. */
const juzLines = (j: number): number => juzIndexes(j).reduce((a, i) => a + ayahLines(i), 0);

/** تصنيف الطالب في لوحة السرد (الطلاب بلا أجزاء مكتملة = 'none' فلا يظهرون). */
export type SardCategory = 'revised' | 'not_revised' | 'due' | 'none';

export const SARD_CATEGORY_LABELS: Record<Exclude<SardCategory, 'none'>, string> = {
  revised: 'الطلاب الذين سردوا',
  not_revised: 'الطلاب الذين لم يسردوا',
  due: 'طلاب عليهم سرد',
};

export interface SardAnalysis {
  completedJuz: number[];
  /** أجزاء مكتملة الحفظ سُرِد كلٌّ منها مرّة على الأقلّ */
  revisedJuz: number[];
  /** أجزاء مكتملة الحفظ لم تُسرد بعد */
  unrevisedJuz: number[];
  /** كتل (٣ أجزاء) جاهزة للسرد المجمّع المطلوب */
  readyBlocks: number[];
  /** كتل أُنجز سردها المجمّع */
  doneBlocks: number[];
  /** أجزاء يوشك الطالب على إكمال حفظها (ناقصها سورة أو سورتان) */
  nearJuz: { juz: number; have: number; total: number }[];
  serdCount: number;
  /** متوسّط درجة كلّ عمليّات السرد (٠..١٠٠) */
  avgScore: number | null;
  /** آخر درجة سرد لكلّ جزء (٠..١٠٠) للعرض التفصيليّ */
  juzLastScore: Map<number, number>;
  category: SardCategory;
  /** عدد ما على الطالب سرده (أجزاء غير مسرودة + كتل جاهزة) */
  pendingCount: number;
  /**
   * الجزء الجاري حفظه الآن + تقدّمه (الجزء = ٢٠ صفحة).
   * أقرب جزء جزئيّ إلى الاكتمال؛ null إن لم يوجد جزء جزئيّ.
   */
  currentJuz: { juz: number; fraction: number; pages: number } | null;
}

/**
 * @param memorized آيات الطالب المحفوظة (`memorizedAyahs` في core/memorized.ts): بيانات أوّليّة +
 *   ما نجح فيه من التسميع — اكتمال الجزء بالآيات لا بالسور.
 */
export function analyzeSard(
  student: Student,
  allSerds: readonly SerdRecord[],
  memorized: ReadonlySet<number>,
): SardAnalysis {
  const completed = completedJuzOf(memorized);
  const completedSet = new Set(completed);

  const mine = allSerds.filter((s) => s.studentId === student.id);
  const juzSerds = mine.filter((s) => s.scope === 'juz');
  const blockSerds = mine.filter((s) => s.scope === 'block');

  // «مسرود» = اجتاز نسبة النجاح فعليًّا في محاولة واحدة على الأقلّ — محاولة
  // مسجَّلة دون بلوغ العتبة لا تُحسَب سردًا مكتملًا (يبقى الجزء «مطلوبًا»).
  const juzAttemptsByNumber = new Map<number, typeof juzSerds>();
  for (const s of juzSerds) {
    const arr = juzAttemptsByNumber.get(s.juz);
    if (arr) arr.push(s);
    else juzAttemptsByNumber.set(s.juz, [s]);
  }
  const revisedSet = new Set<number>();
  for (const [juz, list] of juzAttemptsByNumber) {
    if (list.some((r) => scoreOf(r) >= SARD_PASS)) revisedSet.add(juz);
  }
  const revisedJuz = completed.filter((j) => revisedSet.has(j));
  const unrevisedJuz = completed.filter((j) => !revisedSet.has(j));

  // آخر درجة لكلّ جزء (المصدر مرتَّب تنازليًّا زمنيًّا فأوّل ظهور هو الأحدث)
  const juzLastScore = new Map<number, number>();
  for (const s of juzSerds) if (!juzLastScore.has(s.juz)) juzLastScore.set(s.juz, scoreOf(s));

  const doneBlockSet = new Set(blockSerds.map((s) => s.juz));
  const readyBlocks: number[] = [];
  const doneBlocks: number[] = [];
  for (let b = 1; b <= 10; b++) {
    const bj = juzOfBlock(b);
    if (!bj.every((j) => completedSet.has(j))) continue;
    if (doneBlockSet.has(b)) doneBlocks.push(b);
    else readyBlocks.push(b);
  }

  // «يوشك على الإكمال»: بدأ الجزء ولم يكتمل ويبقى منه ما لا يتجاوز ٣٠ سطرًا (وجهان).
  const nearJuz: { juz: number; have: number; total: number }[] = [];
  for (let j = 1; j <= 30; j++) {
    const cov = juzCoverage(j, memorized);
    if (cov.have > 0 && !cov.complete && (1 - cov.fraction) * juzLines(j) <= 30) {
      nearJuz.push({ juz: j, have: cov.have, total: cov.total });
    }
  }

  const scores = mine.map((s) => scoreOf(s));
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const pendingCount = unrevisedJuz.length + readyBlocks.length;
  let category: SardCategory;
  if (completed.length === 0) category = 'none';
  else if (mine.length === 0) category = 'not_revised';
  else if (pendingCount > 0) category = 'due';
  else category = 'revised';

  // الجزء الجاري: أقرب جزء جزئيّ إلى الاكتمال (١ = مكتمل)، والتقدّم بصيغة صفحات من ٢٠.
  let currentJuz: SardAnalysis['currentJuz'] = null;
  let bestFraction = -1;
  for (let j = 1; j <= 30; j++) {
    const cov = juzCoverage(j, memorized);
    if (cov.have === 0 || cov.complete) continue;
    // بوزن أسطر الآيات في مصحف المدينة لا بعدد السور (راجع juzProgress).
    if (cov.fraction > bestFraction) {
      bestFraction = cov.fraction;
      currentJuz = { juz: j, fraction: cov.fraction, pages: cov.pages };
    }
  }

  return {
    completedJuz: completed,
    revisedJuz,
    unrevisedJuz,
    readyBlocks,
    doneBlocks,
    nearJuz,
    serdCount: mine.length,
    avgScore,
    juzLastScore,
    category,
    pendingCount,
    currentJuz,
  };
}
