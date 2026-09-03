/* ==========================================================================
   تحليل حالة السرد لطالب — يُستخدم في لوحة «السرد» وصفحة سرد الطالب.
   ========================================================================== */

import { GRADE_VALUE, gradeFromValue, type Grade, type SerdRecord, type Student } from './models';
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
  /** متوسّط تقدير كلّ عمليّات السرد */
  avgGrade: Grade | null;
  /** آخر تقدير سرد لكلّ جزء (للعرض التفصيليّ) */
  juzLastGrade: Map<number, Grade>;
  category: SardCategory;
  /** عدد ما على الطالب سرده (أجزاء غير مسرودة + كتل جاهزة) */
  pendingCount: number;
}

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

  // آخر تقدير لكلّ جزء (المصدر مرتَّب تنازليًّا زمنيًّا فأوّل ظهور هو الأحدث)
  const juzLastGrade = new Map<number, Grade>();
  for (const s of juzSerds) if (!juzLastGrade.has(s.juz)) juzLastGrade.set(s.juz, s.grade);

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

  const gradeVals = mine.map((s) => GRADE_VALUE[s.grade]);
  const avgGrade = gradeVals.length
    ? gradeFromValue(gradeVals.reduce((a, b) => a + b, 0) / gradeVals.length)
    : null;

  const pendingCount = unrevisedJuz.length + readyBlocks.length;
  let category: SardCategory;
  if (completed.length === 0) category = 'none';
  else if (mine.length === 0) category = 'not_revised';
  else if (pendingCount > 0) category = 'due';
  else category = 'revised';

  return {
    completedJuz: completed,
    revisedJuz,
    unrevisedJuz,
    readyBlocks,
    doneBlocks,
    nearJuz,
    serdCount: mine.length,
    avgGrade,
    juzLastGrade,
    category,
    pendingCount,
  };
}
