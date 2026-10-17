/* ==========================================================================
   المحفوظ بالآيات — مصدر الحقيقة لاكتمال الأجزاء. طبقة نقيّة.

   الجزء «مكتمل» حين تكون **كلّ آياته** محفوظة، لا حين تُحفَظ سوره (فالجزء الأوّل = الفاتحة
   + البقرة حتى ١٤١، والبقرة تمتدّ لثلاثة أجزاء). والمحفوظ يجمع ثلاثة مصادر:
     • سور كاملة أُدخلت يدويًّا (`Student.memorizedSurahs`) — بيانات أوّليّة.
     • أجزاء كاملة أُدخلت يدويًّا (`Student.memorizedJuz`) — بيانات أوّليّة.
     • آيات نجح فيها الطالب «حفظًا جديدًا» في الحلقات (من سجلّ التسميع، كلّ الجلسات).
   ========================================================================== */

import type { RecitationRecord, Student } from './models';
import { ayahCount, juzIndexes, juzProgress, rangeIndexes } from './mushaf';
import { previouslyMemorized } from './new-memorization';

/** فهارس كلّ آيات سورة. */
function surahIndexes(surah: number): number[] {
  return rangeIndexes(surah, 1, surah, ayahCount(surah));
}

/** كلّ آيات الطالب المحفوظة: البيانات الأوّليّة (سور/أجزاء) + ما نجح فيه من التسميع. */
export function memorizedAyahs(
  student: Pick<Student, 'memorizedSurahs' | 'memorizedJuz'> | null | undefined,
  recs: readonly RecitationRecord[] = [],
): Set<number> {
  const out = previouslyMemorized(recs);
  for (const s of student?.memorizedSurahs ?? []) for (const i of surahIndexes(s)) out.add(i);
  for (const j of student?.memorizedJuz ?? []) for (const i of juzIndexes(j)) out.add(i);
  return out;
}

/** الأجزاء المكتملة حفظًا (كلّ آياتها) بترتيبها. */
export function completedJuzOf(ayahs: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (let j = 1; j <= 30; j++) {
    if (juzIndexes(j).every((i) => ayahs.has(i))) out.push(j);
  }
  return out;
}

/** تغطية جزء: كم آية حُفِظت من كم، ونسبتها بالأسطر. */
export function juzCoverage(
  juz: number,
  ayahs: ReadonlySet<number>,
): { have: number; total: number; fraction: number; pages: number; complete: boolean } {
  const p = juzProgress(juz, ayahs);
  return { ...p, complete: p.total > 0 && p.have === p.total };
}

/** السور (من بين المذكورة) التي حُفِظت كلّ آياتها. */
export function coveredSurahs(surahs: Iterable<number>, ayahs: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const s of new Set(surahs)) {
    const idx = surahIndexes(s);
    if (idx.length > 0 && idx.every((i) => ayahs.has(i))) out.push(s);
  }
  return out.sort((a, b) => a - b);
}
