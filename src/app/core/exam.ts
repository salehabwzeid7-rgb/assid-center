/* ==========================================================================
   تحليل حالة الاختبار لطالب — يُستخدم في لوحة «السرد والاختبار» وصفحة اختبار الطالب.

   التسلسل الدقيق: حفظ الجزء ← سرده ← اجتياز نسبة النجاح في سرده ← عندئذٍ
   فقط يُفتح اختباره الفرديّ (اختبار جزء مكتمل الحفظ لم يُسرَد وينجح فيه بعدُ
   يبقى مقفلًا). وبعد اجتياز سرد ٣ أجزاء متتالية كلٍّ على حدة يُفتح السرد
   المجمّع لتلك الكتلة (في core/sard.ts)؛ وبعد اجتياز ذلك السرد المجمّع نفسه
   يُفتح اختبارها المجمّع — لا قبل ذلك، وبصرف النظر عن عدد الاختبارات
   الفرديّة المُنجَزة لأجزائها.
   ========================================================================== */

import { SARD_PASS, scoreOf, type ExamRecord, type SerdRecord, type Student } from './models';
import { JUZ_SURAHS, completedJuz, juzOfBlock } from './quran-data';

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
  /** أجزاء مكتملة الحفظ اختُبر كلٌّ منها مرّة على الأقلّ (اختبار فرديّ) */
  examinedJuz: number[];
  /** أجزاء اجتازت نسبة نجاح السرد — الشرط الوحيد لفتح اختبارها الفرديّ */
  sardPassedJuz: number[];
  /** أجزاء مكتملة الحفظ لم تجتز السرد بعد — اختبارها يبقى مقفلًا */
  awaitingSardJuz: number[];
  /** أجزاء اجتازت السرد ولم تُختبر بعد فرديًّا — اختبارها مفتوح الآن */
  pendingJuz: number[];
  /** كتل (٣ أجزاء) جاهزة للاختبار المجمّع (اجتاز السرد المجمّع لتلك الكتلة نفسه) */
  readyBlocks: number[];
  /** كتل أُنجز اختبارها المجمّع */
  doneBlocks: number[];
  /** أجزاء يوشك الطالب على إكمال حفظها (ناقصها سورة أو سورتان) */
  nearJuz: { juz: number; have: number; total: number }[];
  examCount: number;
  /** متوسّط درجة كلّ الاختبارات (فرديّة ومجمّعة معًا) (٠..١٠٠) */
  avgScore: number | null;
  /** آخر درجة اختبار فرديّ لكلّ جزء (٠..١٠٠) للعرض التفصيليّ */
  juzLastScore: Map<number, number>;
  /** عدد محاولات الاختبار الفرديّ لكلّ جزء */
  juzAttempts: Map<number, number>;
  category: ExamCategory;
  /** عدد ما على الطالب اختباره (أجزاء لم تُختبر + كتل جاهزة للاختبار المجمّع) */
  pendingCount: number;
  /**
   * الجزء الجاري حفظه الآن + تقدّمه (الجزء = ٢٠ صفحة).
   * أقرب جزء جزئيّ إلى الاكتمال؛ null إن لم يوجد جزء جزئيّ.
   */
  currentJuz: { juz: number; fraction: number; pages: number } | null;
}

const JUZ_PAGES = 20;

export function analyzeExam(
  student: Student,
  allExams: readonly ExamRecord[],
  allSerds: readonly SerdRecord[],
): ExamAnalysis {
  const mem = student.memorizedSurahs ?? [];
  const memSet = new Set(mem);
  const completed = completedJuz(mem);
  const completedSet = new Set(completed);

  const mine = allExams.filter((e) => e.studentId === student.id);
  const juzExams = mine.filter((e) => (e.scope ?? 'juz') === 'juz');
  const blockExams = mine.filter((e) => e.scope === 'block');

  // آخر درجة وعدد المحاولات لكلّ جزء (اختبار فرديّ فقط — المصدر مرتَّب
  // تنازليًّا زمنيًّا فأوّل ظهور هو الأحدث)
  const juzLastScore = new Map<number, number>();
  const juzAttempts = new Map<number, number>();
  for (const e of juzExams) {
    if (!juzLastScore.has(e.juz)) juzLastScore.set(e.juz, scoreOf(e));
    juzAttempts.set(e.juz, (juzAttempts.get(e.juz) ?? 0) + 1);
  }

  const examinedSet = new Set(juzExams.map((e) => e.juz));
  const examinedJuz = completed.filter((j) => examinedSet.has(j));

  // فتح اختبار الجزء الفرديّ مشروط باجتياز نسبة النجاح في سرده — وليس مجرّد
  // اكتمال حفظه. محاولة سرد مسجَّلة دون بلوغ العتبة لا تفتح الاختبار.
  const mySerds = allSerds.filter((s) => s.studentId === student.id);
  const sardJuzRecords = mySerds.filter((s) => s.scope === 'juz');
  const sardBlockRecords = mySerds.filter((s) => s.scope === 'block');
  const sardAttemptsByJuz = new Map<number, SerdRecord[]>();
  for (const s of sardJuzRecords) {
    const arr = sardAttemptsByJuz.get(s.juz);
    if (arr) arr.push(s);
    else sardAttemptsByJuz.set(s.juz, [s]);
  }
  const sardPassedSet = new Set<number>();
  for (const [juz, list] of sardAttemptsByJuz) {
    if (list.some((r) => scoreOf(r) >= SARD_PASS)) sardPassedSet.add(juz);
  }
  const sardPassedJuz = completed.filter((j) => sardPassedSet.has(j));
  const awaitingSardJuz = completed.filter((j) => !sardPassedSet.has(j));
  const pendingJuz = sardPassedJuz.filter((j) => !examinedSet.has(j));

  // الاختبار المجمّع: يُفتح فقط بعد اجتياز السرد المجمّع لتلك الكتلة نفسه —
  // بصرف النظر عن عدد الاختبارات الفرديّة المُنجَزة لأجزائها.
  const sardBlockPassedSet = new Set<number>();
  const sardBlockAttempts = new Map<number, SerdRecord[]>();
  for (const s of sardBlockRecords) {
    const arr = sardBlockAttempts.get(s.juz);
    if (arr) arr.push(s);
    else sardBlockAttempts.set(s.juz, [s]);
  }
  for (const [block, list] of sardBlockAttempts) {
    if (list.some((r) => scoreOf(r) >= SARD_PASS)) sardBlockPassedSet.add(block);
  }

  const doneBlockSet = new Set(blockExams.map((e) => e.juz));
  const readyBlocks: number[] = [];
  const doneBlocks: number[] = [];
  for (let b = 1; b <= 10; b++) {
    const bj = juzOfBlock(b);
    if (!bj.every((j) => completedSet.has(j))) continue;
    if (doneBlockSet.has(b)) doneBlocks.push(b);
    else if (sardBlockPassedSet.has(b)) readyBlocks.push(b);
  }

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

  const pendingCount = pendingJuz.length + readyBlocks.length;
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
    sardPassedJuz,
    awaitingSardJuz,
    pendingJuz,
    readyBlocks,
    doneBlocks,
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
