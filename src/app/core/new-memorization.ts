/* ==========================================================================
   أوجه الحفظ الجديد — الحساب الدقيق. طبقة نقيّة (بلا Angular ولا Firestore).

   ما يُحسب «حفظًا جديدًا»:
     • تسميع **فعليّ** من نوع «حفظ جديد» (لا «لم يسمّع» ولا تأجيل ولا مراجعة).
     • ناجح: درجته ٩٠ فأكثر (`TASMIE_PASS`). الرسوب لا يُحسب ولا يُعدّ مسمَّعًا.
     • **الآيات الجديدة فقط**: آية سبق أن نجح فيها الطالب (في أيّ جلسة وأيّ يوم وأيّ
       حلقة، منذ أوّل يوم في البرنامج) لا تُحسب مرّة ثانية بأيّ حال.

   ما لا يُحسب: المحفوظ الأوّليّ المُدخَل في بيانات الطالب (لم يُسمَّع في حلقة)، والمراجعة،
   والسرد، والاختبار. الحفظ الجديد يُعرَف من سجلّ التسميع وحده.

   رقم المعلّم له الأولويّة: إن حدّد المعلّم أوجه التسميع بنفسه (`recitedPages`) اعتُمد رقمه
   (بشرط النجاح ووجود آيات جديدة)، وإلّا حُسب من أسطر الآيات الجديدة في المصحف.
   ========================================================================== */

import { TASMIE_PASS, isActualRecitation, kindOf, scoreOf, type RecitationRecord } from './models';
import {
  LINES_PER_PAGE,
  ayahCount,
  linesOf,
  pagesFromLines,
  rangeIndexes,
  segmentIndexes,
} from './mushaf';

/**
 * فهارس آيات مقطع التسميع (فارغة إن كان المقطع غير صالح). بالمقاطع بحسب السور إن وُجدت
 * (ترتيب سور عكسيّ أو تعديل المعلّم)، وإلّا من بداية إلى نهاية متّصلة تصاعديًّا.
 */
export function recitationIndexes(r: RecitationRecord): number[] {
  return r.segments?.length
    ? segmentIndexes(r.segments)
    : rangeIndexes(r.fromSurah, r.fromAyah, r.toSurah, r.toAyah);
}

/** آخر آية في التسميع: نهاية آخر مقطع إن وُجدت المقاطع، وإلّا (toSurah، toAyah). */
export function recitationEnd(r: RecitationRecord): { surah: number; ayah: number } {
  const last = r.segments?.length ? r.segments[r.segments.length - 1] : null;
  return last ? { surah: last.surah, ayah: last.to } : { surah: r.toSurah, ayah: r.toAyah };
}

/** اتّجاه ترتيب السور: تصاعديّ (١٠٠ ← ١٠١) أو تنازليّ (١٠٠ ← ٩٩). */
export type MemorizeDirection = 'asc' | 'desc';

/**
 * يفهم اتّجاه حفظ الطالب من تسميعاته «حفظ جديد»: بتسميعه الأخير إن امتدّ بين سورتين، وإلّا
 * بمقارنة سورة نهايته بآخر تسميع سبقه انتهى في سورة أخرى. `null` إن لم يكفِ ما سُجِّل (أوّل
 * تسميع، أو كلّ تسميعاته في سورة واحدة) — فيعرض التطبيق الخيارين على المعلّم.
 */
export function inferDirection(history: readonly RecitationRecord[]): MemorizeDirection | null {
  const news = history
    .filter((r) => isActualRecitation(r) && kindOf(r) === 'new')
    .sort(chronological);
  const last = news[news.length - 1];
  if (!last) return null;
  const end = recitationEnd(last).surah;
  const start = last.segments?.length ? last.segments[0].surah : last.fromSurah;
  if (start !== end) return end > start ? 'asc' : 'desc';
  for (let i = news.length - 2; i >= 0; i--) {
    const prev = recitationEnd(news[i]).surah;
    if (prev !== end) return end > prev ? 'asc' : 'desc';
  }
  return null;
}

/** ما يقترحه التطبيق بعد تسميع: متابعة السورة، أو سورة تالية/سابقة، أو اختيار المعلّم. */
export type NextStep =
  | { type: 'continue'; surah: number; ayah: number }
  | { type: 'surah'; surah: number }
  | { type: 'choose'; next: number | null; prev: number | null }
  | { type: 'end'; direction: MemorizeDirection };

/**
 * الخطوة التالية بعد تسميع ناجح. داخل السورة تتابع الآيات دائمًا من الآية التالية (في أيّ
 * اتجاه)؛ وعند نهاية السورة يُنظَر اتّجاه الطالب: تصاعديّ ← السورة التالية، تنازليّ ← السابقة،
 * وغير معلوم ← يختار المعلّم بين الاثنتين.
 */
export function nextStep(last: RecitationRecord, direction: MemorizeDirection | null): NextStep {
  const end = recitationEnd(last);
  if (end.ayah < ayahCount(end.surah)) {
    return { type: 'continue', surah: end.surah, ayah: end.ayah + 1 };
  }
  const next = end.surah < 114 ? end.surah + 1 : null;
  const prev = end.surah > 1 ? end.surah - 1 : null;
  if (direction === 'asc')
    return next ? { type: 'surah', surah: next } : { type: 'end', direction };
  if (direction === 'desc') {
    return prev ? { type: 'surah', surah: prev } : { type: 'end', direction };
  }
  return { type: 'choose', next, prev };
}

/** حفظ جديد فعليّ ناجح — وحده يدخل حساب الأوجه. */
export function isPassingNew(r: RecitationRecord): boolean {
  return isActualRecitation(r) && kindOf(r) === 'new' && scoreOf(r) >= TASMIE_PASS;
}

/** الترتيب الزمنيّ: التاريخ ثمّ وقت الإنشاء (محاولات اليوم الواحد بترتيبها). */
function chronological(a: RecitationRecord, b: RecitationRecord): number {
  return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
}

export interface NewPagesCredit {
  /** مجموع الأسطر المعتمدة (لم يُقرَّب بعد). */
  lines: number;
  /**
   * مجموع أوجه التسميعات، كلّ تسميع مقرَّب على حدة (أو رقم المعلّم كما هو) ثمّ تُجمع —
   * فيطابق المجموعُ في التقرير الأرقامَ التي رآها المعلّم في كلّ تسميع (ربع + نصف = ٣ أرباع).
   */
  pages: number;
  /** الأسطر المعتمدة لكلّ تسميع على حدة (معرّف السجلّ ← أسطر) — لا يحوي إلّا ما اعتُمد فعلًا. */
  byRecord: Map<string, number>;
  /** أوجه كلّ تسميع على حدة بعد التقريب (أو رقم المعلّم) — المعروض في التقارير. */
  pagesByRecord: Map<string, number>;
}

/**
 * أوجه الحفظ الجديد لطالب واحد.
 *
 * @param all كلّ تسميعات الطالب منذ البداية (كلّ الحلقات) — لازمة لمعرفة ما سبق حفظه.
 * @param include أيّ تسميع يُحتسَب في النتيجة (المدى الزمنيّ، الحلقة…). التسميعات
 *   الأخرى تُستعمل فقط لتحديد الآيات المحفوظة سابقًا.
 */
export function creditNewPages(
  all: readonly RecitationRecord[],
  include: (r: RecitationRecord) => boolean = () => true,
): NewPagesCredit {
  const seen = new Set<number>();
  const byRecord = new Map<string, number>();
  const pagesByRecord = new Map<string, number>();
  let lines = 0;
  let pages = 0;
  for (const r of [...all].filter(isPassingNew).sort(chronological)) {
    const fresh = recitationIndexes(r).filter((i) => !seen.has(i));
    for (const i of recitationIndexes(r)) seen.add(i);
    if (fresh.length === 0 || !include(r)) continue;
    const teacher = typeof r.recitedPages === 'number' && r.recitedPages >= 0;
    const credited = teacher ? (r.recitedPages as number) * LINES_PER_PAGE : linesOf(fresh);
    const recPages = teacher ? (r.recitedPages as number) : pagesFromLines(credited);
    byRecord.set(r.id, credited);
    pagesByRecord.set(r.id, recPages);
    lines += credited;
    pages += recPages;
  }
  return { lines, pages, byRecord, pagesByRecord };
}

/**
 * الآيات التي حفظها الطالب سابقًا (نجح فيها حفظًا جديدًا) قبل تسميع بعينه. يُمرَّر `before`
 * عند تعديل تسميع قائم فلا تُحسَب عليه ما بعده ولا هو نفسه، و`undefined` لتسميع جديد.
 */
export function previouslyMemorized(
  history: readonly RecitationRecord[],
  before?: { id: string; date: string; createdAt: number },
): Set<number> {
  const seen = new Set<number>();
  for (const r of history) {
    if (!isPassingNew(r)) continue;
    if (before) {
      if (r.id === before.id) continue;
      if (chronological(r, before as RecitationRecord) >= 0) continue;
    }
    for (const i of recitationIndexes(r)) seen.add(i);
  }
  return seen;
}

/** الآيات الجديدة من مقطع (غير المحفوظة سابقًا) وأسطرها — أساس الرقم المقترح للمعلّم. */
export function freshPart(
  indexes: readonly number[],
  seen: ReadonlySet<number>,
): { fresh: number[]; lines: number; pages: number } {
  const fresh = indexes.filter((i) => !seen.has(i));
  const lines = linesOf(fresh);
  return { fresh, lines, pages: pagesFromLines(lines) };
}
