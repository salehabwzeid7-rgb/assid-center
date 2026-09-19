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
  SARD_PASS,
  isActualRecitation,
  isTajweedCircle,
  scoreOf,
  studentCircleIds,
  tajweedExamVerdict,
  type AttendanceRecord,
  type AttendanceStatus,
  type Circle,
  type ExamRecord,
  type RecitationKind,
  type RecitationRecord,
  type SerdRecord,
  type Session,
  type Student,
  type TajweedExam,
  type TajweedExamResult,
} from './models';
import { inPeriod, todayISO, type Period } from './report-period';

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
  | 'excused'
  | 'absent';

export const DAY_OUTCOME_LABELS: Record<DayOutcome, string> = {
  recited: 'سمّع',
  sard: 'سرد',
  exam: 'اختبار',
  postponed: 'مؤجَّل',
  not_recited: 'لم يسمّع',
  no_record: 'حاضر بلا تسجيل',
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
 * سجلّ حضور واحد لكلّ (طالب، تاريخ) — يُبقي الأحدث إنشاءً. نفس إزالة التكرار
 * المطبَّقة في `DataService`، مكرّرة هنا عمدًا: الطبقة النقيّة يجب ألّا تفترض
 * أنّ من ناداها نظّف المدخلات.
 */
function dedupeAttendance(rows: readonly AttendanceRecord[]): AttendanceRecord[] {
  const byKey = new Map<string, AttendanceRecord>();
  for (const a of rows) {
    const key = `${a.studentId}_${a.date}`;
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
  attendance: AttendanceRecord[];
  recitations: RecitationRecord[];
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
    attendance,
    recitations,
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

/** يوم واحد في سِجلّ طالب — أساس التقرير المرجعيّ التفصيليّ. */
export interface StudentDay {
  date: string;
  status: AttendanceStatus | null;
  outcome: DayOutcome;
  /** مقاطع التسميع الفعليّة في هذا اليوم (قد تكون أكثر من واحد). */
  recitations: RecitationRecord[];
  serd: SerdRecord[];
  exams: ExamRecord[];
  /** ملاحظة الحضور أو ملاحظة التأجيل — تُطبَع كما هي. */
  note: string;
}

/** صفّ طالب في تقرير حلقة تحفيظ. */
export interface HifzStudentRow {
  studentId: string;
  name: string;
  att: AttendanceTally;
  /** مجموع الأوجه المسمَّعة فعليًّا (يستبعد «لم يسمّع» و«المؤجَّل»). */
  pages: number;
  /** أوجه الحفظ الجديد وحدها — مؤشّر التقدّم الحقيقيّ. */
  newPages: number;
  /** أوجه المراجعة (قريبة + بعيدة). */
  reviewPages: number;
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
  totalPages: number;
  totalNewPages: number;
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
function circleTitleOf(c: Circle): string {
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

  const pagesOf = (kinds: readonly RecitationKind[]) =>
    actual.filter((r) => kinds.includes(r.kind)).reduce((a, r) => a + (r.pages || 0), 0);

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
    pages: pagesOf(['new', 'near_review', 'far_review']),
    newPages: pagesOf(['new']),
    reviewPages: pagesOf(['near_review', 'far_review']),
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
    totalPages: rows.reduce((a, r) => a + r.pages, 0),
    totalNewPages: rows.reduce((a, r) => a + r.newPages, 0),
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
    sessionCount: d.sessions.length,
    heldCount: d.heldSessions.length,
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
  pages: number;
  newPages: number;
  avgScore: number | null;
  serd: SerdRecord[];
  exams: ExamRecord[];
  tajweed: TajweedExamCell[];
}

/**
 * سِجلّ يوميّ كامل لطالب واحد عبر كلّ حلقاته وكلّ أنشطته داخل المدى — يخدم
 * «تاريخ الطالب الكامل» في التقرير المرجعيّ حين يُمرَّر `allTimePeriod()`.
 */
export function buildStudentTimeline(
  src: ReportSource,
  student: Student,
  period: Period,
): StudentTimeline {
  const mine = <T extends { studentId: string; date: string }>(rows: readonly T[]): T[] =>
    rows.filter((r) => r.studentId === student.id && inPeriod(r.date, period));

  const att = dedupeAttendance(mine(src.attendance));
  const recs = mine(src.recitations);
  const serd = mine(src.serd).sort((a, b) => a.date.localeCompare(b.date));
  const exams = mine(src.exams).sort((a, b) => a.date.localeCompare(b.date));

  const examById = new Map(src.tajweedExams.map((e) => [e.id, e]));
  const tajweed: TajweedExamCell[] = src.tajweedResults
    .filter((r) => r.studentId === student.id && inPeriod(r.date, period))
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

  const days: StudentDay[] = dates.map((date) => {
    const a = att.find((x) => x.date === date);
    const dayRecs = recs.filter((r) => r.date === date);
    const daySerd = serd.filter((r) => r.date === date);
    const dayExams = exams.filter((r) => r.date === date);
    const outcome = dayOutcomeFrom(a, dayRecs, daySerd.length > 0, dayExams.length > 0);
    const postponedNote = dayRecs.find((r) => r.postponed)?.notes?.trim();
    const notRecitedNote = dayRecs.find((r) => r.notRecited)?.notes?.trim();
    return {
      date,
      status: a?.status ?? null,
      outcome,
      recitations: dayRecs.filter(isActualRecitation),
      serd: daySerd,
      exams: dayExams,
      note: a?.note?.trim() || postponedNote || notRecitedNote || '',
    };
  });

  const actual = recs.filter(isActualRecitation);
  return {
    studentId: student.id,
    name: student.name,
    period,
    days,
    att: tallyOf(att),
    pages: actual.reduce((a, r) => a + (r.pages || 0), 0),
    newPages: actual.filter((r) => r.kind === 'new').reduce((a, r) => a + (r.pages || 0), 0),
    avgScore: avg(actual.map((r) => scoreOf(r))),
    serd,
    exams,
    tajweed,
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
  pages: number;
  newPages: number;
  avgScore: number | null;
  sardCount: number;
  examCount: number;
}

export interface TajweedTotals {
  circles: number;
  students: number;
  heldSessions: number;
  att: AttendanceTally;
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
      pages: hifz.reduce((a, r) => a + r.totalPages, 0),
      newPages: hifz.reduce((a, r) => a + r.totalNewPages, 0),
      avgScore: avg(hifzScores),
      sardCount: hifz.reduce((a, r) => a + r.sardCount, 0),
      examCount: hifz.reduce((a, r) => a + r.examCount, 0),
    },
    tajweedTotals: {
      circles: tajweed.length,
      students: tajweed.reduce((a, r) => a + r.studentCount, 0),
      heldSessions: tajweed.reduce((a, r) => a + r.heldCount, 0),
      att: sumTallies(tajweed.map((r) => r.att)),
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
  pages: number;
  newPages: number;
  avgScore: number | null;
  sardCount: number;
  examCount: number;
  /** اختبارات التجويد: مجموع خام لا نسبة. */
  tajweedCount: number;
  tajweedAchieved: number;
  tajweedMax: number;
}

export interface StudentsReport {
  period: Period;
  /** سِجلّ كلّ طالب مرتّبًا أبجديًّا. */
  students: StudentTimeline[];
  totals: StudentsTotals;
}

/**
 * تقرير مجموعة طلّاب (واحد أو اثنان أو كلّهم) عبر **كلّ** حلقاتهم معًا —
 * تحفيظًا وتجويدًا في آنٍ واحد. الطالب المسجَّل في النوعين تقريره واحد يجمع
 * تسميعه وسرده واختبارات أجزائه واختبارات تجويده، وإلّا كان ناقصًا.
 *
 * الإجماليّات تُبقي التجويد مفصولًا (مجموع خام) عن التحفيظ (أوجه ومتوسّط
 * مئويّ) — جمعهما في رقم واحد بلا معنى.
 */
export function buildStudentsReport(
  src: ReportSource,
  studentIds: readonly string[],
  period: Period,
): StudentsReport {
  const wanted = new Set(studentIds);
  const chosen = src.students
    .filter((s) => wanted.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const students = chosen.map((st) => buildStudentTimeline(src, st, period));

  const scores = students.flatMap((t) => (t.avgScore === null ? [] : [t.avgScore]));
  const tajweedCells = students.flatMap((t) => t.tajweed.filter((c) => c.score !== null));

  return {
    period,
    students,
    totals: {
      students: students.length,
      att: sumTallies(students.map((t) => t.att)),
      pages: students.reduce((a, t) => a + t.pages, 0),
      newPages: students.reduce((a, t) => a + t.newPages, 0),
      avgScore: avg(scores),
      sardCount: students.reduce((a, t) => a + t.serd.length, 0),
      examCount: students.reduce((a, t) => a + t.exams.length, 0),
      tajweedCount: tajweedCells.length,
      tajweedAchieved: tajweedCells.reduce((a, c) => a + (c.score ?? 0), 0),
      tajweedMax: tajweedCells.reduce((a, c) => a + c.totalScore, 0),
    },
  };
}
