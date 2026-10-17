/* ==========================================================================
   تحليل حالة الاختبار لطالب — يُستخدم في لوحة «السرد والاختبار» وصفحة اختبار الطالب.

   **لا ترابط بين الاختبار والسرد**: الشرط الوحيد لاختبار أيّ جزء هو اكتمال حفظه — يُختبَر
   دون أن يُسرَد. والاختبار المجمّع لكتلة (٣ أجزاء ثابتة: ١–٣، ٤–٦، … ٢٨–٣٠) متاح متى
   اكتمل حفظ أجزائها الثلاثة، بلا شرط سرد ولا اختبارات فرديّة. وكذلك السرد (core/sard.ts).
   ========================================================================== */

import { SARD_PASS, scoreOf, type ExamRecord, type SerdRecord, type Student } from './models';
import { juzIndexes, ayahLines } from './mushaf';
import { completedJuzOf, juzCoverage } from './memorized';
import { juzOfBlock } from './quran-data';

/** أسطر الجزء بالمصحف — لقياس ما تبقّى منه. */
const juzLines = (j: number): number => juzIndexes(j).reduce((a, i) => a + ayahLines(i), 0);

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
  /** أجزاء اجتازت نسبة نجاح السرد — معلومة للعرض فقط، لا شرط لاختبار الجزء */
  sardPassedJuz: number[];
  /** @deprecated لا ترابط بين الاختبار والسرد — فارغ دائمًا (يبقى للتوافق) */
  awaitingSardJuz: number[];
  /** أجزاء مكتملة الحفظ لم تُختبر بعد فرديًّا — اختبارها مفتوح الآن */
  pendingJuz: number[];
  /** كتل (٣ أجزاء) اكتمل حفظها ولم يُنجَز اختبارها المجمّع بعد */
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

/**
 * @param memorized آيات الطالب المحفوظة (`memorizedAyahs` في core/memorized.ts): بيانات أوّليّة +
 *   ما نجح فيه من التسميع — اكتمال الجزء بالآيات لا بالسور.
 */
export function analyzeExam(
  student: Student,
  allExams: readonly ExamRecord[],
  allSerds: readonly SerdRecord[],
  memorized: ReadonlySet<number>,
): ExamAnalysis {
  const completed = completedJuzOf(memorized);
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
  // لا ترابط: لا جزء «ينتظر السرد» — يبقى الحقل (فارغًا) لتوافق من يقرؤه.
  const awaitingSardJuz: number[] = [];
  const pendingJuz = completed.filter((j) => !examinedSet.has(j));

  // الاختبار المجمّع: متاح متى اكتمل حفظ أجزاء الكتلة الثلاثة — لا علاقة له بالسرد.
  const doneBlockSet = new Set(blockExams.map((e) => e.juz));
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
