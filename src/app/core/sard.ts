/* ==========================================================================
   تحليل حالة السرد لطالب — يُستخدم في لوحة «السرد» وصفحة سرد الطالب.
   ========================================================================== */

import { scoreOf, type SerdRecord, type Student } from './models';
import { JUZ_SURAHS, completedJuz, juzOfBlock } from './quran-data';

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

const JUZ_PAGES = 20;

export function analyzeSard(student: Student, allSerds: readonly SerdRecord[]): SardAnalysis {
  const mem = student.memorizedSurahs ?? [];
  const memSet = new Set(mem);
  const completed = completedJuz(mem);
  const completedSet = new Set(completed);

  const mine = allSerds.filter((s) => s.studentId === student.id);
  const juzSerds = mine.filter((s) => s.scope === 'juz');
  const blockSerds = mine.filter((s) => s.scope === 'block');

  const revisedSet = new Set(juzSerds.map((s) => s.juz));
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
    else if (bj.every((j) => revisedSet.has(j))) readyBlocks.push(b);
  }

  const nearJuz: { juz: number; have: number; total: number }[] = [];
  JUZ_SURAHS.forEach((list, i) => {
    const have = list.filter((n) => memSet.has(n)).length;
    const missing = list.length - have;
    if (have > 0 && missing > 0 && missing <= 2) {
      nearJuz.push({ juz: i + 1, have, total: list.length });
    }
  });

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
  JUZ_SURAHS.forEach((list, i) => {
    const have = list.filter((n) => memSet.has(n)).length;
    if (have === 0 || have === list.length) return;
    const fraction = have / list.length;
    if (fraction > bestFraction) {
      bestFraction = fraction;
      currentJuz = { juz: i + 1, fraction, pages: Math.round(fraction * JUZ_PAGES) };
    }
  });

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
