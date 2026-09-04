/* ==========================================================================
   تحليل حالة الاختبار لطالب — يُستخدم في لوحة «السرد والاختبار» وصفحة اختبار الطالب.

   الاختبار مستقلّ لكلّ جزء: كلّ جزء مكتمل الحفظ ولم يُختبر = مطلوب اختباره،
   بلا أيّ منطق كتل مجمّعة (٣ أجزاء) كما في السرد.
   ========================================================================== */

import { scoreOf, type ExamRecord, type Student } from './models';
import { JUZ_SURAHS, completedJuz } from './quran-data';

/** تصنيف الطالب في لوحة الاختبار (الطلاب بلا أجزاء مكتملة = 'none' فلا يظهرون). */
export type ExamCategory = 'examined' | 'not_examined' | 'due' | 'none';

export const EXAM_CATEGORY_LABELS: Record<Exclude<ExamCategory, 'none'>, string> = {
  examined: 'الطلاب الذين اختُبروا',
  not_examined: 'الطلاب الذين لم يُختبروا',
  due: 'طلاب عليهم اختبار',
};

export interface ExamAnalysis {
  /** أجزاء مكتملة الحفظ */
  completedJuz: number[];
  /** أجزاء مكتملة الحفظ اختُبر كلٌّ منها مرّة على الأقلّ */
  examinedJuz: number[];
  /** أجزاء مكتملة الحفظ لم تُختبر بعد (كلّ جزء مستقلّ) */
  pendingJuz: number[];
  /** أجزاء يوشك الطالب على إكمال حفظها (ناقصها سورة أو سورتان) */
  nearJuz: { juz: number; have: number; total: number }[];
  examCount: number;
  /** متوسّط درجة كلّ الاختبارات (٠..١٠٠) */
  avgScore: number | null;
  /** آخر درجة اختبار لكلّ جزء (٠..١٠٠) للعرض التفصيليّ */
  juzLastScore: Map<number, number>;
  /** عدد محاولات الاختبار لكلّ جزء */
  juzAttempts: Map<number, number>;
  category: ExamCategory;
  /** عدد الأجزاء التي على الطالب اختبارها (= pendingJuz.length) */
  pendingCount: number;
  /**
   * الجزء الجاري حفظه الآن + تقدّمه (الجزء = ٢٠ صفحة).
   * أقرب جزء جزئيّ إلى الاكتمال؛ null إن لم يوجد جزء جزئيّ.
   */
  currentJuz: { juz: number; fraction: number; pages: number } | null;
}

const JUZ_PAGES = 20;

export function analyzeExam(student: Student, allExams: readonly ExamRecord[]): ExamAnalysis {
  const mem = student.memorizedSurahs ?? [];
  const memSet = new Set(mem);
  const completed = completedJuz(mem);

  const mine = allExams.filter((e) => e.studentId === student.id);

  // آخر درجة وعدد المحاولات لكلّ جزء (المصدر مرتَّب تنازليًّا زمنيًّا فأوّل ظهور هو الأحدث)
  const juzLastScore = new Map<number, number>();
  const juzAttempts = new Map<number, number>();
  for (const e of mine) {
    if (!juzLastScore.has(e.juz)) juzLastScore.set(e.juz, scoreOf(e));
    juzAttempts.set(e.juz, (juzAttempts.get(e.juz) ?? 0) + 1);
  }

  const examinedSet = new Set(mine.map((e) => e.juz));
  const examinedJuz = completed.filter((j) => examinedSet.has(j));
  const pendingJuz = completed.filter((j) => !examinedSet.has(j));

  const nearJuz: { juz: number; have: number; total: number }[] = [];
  JUZ_SURAHS.forEach((list, i) => {
    const have = list.filter((n) => memSet.has(n)).length;
    const missing = list.length - have;
    if (have > 0 && missing > 0 && missing <= 2) {
      nearJuz.push({ juz: i + 1, have, total: list.length });
    }
  });

  const scores = mine.map((e) => scoreOf(e));
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const pendingCount = pendingJuz.length;
  let category: ExamCategory;
  if (completed.length === 0) category = 'none';
  else if (mine.length === 0) category = 'not_examined';
  else if (pendingCount > 0) category = 'due';
  else category = 'examined';

  // الجزء الجاري: أقرب جزء جزئيّ إلى الاكتمال (١ = مكتمل)، والتقدّم بصيغة صفحات من ٢٠.
  let currentJuz: ExamAnalysis['currentJuz'] = null;
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
    examinedJuz,
    pendingJuz,
    nearJuz,
    examCount: mine.length,
    avgScore,
    juzLastScore,
    juzAttempts,
    category,
    pendingCount,
    currentJuz,
  };
}
