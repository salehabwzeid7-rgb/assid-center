/* ==========================================================================
   طبقة حساب التقارير — نقيّة تمامًا: بلا Angular، بلا Firestore، بلا DOM.

   تستقبل سجلّات جاهزة (`ReportSource`) ومدًى زمنيًّا (`Period`)، وتُخرِج كائن
   تقرير مكتمل الحساب. لا تعرف من أين جاءت السجلّات ولا كيف ستُعرَض — وهذا
   العزل مقصود ويخدم ثلاثة أغراض:

     ١) المصدِّرات الثلاثة (نصّ · صورة · PDF) تستهلك **نفس** الكائن المحسوب،
        فيستحيل أن تتباين الأرقام بين نسخة وأخرى من التقرير نفسه.
     ٢) طبقة الجلب قابلة للاستبدال لاحقًا (قراءة بمدى تاريخيّ + فهرس مركّب)
        دون لمس سطر واحد هنا ولا في الواجهة.
     ٣) قابلة للاختبار بأرقام مُختلَقة قبل وجود أيّ شاشة.

   تفرقة جوهريّة: **حلقات التحفيظ وحلقات التجويد لهما مخرَجان مختلفان
   بنيويًّا** (`kind: 'hifz' | 'tajweed'`)، فوق حساب حضور مشترك واحد. حلقة
   التجويد لا تلتقط تسميعًا ولا تقييمًا إطلاقًا، فتقريرها = حضور + نتائج
   اختبارات التجويد **بعلامتها الفعليّة** لا غير.
   ========================================================================== */

import {
  ATTENDANCE_LABELS,
  EXAM_PASS,
  EXAM_SCOPE_LABELS,
  RECITATION_KIND_LABELS,
  SARD_PASS,
  SERD_SCOPE_LABELS,
  TASMIE_PASS,
  passLabel,
  ratingLabel,
  isActualRecitation,
  isTajweedCircle,
  scoreOf,
  studentCircleIds,
  tajweedExamVerdict,
  type AttendanceRecord,
  type AttendanceStatus,
  type Circle,
  type ExamRecord,
  type RecitationRecord,
  type SerdRecord,
  type Session,
  type Student,
  type TajweedExam,
  type TajweedExamResult,
} from './models';
import { pagesFromLines, segmentsText } from './mushaf';
import { creditNewPages } from './new-memorization';
import { surahName } from './quran-data';
import { inPeriod, isoOf, todayISO, type Period } from './report-period';

/* --------------------------------------------------------------------------
   المدخلات
   -------------------------------------------------------------------------- */

/** كلّ السجلّات التي قد يحتاجها أيّ تقرير — تُمرَّر كاملة، ويُرشِّح الباني ما يخصّه. */
export interface ReportSource {
  circles: readonly Circle[];
  students: readonly Student[];
  sessions: readonly Session[];
  attendance: readonly AttendanceRecord[];
  recitations: readonly RecitationRecord[];
  serd: readonly SerdRecord[];
  exams: readonly ExamRecord[];
  tajweedExams: readonly TajweedExam[];
  tajweedResults: readonly TajweedExamResult[];
}

/** مصدر فارغ — حالة التحميل الأوّليّ، حتى لا تتعامل الواجهة مع `undefined`. */
export const EMPTY_SOURCE: ReportSource = {
  circles: [],
  students: [],
  sessions: [],
  attendance: [],
  recitations: [],
  serd: [],
  exams: [],
  tajweedExams: [],
  tajweedResults: [],
};

/* --------------------------------------------------------------------------
   قواعد مشتركة — مصدر الحقيقة الوحيد
   -------------------------------------------------------------------------- */

/**
 * حصيلة يوم واحد لطالب واحد — التعريف المعتمد لمعنى «أنجز» في كلّ التقارير:
 * تسميع فعليّ، أو سرد أو اختبار في اليوم نفسه.
 *
 * ⚠️ **دَين تقنيّ قائم:** `session.ts` ما زالت تحمل نسختها الخاصّة من هذه
 * القاعدة (`sameDayActivities`) ولم تُحوَّل بعدُ إلى هنا. النسختان متطابقتان
 * اليوم، لكنّ تعديل إحداهما وحدها يجعل تقرير الجلسة يقول «أنجز» ويقول التقرير
 * الشهريّ «يوم ضائع» عن اليوم نفسه. أيّ تغيير في القاعدة يجب أن يطال الاثنتين
 * حتى تُوحَّدا فعليًّا.
 */
export type DayOutcome =
  /** سمّع تسميعًا فعليًّا */
  | 'recited'
  /** لا تسميع، لكن له سرد في اليوم نفسه */
  | 'sard'
  /** لا تسميع، لكن له اختبار جزء في اليوم نفسه */
  | 'exam'
  /** أُجِّل التسميع باتّفاق — ليس تقصيرًا */
  | 'postponed'
  /** المعلّم سجّل صراحةً أنّه لم يسمّع */
  | 'not_recited'
  /** حاضر ولا سجلّ تسميع إطلاقًا — ثغرة تسجيل عند المعلّم، لا تقصير من الطالب */
  | 'no_record'
  /** حضر حصّة في حلقة تجويد — لا تسميع فيها أصلًا، فليست ثغرة تسجيل */
  | 'tajweed'
  | 'excused'
  | 'absent';

export const DAY_OUTCOME_LABELS: Record<DayOutcome, string> = {
  recited: 'سمّع',
  sard: 'سرد',
  exam: 'اختبار',
  postponed: 'مؤجَّل',
  not_recited: 'لم يسمّع',
  no_record: 'حاضر بلا تسجيل',
  tajweed: 'حصّة التجويد',
  excused: 'مأذون له',
  absent: 'غائب',
};

/** هل هذه الحصيلة تُحتسَب إنجازًا؟ (السرد والاختبار إنجاز كالتسميع تمامًا) */
export function isProductive(o: DayOutcome): boolean {
  return o === 'recited' || o === 'sard' || o === 'exam';
}

/** هل الطالب حاضر بدنيًّا؟ (المأذون له غائب بعذر — لا يُحتسَب يومًا ضائعًا) */
function isAttending(s: AttendanceStatus | undefined): boolean {
  return s === 'present' || s === 'late';
}

/**
 * سجلّ حضور واحد لكلّ (طالب، حلقة، تاريخ) — يُبقي الأحدث إنشاءً. مكرّرة هنا
 * عمدًا من `DataService`: الطبقة النقيّة يجب ألّا تفترض أنّ من ناداها نظّف
 * المدخلات. الحلقة جزء من المفتاح لأنّ طالب التحفيظ والتجويد يحضر حصّتين في
 * اليوم نفسه أحيانًا، ولكلّ حصّة سجلّها.
 */
function dedupeAttendance(rows: readonly AttendanceRecord[]): AttendanceRecord[] {
  const byKey = new Map<string, AttendanceRecord>();
  for (const a of rows) {
    const key = `${a.studentId}_${a.circleId}_${a.date}`;
    const prev = byKey.get(key);
    if (!prev || a.createdAt > prev.createdAt) byKey.set(key, a);
  }
  return [...byKey.values()];
}

/** عدّاد حضور — يخدم نوعَي الحلقات بلا اختلاف، فلا تتباين النسبة بينهما أبدًا. */
export interface AttendanceTally {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** مجموع الأيّام المسجَّلة (حاضر + متأخّر + مأذون + غائب) */
  recorded: number;
  /** نسبة الحضور ٠..١٠٠ — (حاضر + متأخّر) ÷ المسجَّل. `null` إن لا سجلّ. */
  rate: number | null;
}

function emptyTally(): AttendanceTally {
  return { present: 0, late: 0, excused: 0, absent: 0, recorded: 0, rate: null };
}

function finishTally(t: AttendanceTally): AttendanceTally {
  t.recorded = t.present + t.late + t.excused + t.absent;
  t.rate = t.recorded ? Math.round(((t.present + t.late) / t.recorded) * 100) : null;
  return t;
}

function tallyOf(rows: readonly AttendanceRecord[]): AttendanceTally {
  const t = emptyTally();
  for (const a of rows) {
    if (a.status === 'present') t.present++;
    else if (a.status === 'late') t.late++;
    else if (a.status === 'excused') t.excused++;
    else if (a.status === 'absent') t.absent++;
  }
  return finishTally(t);
}

function sumTallies(list: readonly AttendanceTally[]): AttendanceTally {
  const t = emptyTally();
  for (const x of list) {
    t.present += x.present;
    t.late += x.late;
    t.excused += x.excused;
    t.absent += x.absent;
  }
  return finishTally(t);
}

/** وصف عربيّ موجز للحضور: «١٢ حاضر · ٢ متأخّر · ١ غائب» (يتخطّى الأصفار). */
export function tallyLabel(t: AttendanceTally): string {
  const parts: string[] = [];
  if (t.present) parts.push(`${t.present} ${ATTENDANCE_LABELS.present}`);
  if (t.late) parts.push(`${t.late} ${ATTENDANCE_LABELS.late}`);
  if (t.excused) parts.push(`${t.excused} ${ATTENDANCE_LABELS.excused}`);
  if (t.absent) parts.push(`${t.absent} ${ATTENDANCE_LABELS.absent}`);
  return parts.join(' · ') || 'لا سجلّ حضور';
}

/**
 * الحضور كسرًا: «٤/٥» = جلسات حضرها (حاضر + متأخّر) من الجلسات المنعقدة في المدى.
 * المأذون له غائب في هذا العدّ. المقام هو عدد جلسات الحلقة التي انعقدت فعلًا،
 * ولا ينزل عن عدد السجلّات المسجَّلة للطالب حتى لا يظهر بسط أكبر من المقام.
 * بلا فراغات حول «/» عمدًا: الفراغ داخل نصّ عربيّ قد يقلب ترتيب الطرفين.
 */
export function attFraction(att: AttendanceTally, held: number): string {
  return fracText(fracOf(att, held));
}

/** كسر الحضور بطرفيه — يُجمَع للإجماليّات (مجموع ما حضروه من مجموع المستحَقّ). */
export interface AttFrac {
  attended: number;
  total: number;
}

export function fracOf(att: AttendanceTally, held: number): AttFrac {
  return { attended: att.present + att.late, total: Math.max(held, att.recorded) };
}

export function sumFrac(list: readonly AttFrac[]): AttFrac {
  return list.reduce((a, f) => ({ attended: a.attended + f.attended, total: a.total + f.total }), {
    attended: 0,
    total: 0,
  });
}

/** «١٤٢/١٦٠» أو «—» حين لا حصص ولا سجلّات. */
export function fracText(f: AttFrac): string {
  return f.total === 0 ? '—' : `${f.attended}/${f.total}`;
}

/**
 * عدد الحصص المنعقدة فعلًا — حصّة واحدة لكلّ (حلقة، تاريخ). حصص قديمة أُنشئت
 * بمعرّف عشوائيّ قد تتعايش مع حصّة بالمعرّف الثابت لليوم نفسه (راجع
 * `DataService.studentAttendance`)، فعدّ المستندات كما هي يضخّم المقام: «٤/١١».
 * المجدولة لم تُعقَد بعد فلا تدخل.
 */
export function countHeldSessions(
  sessions: readonly Session[],
  keep: (s: Session) => boolean = () => true,
): number {
  const keys = new Set<string>();
  for (const s of sessions) {
    if (s.status !== 'scheduled' && keep(s)) keys.add(`${s.circleId}_${s.date.slice(0, 10)}`);
  }
  return keys.size;
}

/**
 * تاريخ بدء عدّ الحصص لطالب في سياق «كلّ المدّة» (ملفّه، إحصائيّات الحلقة):
 * يوم إضافته للنظام، أو أوّل سجلّ حضور له إن كان أقدم. فارغ = لا قصّ.
 * (تقارير الفترات لا تقصّ: المقام فيها كلّ حصص الفترة، بطلب صريح.)
 */
export function joinDateOf(
  student: Pick<Student, 'createdAt'>,
  records: readonly { date: string }[],
): string {
  const dates = records.map((r) => r.date.slice(0, 10));
  if (student.createdAt) dates.push(isoOf(new Date(student.createdAt)));
  return dates.length ? dates.sort()[0] : '';
}

/**
 * كسر حضور طالب على «كلّ المدّة» داخل حلقات بعينها، من يوم التحاقه:
 * حضر (حاضر + متأخّر) من الحصص المنعقدة في حلقاته منذ `joinDateOf`.
 */
export function lifetimeAttFrac(
  student: Pick<Student, 'createdAt'>,
  records: readonly AttendanceRecord[],
  sessions: readonly Session[],
  circleIds: readonly string[],
): AttFrac {
  const from = joinDateOf(student, records);
  const ids = new Set(circleIds);
  const held = countHeldSessions(
    sessions,
    (s) => ids.has(s.circleId) && (!from || s.date.slice(0, 10) >= from),
  );
  return fracOf(tallyOf(records), held);
}

/** متوسّط مقرَّب، أو `null` إن كانت القائمة فارغة — لا نُرجِع صفرًا، فالصفر يُقرأ رسوبًا. */
function avg(values: readonly number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** عدد الأيّام بين تاريخَين «YYYY-MM-DD» (لا يقلّ عن صفر). */
function daysBetweenISO(from: string, to: string): number {
  const a = new Date(from.slice(0, 10) + 'T00:00:00').getTime();
  const b = new Date(to.slice(0, 10) + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/* --------------------------------------------------------------------------
   فهرسة المصدر ضمن مدًى وحلقة — تُحسب مرّة وتُعاد استعمالها
   -------------------------------------------------------------------------- */

interface ScopedData {
  circle: Circle;
  students: Student[];
  sessions: Session[];
  /** الجلسات التي انعقدت فعلًا (مفتوحة أو مغلقة) — المجدولة لم تُعقَد بعد. */
  heldSessions: Session[];
  /** الحصص المنعقدة بلا تكرار (حلقة، تاريخ) — مقام كسر الحضور. */
  heldCount: number;
  attendance: AttendanceRecord[];
  recitations: RecitationRecord[];
  /**
   * كلّ تسميعات الأقسام (كلّ الحلقات والمدد) — لازمة لمعرفة ما سبق حفظه فلا يُحسَب
   * مرّتين؛ أمّا `recitations` فمرشَّحة بالحلقة والمدى لما يُعرَض.
   */
  allRecitations: readonly RecitationRecord[];
  serd: SerdRecord[];
  exams: ExamRecord[];
  tajweedExams: TajweedExam[];
  tajweedResults: TajweedExamResult[];
}

/**
 * طلّاب الحلقة الظاهرون في التقرير: المسجَّلون فيها حاليًّا والنشطون، **زائد**
 * كلّ من له أثر فعليّ داخل المدى ولو أُلغي تنشيطه بعده — وإلّا اختفى طالب من
 * تقرير شهرٍ حضره فعلًا لمجرّد أنّه تُرك بعده، وذلك تحريف للتاريخ.
 */
function scopedStudents(src: ReportSource, circleId: string, seen: Set<string>): Student[] {
  return src.students
    .filter((s) => (studentCircleIds(s).includes(circleId) && s.active) || seen.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function scope(src: ReportSource, circle: Circle, period: Period, asOf: string): ScopedData {
  const cid = circle.id;
  const within = <T extends { circleId: string; date: string }>(rows: readonly T[]): T[] =>
    rows.filter((r) => r.circleId === cid && inPeriod(r.date, period));

  const attendance = dedupeAttendance(within(src.attendance));
  const recitations = within(src.recitations);
  const serd = within(src.serd);
  const exams = within(src.exams);
  const tajweedExams = src.tajweedExams.filter(
    (e) => e.circleId === cid && inPeriod(e.date, period),
  );
  const tajweedIds = new Set(tajweedExams.map((e) => e.id));
  const tajweedResults = src.tajweedResults.filter((r) => tajweedIds.has(r.examId));

  const seen = new Set<string>();
  for (const r of attendance) seen.add(r.studentId);
  for (const r of recitations) seen.add(r.studentId);
  for (const r of serd) seen.add(r.studentId);
  for (const r of exams) seen.add(r.studentId);
  for (const r of tajweedResults) seen.add(r.studentId);

  // الجلسات **المستحقّة** حتى تاريخه فقط. المُجدوِل التلقائيّ ينشئ جلسات مستقبليّة
  // لبقيّة أيّام الحلقة، فلو أُدخلت في العدّ لقال تقرير شهر جارٍ «٨ من ١٣» وكأنّ
  // خمس جلسات فاتت، وهي لم يحن موعدها أصلًا. التقرير يصف ما مضى لا ما هو قادم.
  const sessions = src.sessions.filter(
    (s) =>
      s.circleId === cid &&
      inPeriod(s.date, period) &&
      (s.status !== 'scheduled' || s.date.slice(0, 10) <= asOf),
  );

  return {
    circle,
    students: scopedStudents(src, cid, seen),
    sessions,
    heldSessions: sessions.filter((s) => s.status !== 'scheduled'),
    heldCount: countHeldSessions(sessions),
    attendance,
    recitations,
    allRecitations: src.recitations,
    serd,
    exams,
    tajweedExams,
    tajweedResults,
  };
}

/* --------------------------------------------------------------------------
   حصيلة اليوم
   -------------------------------------------------------------------------- */

function dayOutcomeFrom(
  att: AttendanceRecord | undefined,
  recs: readonly RecitationRecord[],
  hasSard: boolean,
  hasExam: boolean,
): DayOutcome {
  if (recs.some(isActualRecitation)) return 'recited';
  if (hasSard) return 'sard';
  if (hasExam) return 'exam';
  if (att?.status === 'absent') return 'absent';
  if (att?.status === 'excused') return 'excused';
  if (recs.some((r) => r.postponed)) return 'postponed';
  if (recs.some((r) => r.notRecited)) return 'not_recited';
  return isAttending(att?.status) ? 'no_record' : 'absent';
}

/* --------------------------------------------------------------------------
   صفوف الطلّاب
   -------------------------------------------------------------------------- */

/**
 * محاولة واحدة في يوم الطالب — تسميع أو «لم يسمّع» أو تأجيل أو سرد أو اختبار.
 * الطالب قد يحاول أكثر من مرّة في اليوم نفسه (لم يسمّع ثمّ سمّع، أو تسميعان)،
 * وكلّ محاولة تُعرَض بترتيبها الزمنيّ مع ملاحظتها القصيرة الخاصّة بها.
 */
export interface DayEntry {
  /** معرّف السجلّ الأصليّ (تسميع أو سرد أو اختبار) — للتعديل والحذف. */
  id: string;
  kind: 'recitation' | 'not_recited' | 'postponed' | 'serd' | 'exam';
  /** «حفظ جديد» · «لم يسمّع» · «تأجيل» · «سرد جزء» · «اختبار جزء» */
  label: string;
  /** المقطع أو الجزء — فارغ لـ«لم يسمّع» و«تأجيل». */
  detail: string;
  /** الدرجة المئويّة — `null` حين لا درجة. */
  score: number | null;
  /** «ممتاز» / «ناجح» / «إعادة» أو فارغ. */
  verdict: string;
  /** رسوب أو «لم يسمّع» — يُلوَّن تحذيريًّا. */
  fail: boolean;
  /** ملاحظة المعلّم القصيرة على هذه المحاولة. */
  note: string;
  createdAt: number;
  /** السجلّ الأصليّ للتسميع (لأعداد الأخطاء والأوجه). */
  rec?: RecitationRecord;
}

const juzDetail = (juz: number, scope: string | undefined, juzList?: number[]) =>
  scope === 'block' ? `الأجزاء ${(juzList ?? [juz]).join('، ')}` : `الجزء ${juz}`;

/** محاولات يوم واحد مرتّبة زمنيًّا — المصدر الواحد لكلّ تقارير اليوم والجلسة. */
export function buildDayEntries(
  recs: readonly RecitationRecord[],
  serd: readonly SerdRecord[],
  exams: readonly ExamRecord[],
): DayEntry[] {
  const out: DayEntry[] = [];
  for (const r of recs) {
    const note = r.notes?.trim() ?? '';
    if (r.notRecited) {
      out.push({
        id: r.id,
        kind: 'not_recited',
        label: 'لم يسمّع',
        detail: '',
        score: null,
        verdict: '',
        fail: true,
        note,
        createdAt: r.createdAt,
        rec: r,
      });
    } else if (r.postponed) {
      out.push({
        id: r.id,
        kind: 'postponed',
        label: 'تأجيل',
        detail: '',
        score: null,
        verdict: '',
        fail: false,
        note,
        createdAt: r.createdAt,
        rec: r,
      });
    } else {
      const s = scoreOf(r);
      out.push({
        id: r.id,
        kind: 'recitation',
        label: RECITATION_KIND_LABELS[r.kind],
        // ترتيب سور عكسيّ أو معدَّل: «النبأ 1-40، المرسلات 1-50» — وإلّا «النبأ 1 ← النبأ 20».
        detail: r.segments?.length
          ? segmentsText(r.segments, surahName)
          : `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`,
        score: s,
        verdict: ratingLabel(s, r.rating),
        fail: s < TASMIE_PASS,
        note,
        createdAt: r.createdAt,
        rec: r,
      });
    }
  }
  for (const s of serd) {
    out.push({
      id: s.id,
      kind: 'serd',
      label: SERD_SCOPE_LABELS[s.scope] ?? 'سرد',
      detail: juzDetail(s.juz, s.scope, s.juzList),
      score: s.score,
      verdict: passLabel(s.score, SARD_PASS),
      fail: s.score < SARD_PASS,
      note: s.notes?.trim() ?? '',
      createdAt: s.createdAt,
    });
  }
  for (const e of exams) {
    out.push({
      id: e.id,
      kind: 'exam',
      label: EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار',
      detail: juzDetail(e.juz, e.scope, e.juzList),
      score: e.score,
      verdict: passLabel(e.score, EXAM_PASS),
      fail: e.score < EXAM_PASS,
      note: e.notes?.trim() ?? '',
      createdAt: e.createdAt,
    });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** يوم واحد في سِجلّ طالب — أساس التقرير المرجعيّ التفصيليّ. */
export interface StudentDay {
  date: string;
  status: AttendanceStatus | null;
  outcome: DayOutcome;
  /** مقاطع التسميع الفعليّة في هذا اليوم (قد تكون أكثر من واحد). */
  recitations: RecitationRecord[];
  serd: SerdRecord[];
  exams: ExamRecord[];
  /** كلّ محاولات اليوم بترتيبها الزمنيّ — ما تعرضه التقارير. */
  entries: DayEntry[];
  /** ملاحظة الحضور — ملاحظات المحاولات داخل `entries`. */
  note: string;
}

/** صفّ طالب في تقرير حلقة تحفيظ. */
export interface HifzStudentRow {
  studentId: string;
  name: string;
  att: AttendanceTally;
  /** جلسات الحلقة المنعقدة في المدى — مقام كسر الحضور. */
  held: number;
  /**
   * أوجه **الحفظ الجديد الناجح** (٩٠٪ فأكثر) للآيات الجديدة فقط بلا تكرار — بعد التقريب
   * (عدد صحيح + ربع/نصف). المراجعة والسرد والاختبار لا تدخل. راجع core/new-memorization.ts.
   */
  pages: number;
  /** الأسطر المعتمدة قبل التقريب — أساس جمع الإجماليّات بدقّة. */
  pageLines: number;
  /** متوسّط درجات التسميع الفعليّة، أو `null` إن لم يسمّع إطلاقًا. */
  avgScore: number | null;
  recitationCount: number;
  /** أيّام أنجز فيها شيئًا (تسميع أو سرد أو اختبار). */
  productiveDays: number;
  /** أيّام حضر فيها بلا أيّ إنجاز — الفجوة. */
  idleDays: number;
  /** منها ما لم يُسجَّل له سبب إطلاقًا — ثغرة تسجيل عند المعلّم. */
  unloggedDays: number;
  sardCount: number;
  sardPassed: number;
  examCount: number;
  examPassed: number;
  /** أيّام منذ آخر نشاط فعليّ (تسميع/سرد/اختبار)، أو `null` إن لا نشاط قطّ. */
  daysSinceActivity: number | null;
}

/** نتيجة طالب في اختبار تجويد واحد — بالعلامة الفعليّة لا بنسبة مئويّة. */
export interface TajweedExamCell {
  examId: string;
  examName: string;
  date: string;
  /** الدرجة المحرَزة، أو `null` إن كان مستهدَفًا ولم تُسجَّل له نتيجة. */
  score: number | null;
  totalScore: number;
  passScore: number;
  passed: boolean;
  /** «ممتاز» / «جيد جدًّا» / «إعادة» — بعلامة نجاح هذا الاختبار وحده. */
  verdict: string;
  notes: string;
}

/** صفّ طالب في تقرير حلقة تجويد — حضور ونتائج اختبارات فقط، لا شيء غيرهما. */
export interface TajweedStudentRow {
  studentId: string;
  name: string;
  att: AttendanceTally;
  /** جلسات الحلقة المنعقدة في المدى — مقام كسر الحضور. */
  held: number;
  cells: TajweedExamCell[];
  /** مجموع ما أحرزه فعليًّا في اختبارات المدى. */
  achieved: number;
  /** مجموع العلامات الكلّية للاختبارات التي شارك فيها فعلًا. */
  maxScore: number;
  sat: number;
  passed: number;
  /** اختبارات استُهدف بها ولم تُسجَّل له فيها نتيجة. */
  missed: number;
}

/* --------------------------------------------------------------------------
   تقرير الحلقة
   -------------------------------------------------------------------------- */

interface CircleReportBase {
  circleId: string;
  circleName: string;
  /** «اسم الحلقة — تحفيظ» أو «اسم الحلقة — تجويد متوسّطة». */
  circleTitle: string;
  period: Period;
  /** جلسات واقعة في المدى (بما فيها ما لم يُعقَد بعد). */
  sessionCount: number;
  /** الجلسات التي انعقدت فعلًا. */
  heldCount: number;
  studentCount: number;
  att: AttendanceTally;
}

export interface HifzCircleReport extends CircleReportBase {
  kind: 'hifz';
  rows: HifzStudentRow[];
  /** مجموع كسور حضور الطلّاب — «١٤٢/١٦٠». */
  attFrac: AttFrac;
  /** أوجه الحفظ الجديد لكامل الحلقة (من مجموع الأسطر لا من مجموع المقرَّب). */
  totalPages: number;
  totalLines: number;
  avgScore: number | null;
  sardCount: number;
  examCount: number;
  /** طلّاب حضروا بلا أيّ إنجاز ولو مرّة. */
  studentsWithGaps: number;
  /** طلّاب لا نشاط لهم منذ `INACTIVE_DAYS` يومًا فأكثر (أو لا نشاط لهم إطلاقًا). */
  inactiveStudents: HifzStudentRow[];
}

export interface TajweedCircleReport extends CircleReportBase {
  kind: 'tajweed';
  rows: TajweedStudentRow[];
  /** مجموع كسور حضور الطلّاب — «١٤٢/١٦٠». */
  attFrac: AttFrac;
  /** اختبارات التجويد الواقعة في المدى، مرتّبة بالتاريخ. */
  exams: TajweedExam[];
  /** مجموع المحرَز على مجموع الكلّيّ لكامل الحلقة — بالعلامة الفعليّة. */
  achieved: number;
  maxScore: number;
}

export type CircleReport = HifzCircleReport | TajweedCircleReport;

/** عدد الأيّام التي يُعدّ بعدها الطالب منقطعًا. */
export const INACTIVE_DAYS = 14;

/** «اسم الحلقة — تحفيظ» / «… — تجويد تمهيديّة». مكرّر هنا لإبقاء الطبقة نقيّة. */
export function circleTitleOf(c: Circle): string {
  if (c.type === 'tajweed') {
    const lvl =
      c.tajweedLevel === 'intro'
        ? 'تمهيديّة'
        : c.tajweedLevel === 'intermediate'
          ? 'متوسّطة'
          : c.tajweedLevel === 'advanced'
            ? 'متقدّمة'
            : '';
    return lvl ? `${c.name} — تجويد ${lvl}` : `${c.name} — تجويد`;
  }
  return `${c.name} — تحفيظ`;
}

function buildHifzRow(st: Student, d: ScopedData, asOf: string): HifzStudentRow {
  const mine = <T extends { studentId: string }>(rows: readonly T[]): T[] =>
    rows.filter((r) => r.studentId === st.id);

  const att = mine(d.attendance);
  const recs = mine(d.recitations);
  const serd = mine(d.serd);
  const exams = mine(d.exams);
  const actual = recs.filter(isActualRecitation);

  // أوجه الحفظ الجديد: تاريخ الطالب كلّه يحدّد ما حُفِظ سابقًا، والمعروض ما في الحلقة والمدى.
  const shown = new Set(recs.map((r) => r.id));
  const credit = creditNewPages(
    d.allRecitations.filter((r) => r.studentId === st.id),
    (r) => shown.has(r.id),
  );

  // كلّ يوم ظهر فيه للطالب أثر — حضور أو أيّ نشاط.
  const days = new Set<string>([
    ...att.map((a) => a.date),
    ...recs.map((r) => r.date),
    ...serd.map((r) => r.date),
    ...exams.map((r) => r.date),
  ]);

  let productiveDays = 0;
  let idleDays = 0;
  let unloggedDays = 0;
  for (const date of days) {
    const a = att.find((x) => x.date === date);
    const outcome = dayOutcomeFrom(
      a,
      recs.filter((r) => r.date === date),
      serd.some((r) => r.date === date),
      exams.some((r) => r.date === date),
    );
    if (isProductive(outcome)) {
      productiveDays++;
    } else if (isAttending(a?.status) && outcome !== 'postponed') {
      // «المؤجَّل» اتّفاق صريح مع المعلّم، فلا يُحتسَب فجوة.
      idleDays++;
      if (outcome === 'no_record') unloggedDays++;
    }
  }

  const activityDates = [
    ...actual.map((r) => r.date),
    ...serd.map((r) => r.date),
    ...exams.map((r) => r.date),
  ].sort();
  const last = activityDates[activityDates.length - 1];

  return {
    studentId: st.id,
    name: st.name,
    att: tallyOf(att),
    held: d.heldCount,
    pages: credit.pages,
    pageLines: credit.lines,
    avgScore: avg(actual.map((r) => scoreOf(r))),
    recitationCount: actual.length,
    productiveDays,
    idleDays,
    unloggedDays,
    sardCount: serd.length,
    sardPassed: serd.filter((r) => scoreOf(r) >= SARD_PASS).length,
    examCount: exams.length,
    examPassed: exams.filter((r) => scoreOf(r) >= EXAM_PASS).length,
    daysSinceActivity: last ? daysBetweenISO(last, asOf) : null,
  };
}

function buildHifzBranch(base: CircleReportBase, d: ScopedData, asOf: string): HifzCircleReport {
  const rows = d.students.map((st) => buildHifzRow(st, d, asOf));
  const allScores = d.recitations.filter(isActualRecitation).map((r) => scoreOf(r));
  return {
    ...base,
    kind: 'hifz',
    rows,
    attFrac: sumFrac(rows.map((r) => fracOf(r.att, r.held))),
    totalPages: pagesFromLines(rows.reduce((a, r) => a + r.pageLines, 0)),
    totalLines: rows.reduce((a, r) => a + r.pageLines, 0),
    avgScore: avg(allScores),
    sardCount: d.serd.length,
    examCount: d.exams.length,
    studentsWithGaps: rows.filter((r) => r.idleDays > 0).length,
    inactiveStudents: rows.filter(
      (r) => r.daysSinceActivity === null || r.daysSinceActivity >= INACTIVE_DAYS,
    ),
  };
}

function buildTajweedRow(
  st: Student,
  exams: readonly TajweedExam[],
  d: ScopedData,
): TajweedStudentRow {
  const att = d.attendance.filter((a) => a.studentId === st.id);
  const cells: TajweedExamCell[] = [];

  for (const ex of exams) {
    // الاختبار لا يستهدف كلّ الحلقة بالضرورة — يُتخطّى من لم يُستهدَف به أصلًا.
    const targeted = !ex.studentIds?.length || ex.studentIds.includes(st.id);
    if (!targeted) continue;
    const res = d.tajweedResults.find((r) => r.examId === ex.id && r.studentId === st.id);
    const score = res ? res.score : null;
    cells.push({
      examId: ex.id,
      examName: ex.name,
      date: ex.date,
      score,
      totalScore: ex.totalScore,
      passScore: ex.passScore,
      passed: score !== null && score >= ex.passScore,
      verdict: score === null ? 'لم يُختبَر' : tajweedExamVerdict(score, ex.passScore, res?.rating),
      notes: res?.notes?.trim() ?? '',
    });
  }

  const sat = cells.filter((c) => c.score !== null);
  return {
    studentId: st.id,
    name: st.name,
    att: tallyOf(att),
    held: d.heldCount,
    cells,
    // المجموع الخام: مجموع المحرَز على مجموع الكلّيّ. الاختبار الأكبر يزن أكثر
    // تلقائيًّا — وهو السلوك الصحيح — ويصل لوليّ الأمر بصيغة يفهمها بلا شرح.
    achieved: sat.reduce((a, c) => a + (c.score ?? 0), 0),
    maxScore: sat.reduce((a, c) => a + c.totalScore, 0),
    sat: sat.length,
    passed: sat.filter((c) => c.passed).length,
    missed: cells.length - sat.length,
  };
}

function buildTajweedBranch(base: CircleReportBase, d: ScopedData): TajweedCircleReport {
  const exams = [...d.tajweedExams].sort((a, b) => a.date.localeCompare(b.date));
  const rows = d.students.map((st) => buildTajweedRow(st, exams, d));
  return {
    ...base,
    kind: 'tajweed',
    rows,
    attFrac: sumFrac(rows.map((r) => fracOf(r.att, r.held))),
    exams,
    achieved: rows.reduce((a, r) => a + r.achieved, 0),
    maxScore: rows.reduce((a, r) => a + r.maxScore, 0),
  };
}

/**
 * يبني تقرير حلقة واحدة، ويختار الفرع تلقائيًّا بحسب نوعها. `asOf` هو اليوم
 * الذي تُقاس منه مدّة الانقطاع (افتراضًا اليوم، ويُمرَّر صراحةً في الاختبارات).
 */
export function buildCircleReport(
  src: ReportSource,
  circle: Circle,
  period: Period,
  asOf: string = todayISO(),
): CircleReport {
  const d = scope(src, circle, period, asOf);
  const base: CircleReportBase = {
    circleId: circle.id,
    circleName: circle.name,
    circleTitle: circleTitleOf(circle),
    period,
    // بلا تكرار (حلقة، تاريخ) كالمنعقدة — وإلّا قالت «١٠ من ١١» عن حصّة قديمة مكرّرة.
    sessionCount: new Set(d.sessions.map((s) => `${s.circleId}_${s.date.slice(0, 10)}`)).size,
    heldCount: d.heldCount,
    studentCount: d.students.length,
    att: tallyOf(d.attendance),
  };
  return isTajweedCircle(circle) ? buildTajweedBranch(base, d) : buildHifzBranch(base, d, asOf);
}

/** هل التقرير خالٍ تمامًا؟ — الواجهة تعرض جملة صريحة بدل جدول أصفار يُقرأ رسوبًا. */
export function isEmptyReport(rep: CircleReport): boolean {
  if (rep.att.recorded > 0) return false;
  return rep.kind === 'hifz'
    ? rep.totalPages === 0 && rep.sardCount === 0 && rep.examCount === 0
    : rep.exams.length === 0;
}

/* --------------------------------------------------------------------------
   السِجلّ التفصيليّ للطالب — أساس التقرير المرجعيّ
   -------------------------------------------------------------------------- */

export interface StudentTimeline {
  studentId: string;
  name: string;
  period: Period;
  days: StudentDay[];
  att: AttendanceTally;
  /** جلسات الحلقات ضمن النطاق التي انعقدت في المدى — مقام كسر الحضور. */
  held: number;
  /** أوجه الحفظ الجديد الناجح بلا تكرار (مقرَّبة) — راجع `HifzStudentRow.pages`. */
  pages: number;
  pageLines: number;
  avgScore: number | null;
  serd: SerdRecord[];
  exams: ExamRecord[];
  tajweed: TajweedExamCell[];
  /** نطاق التقرير يشمل حلقة تحفيظ — وإلّا لا معنى لأعمدة التسميع والأوجه والسرد. */
  hasHifz: boolean;
  /** نطاق التقرير يشمل حلقة تجويد. */
  hasTajweed: boolean;
}

/**
 * أيّام الإنجاز وحدها — ما يُعرَض في تقرير الأهالي. حضور حصّة التجويد إنجاز
 * بذاته، إذ لا تسميع فيها أصلًا.
 */
export function achievementDays(tl: StudentTimeline): StudentDay[] {
  return tl.days.filter(
    (d) => d.recitations.length || d.serd.length || d.exams.length || d.outcome === 'tajweed',
  );
}

/** محاولات التسميع وحدها (لا سرد ولا اختبار) — ما يعرضه «سجلّ التسميع». */
export const isRecitationEntry = (e: DayEntry): boolean =>
  e.kind === 'recitation' || e.kind === 'not_recited' || e.kind === 'postponed';

/**
 * أيّام السجلّ اليوميّ بحسب المفاتيح والجمهور (مشتركة بين النصّ وPDF والصورة):
 *   • مع «سجلّ التسميع»: الأهالي يرون أيّام التسميع الفعليّ، والمرجعيّ كلّ الأيّام
 *     (أو أيّام المحاولات فقط حين لا حضور).
 *   • الحضور وحده: المرجعيّ كلّ الأيّام، والأهالي أيّام الحضور الفعليّ.
 */
export function logDays(
  tl: StudentTimeline,
  audience: 'parents' | 'reference',
  f: { attendance: boolean; recitation: boolean },
): StudentDay[] {
  const withRecitation = f.recitation && tl.hasHifz;
  if (audience === 'reference') {
    return withRecitation && !f.attendance
      ? tl.days.filter((d) => d.entries.some(isRecitationEntry))
      : tl.days;
  }
  if (withRecitation) return tl.days.filter((d) => d.recitations.length > 0);
  return tl.days.filter((d) => d.status === 'present' || d.status === 'late');
}

/**
 * سِجلّ يوميّ لطالب واحد داخل المدى — يخدم «تاريخ الطالب الكامل» في التقرير
 * المرجعيّ حين يُمرَّر `allTimePeriod()`. `circleIds` يقصره على الحلقات
 * المختارة (فارغة = كلّ حلقاته): من اختار حلقة التجويد وحدها لا يريد تسميع
 * الطالب في حلقة التحفيظ.
 */
export function buildStudentTimeline(
  src: ReportSource,
  student: Student,
  period: Period,
  circleIds: readonly string[] = [],
): StudentTimeline {
  const inScope = (cid: string) => circleIds.length === 0 || circleIds.includes(cid);
  const mine = <T extends { studentId: string; circleId: string; date: string }>(
    rows: readonly T[],
  ): T[] =>
    rows.filter(
      (r) => r.studentId === student.id && inScope(r.circleId) && inPeriod(r.date, period),
    );

  const att = dedupeAttendance(mine(src.attendance));
  const recs = mine(src.recitations);
  const serd = mine(src.serd).sort((a, b) => a.date.localeCompare(b.date));
  const exams = mine(src.exams).sort((a, b) => a.date.localeCompare(b.date));

  const examById = new Map(src.tajweedExams.map((e) => [e.id, e]));
  const tajweed: TajweedExamCell[] = src.tajweedResults
    .filter((r) => r.studentId === student.id && inScope(r.circleId) && inPeriod(r.date, period))
    .map((r) => {
      const ex = examById.get(r.examId);
      const passScore = ex?.passScore ?? r.passScore;
      return {
        examId: r.examId,
        examName: r.examName || (ex?.name ?? 'اختبار تجويد'),
        date: r.date,
        score: r.score,
        totalScore: ex?.totalScore ?? r.totalScore,
        passScore,
        passed: r.score >= passScore,
        verdict: tajweedExamVerdict(r.score, passScore, r.rating),
        notes: r.notes?.trim() ?? '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const dates = [
    ...new Set([
      ...att.map((a) => a.date),
      ...recs.map((r) => r.date),
      ...serd.map((r) => r.date),
      ...exams.map((r) => r.date),
    ]),
  ].sort();

  const tajweedCircleIds = new Set(src.circles.filter(isTajweedCircle).map((c) => c.id));
  const scopeCircleIds = new Set([
    ...studentCircleIds(student).filter(inScope),
    ...att.map((a) => a.circleId),
    ...recs.map((r) => r.circleId),
    ...serd.map((r) => r.circleId),
    ...exams.map((r) => r.circleId),
  ]);
  const hasTajweed = [...scopeCircleIds].some((id) => tajweedCircleIds.has(id));
  const hasHifz = [...scopeCircleIds].some((id) => !tajweedCircleIds.has(id));

  const days: StudentDay[] = dates.map((date) => {
    const dayAtt = att.filter((x) => x.date === date);
    const hifzAtt = dayAtt.find((x) => !tajweedCircleIds.has(x.circleId));
    const tajweedAtt = dayAtt.find((x) => tajweedCircleIds.has(x.circleId));
    const dayRecs = recs.filter((r) => r.date === date);
    const daySerd = serd.filter((r) => r.date === date);
    const dayExams = exams.filter((r) => r.date === date);
    const hasHifzActivity =
      !!hifzAtt || dayRecs.length > 0 || daySerd.length > 0 || dayExams.length > 0;
    // يوم لا أثر فيه للتحفيظ إلّا حضور حصّة تجويد: حلقة التجويد لا تسجّل
    // تسميعًا أصلًا، فحصيلة التحفيظ هنا («حاضر بلا تسجيل») وصف خاطئ لليوم.
    const outcome: DayOutcome = hasHifzActivity
      ? dayOutcomeFrom(hifzAtt, dayRecs, daySerd.length > 0, dayExams.length > 0)
      : isAttending(tajweedAtt?.status)
        ? 'tajweed'
        : tajweedAtt?.status === 'excused'
          ? 'excused'
          : 'absent';
    const a = hifzAtt ?? tajweedAtt;
    return {
      date,
      status: a?.status ?? null,
      outcome,
      recitations: dayRecs.filter(isActualRecitation),
      serd: daySerd,
      exams: dayExams,
      entries: buildDayEntries(dayRecs, daySerd, dayExams),
      note: a?.note?.trim() ?? '',
    };
  });

  // المقام: الجلسات المنعقدة فعلًا في حلقات النطاق خلال المدى (المجدولة لم تُعقَد).
  const held = countHeldSessions(
    src.sessions,
    (s) => scopeCircleIds.has(s.circleId) && inPeriod(s.date, period),
  );

  const actual = recs.filter(isActualRecitation);
  // أوجه الحفظ الجديد: كلّ تسميعات الطالب تحدّد ما حُفِظ سابقًا، والمعروض ضمن النطاق والمدى.
  const shownIds = new Set(recs.map((r) => r.id));
  const credit = creditNewPages(
    src.recitations.filter((r) => r.studentId === student.id),
    (r) => shownIds.has(r.id),
  );
  return {
    studentId: student.id,
    name: student.name,
    period,
    days,
    att: tallyOf(att),
    held,
    pages: credit.pages,
    pageLines: credit.lines,
    avgScore: avg(actual.map((r) => scoreOf(r))),
    serd,
    exams,
    tajweed,
    hasHifz,
    hasTajweed: hasTajweed || tajweed.length > 0,
  };
}

/* --------------------------------------------------------------------------
   تقرير عامّ يجمع عدّة حلقات — مع فصل صارم بين النوعين
   -------------------------------------------------------------------------- */

export interface HifzTotals {
  circles: number;
  students: number;
  heldSessions: number;
  att: AttendanceTally;
  attFrac: AttFrac;
  /** أوجه الحفظ الجديد (من مجموع الأسطر). */
  pages: number;
  avgScore: number | null;
  sardCount: number;
  examCount: number;
}

export interface TajweedTotals {
  circles: number;
  students: number;
  heldSessions: number;
  att: AttendanceTally;
  attFrac: AttFrac;
  exams: number;
  achieved: number;
  maxScore: number;
}

export interface OverviewReport {
  period: Period;
  hifz: HifzCircleReport[];
  tajweed: TajweedCircleReport[];
  /** إجماليّات حلقات التحفيظ وحدها — لا يُخلَط معها شيء من التجويد. */
  hifzTotals: HifzTotals;
  /** إجماليّات حلقات التجويد وحدها — بالعلامة الفعليّة، بلا نسبة مئويّة. */
  tajweedTotals: TajweedTotals;
}

/**
 * يبني تقرير عدّة حلقات دفعةً واحدة. الفصل بين النوعين بنيويّ لا تجميليّ:
 * خلطهما في إجماليّ واحد يُنتج أرقامًا بلا معنى — متوسّط تسميع لحلقة لا تسميع
 * فيها، أو نسبة نجاح تخلط عتبة ٩٠٪ الثابتة بعلامات نجاح متغيّرة لكلّ اختبار.
 */
export function buildOverviewReport(
  src: ReportSource,
  circleIds: readonly string[],
  period: Period,
  asOf: string = todayISO(),
): OverviewReport {
  const wanted = new Set(circleIds);
  const hifz: HifzCircleReport[] = [];
  const tajweed: TajweedCircleReport[] = [];
  for (const c of src.circles) {
    if (!wanted.has(c.id)) continue;
    const rep = buildCircleReport(src, c, period, asOf);
    if (rep.kind === 'hifz') hifz.push(rep);
    else tajweed.push(rep);
  }

  const hifzScores = hifz.flatMap((r) =>
    r.rows.flatMap((x) => (x.avgScore === null ? [] : [x.avgScore])),
  );

  return {
    period,
    hifz,
    tajweed,
    hifzTotals: {
      circles: hifz.length,
      students: hifz.reduce((a, r) => a + r.studentCount, 0),
      heldSessions: hifz.reduce((a, r) => a + r.heldCount, 0),
      att: sumTallies(hifz.map((r) => r.att)),
      attFrac: sumFrac(hifz.map((r) => r.attFrac)),
      pages: pagesFromLines(hifz.reduce((a, r) => a + r.totalLines, 0)),
      avgScore: avg(hifzScores),
      sardCount: hifz.reduce((a, r) => a + r.sardCount, 0),
      examCount: hifz.reduce((a, r) => a + r.examCount, 0),
    },
    tajweedTotals: {
      circles: tajweed.length,
      students: tajweed.reduce((a, r) => a + r.studentCount, 0),
      heldSessions: tajweed.reduce((a, r) => a + r.heldCount, 0),
      att: sumTallies(tajweed.map((r) => r.att)),
      attFrac: sumFrac(tajweed.map((r) => r.attFrac)),
      exams: tajweed.reduce((a, r) => a + r.exams.length, 0),
      achieved: tajweed.reduce((a, r) => a + r.achieved, 0),
      maxScore: tajweed.reduce((a, r) => a + r.maxScore, 0),
    },
  };
}

/* --------------------------------------------------------------------------
   تقرير عدّة طلّاب — يغطّي كلّ أنشطتهم عبر كلّ حلقاتهم
   -------------------------------------------------------------------------- */

/** إجماليّات مجموعة طلّاب — التحفيظ والتجويد مفصولان كالعادة. */
export interface StudentsTotals {
  students: number;
  att: AttendanceTally;
  attFrac: AttFrac;
  /** أوجه الحفظ الجديد (من مجموع الأسطر). */
  pages: number;
  avgScore: number | null;
  sardCount: number;
  examCount: number;
  /** اختبارات التجويد: مجموع خام لا نسبة. */
  tajweedCount: number;
  tajweedAchieved: number;
  tajweedMax: number;
  hasHifz: boolean;
  hasTajweed: boolean;
}

export interface StudentsReport {
  period: Period;
  /** سِجلّ كلّ طالب مرتّبًا أبجديًّا. */
  students: StudentTimeline[];
  totals: StudentsTotals;
}

/**
 * تقرير مجموعة طلّاب (واحد أو اثنان أو كلّهم) داخل الحلقات المختارة
 * (`circleIds` فارغة = كلّ حلقاتهم). اختيار النوعين معًا يجمع للطالب تسميعه
 * وسرده واختبارات أجزائه واختبارات تجويده؛ واختيار التجويد وحده يُخرج
 * تقرير تجويد خالصًا.
 *
 * الإجماليّات تُبقي التجويد مفصولًا (مجموع خام) عن التحفيظ (أوجه ومتوسّط
 * مئويّ) — جمعهما في رقم واحد بلا معنى.
 */
export function buildStudentsReport(
  src: ReportSource,
  studentIds: readonly string[],
  period: Period,
  circleIds: readonly string[] = [],
): StudentsReport {
  const wanted = new Set(studentIds);
  const chosen = src.students
    .filter((s) => wanted.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const students = chosen.map((st) => buildStudentTimeline(src, st, period, circleIds));

  const scores = students.flatMap((t) => (t.avgScore === null ? [] : [t.avgScore]));
  const tajweedCells = students.flatMap((t) => t.tajweed.filter((c) => c.score !== null));

  return {
    period,
    students,
    totals: {
      students: students.length,
      att: sumTallies(students.map((t) => t.att)),
      attFrac: sumFrac(students.map((t) => fracOf(t.att, t.held))),
      pages: pagesFromLines(students.reduce((a, t) => a + t.pageLines, 0)),
      avgScore: avg(scores),
      sardCount: students.reduce((a, t) => a + t.serd.length, 0),
      examCount: students.reduce((a, t) => a + t.exams.length, 0),
      tajweedCount: tajweedCells.length,
      tajweedAchieved: tajweedCells.reduce((a, c) => a + (c.score ?? 0), 0),
      tajweedMax: tajweedCells.reduce((a, c) => a + c.totalScore, 0),
      hasHifz: students.some((t) => t.hasHifz),
      hasTajweed: students.some((t) => t.hasTajweed),
    },
  };
}
