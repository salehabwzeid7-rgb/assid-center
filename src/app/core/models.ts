/* ==========================================================================
   نماذج البيانات — مركز أسيد (واجهة المعلّم)

   مجموعات مشتركة على مستوى الجذر (كل معلّم مسجَّل يصل إليها):
     circles/{id}
     students/{id}
     sessions/{id}          ← جلسة الحلقة (حصّة بتاريخ محدّد)
     attendance/{id}        ← id = sessionId_studentId
     recitations/{id}
     evaluations/{id}
     teachers/{uid}         ← ملف المعلّم فقط (اسم/جوال)
   ========================================================================== */

/** حالة الحضور */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'مأذون له',
};

export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'excused', 'absent'];

/** حالة الجلسة */
export type SessionStatus = 'scheduled' | 'open' | 'closed';

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: 'مجدولة',
  open: 'مفتوحة',
  closed: 'منتهية',
};

/** نوع الحلقة */
export type CircleType = 'memorization' | 'tajweed';

export const CIRCLE_TYPE_LABELS: Record<CircleType, string> = {
  memorization: 'حلقات تحفيظ',
  tajweed: 'حلقات تجويد',
};

/** المفرد (يُستخدم في العناوين والشارات) */
export const CIRCLE_TYPE_SINGULAR: Record<CircleType, string> = {
  memorization: 'حلقة تحفيظ',
  tajweed: 'حلقة تجويد',
};

/** كلمة الموضوع المختصرة (تُلحَق باسم الحلقة أينما ظهر: «حلقة زيد — تجويد») */
export const CIRCLE_TYPE_SHORT: Record<CircleType, string> = {
  memorization: 'تحفيظ',
  tajweed: 'تجويد',
};

export const CIRCLE_TYPE_ORDER: CircleType[] = ['memorization', 'tajweed'];

/** مستوى حلقة التجويد */
export type TajweedLevel = 'intro' | 'intermediate' | 'advanced';

export const TAJWEED_LEVEL_LABELS: Record<TajweedLevel, string> = {
  intro: 'تمهيدية',
  intermediate: 'متوسطة',
  advanced: 'متقدمة',
};

export const TAJWEED_LEVEL_ORDER: TajweedLevel[] = ['intro', 'intermediate', 'advanced'];

/**
 * أيام الأسبوع — القيمة = ‏Date.getDay()‎ (0 = الأحد … 6 = السبت).
 * الترتيب يبدأ بالسبت (بداية الأسبوع الدراسيّ في المنطقة).
 */
export const WEEKDAY_LABELS: Record<number, string> = {
  6: 'السبت',
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
};

export const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

/** نوع التسميع */
export type RecitationKind = 'new' | 'near_review' | 'far_review';

export const RECITATION_KIND_LABELS: Record<RecitationKind, string> = {
  new: 'حفظ جديد',
  near_review: 'مراجعة قريبة',
  far_review: 'مراجعة بعيدة',
};

/* ==========================================================================
   التقييم بالنسبة المئويّة (٠..١٠٠) — بلا تقديرات نصّيّة.
   عتبة النجاح تختلف حسب السياق:
     • السرد / التقييم اليوميّ:  ٩٠٪ فأعلى = ناجح
     • التسميع داخل الجلسة:       ٩٥٪ فأعلى = ناجح
   ========================================================================== */

/** عتبة نجاح السرد والتقييم اليوميّ */
export const SARD_PASS = 90;
/** عتبة نجاح اختبار الجزء (مماثلة للسرد) */
export const EXAM_PASS = 90;
/** عتبة نجاح التسميع داخل الجلسة */
export const TASMIE_PASS = 95;

/** يحصر الدرجة ضمن ٠..١٠٠ ويقرّبها لعدد صحيح */
export function clampScore(v: number | string | null | undefined): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(100, n));
}

/** «ناجح» عند بلوغ العتبة، وإلا «راسب» */
export function passLabel(score: number, threshold: number): 'ناجح' | 'راسب' {
  return score >= threshold ? 'ناجح' : 'راسب';
}

/** فئة الشارة اللونيّة حسب النجاح/الرسوب */
export function scoreClass(score: number, threshold: number): 'pass' | 'fail' {
  return score >= threshold ? 'pass' : 'fail';
}

/** تقديرات نصّيّة قديمة → نسبة تقريبيّة (لقراءة السجلّات المُنشأة قبل التحديث) */
const LEGACY_GRADE_SCORE: Record<string, number> = {
  excellent: 98,
  very_good: 88,
  good: 78,
  fair: 68,
  weak: 50,
};

/** يقرأ درجة السجلّ (score الجديد أو تحويل grade القديم). */
export function scoreOf(rec: { score?: number; grade?: string } | null | undefined): number {
  if (!rec) return 0;
  if (typeof rec.score === 'number') return rec.score;
  return rec.grade && rec.grade in LEGACY_GRADE_SCORE ? LEGACY_GRADE_SCORE[rec.grade] : 0;
}

/** المعلّم */
export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: number;
}

/** الحلقة */
export interface Circle {
  id: string;
  name: string;
  /** نوع الحلقة (مطلوب للحلقات الجديدة) */
  type?: CircleType;
  /** مستوى حلقة التجويد (لحلقات type='tajweed' فقط) */
  tajweedLevel?: TajweedLevel;
  /** أيام التكرار الأسبوعيّ — قيم ‏getDay()‎ (مطلوب للحلقات الجديدة) */
  weekdays?: number[];
  /** بداية نافذة الحصّة «HH:MM» 24 ساعة (مطلوب للحلقات الجديدة) */
  fromTime?: string;
  /** نهاية نافذة الحصّة «HH:MM» 24 ساعة (مطلوب للحلقات الجديدة) */
  toTime?: string;
  /** توقيت مفرد قديم — للتوافق مع الحلقات المُنشأة قبل نظام النوافذ الزمنية */
  time?: string;
  /** نصّ حرّ قديم للتوقيت — للتوافق مع الحلقات المُنشأة قبل الجدولة التلقائية */
  schedule?: string;
  createdAt: number;
}

/** وصف نوع الحلقة ومستواها: «تجويد تمهيدية» أو «تحفيظ». */
export function circleTypeLabel(
  c: Pick<Circle, 'type' | 'tajweedLevel'> | null | undefined,
): string {
  if (!c?.type) return '';
  if (c.type === 'tajweed') {
    return c.tajweedLevel ? `تجويد ${TAJWEED_LEVEL_LABELS[c.tajweedLevel]}` : 'تجويد';
  }
  return 'تحفيظ';
}

/** «اسم الحلقة — الموضوع/المستوى» — يُعرَض أينما ظهرت الحلقة (الإسناد، القوائم، الترويسات). */
export function circleLabel(
  c: Pick<Circle, 'name' | 'type' | 'tajweedLevel'> | null | undefined,
): string {
  if (!c) return 'حلقة محذوفة';
  const t = circleTypeLabel(c);
  return t ? `${c.name} — ${t}` : c.name;
}

/** هل الحلقة حلقة تحفيظ؟ (بلا نوع = تحفيظ للتوافق مع الحلقات القديمة). */
export function isHifzCircle(c: Pick<Circle, 'type'> | null | undefined): boolean {
  return !!c && (c.type === 'memorization' || c.type === undefined);
}

/** الطالب */
export interface Student {
  id: string;
  name: string;
  /** الحلقات المُسجَّل فيها الطالب (قد تكون تحفيظًا وتجويدًا معًا). */
  circleIds: string[];
  /** @deprecated حلقة مفردة قديمة — تُقرأ عبر studentCircleIds */
  circleId?: string;
  guardianPhone?: string;
  birthDate?: string;
  /** المستوى أو الصف الدراسي */
  level?: string;
  /** المقرر الحالي (وصف حر) */
  currentPlan?: string;
  /** أرقام السور المحفوظة (1..114) — سجلّ المقرّر القرآنيّ للطالب */
  memorizedSurahs?: number[];
  active: boolean;
  createdAt: number;
}

/** حلقات الطالب — يدعم القيمة الجديدة (circleIds) والقديمة (circleId). */
export function studentCircleIds(
  s: Pick<Student, 'circleIds' | 'circleId'> | null | undefined,
): string[] {
  if (!s) return [];
  if (s.circleIds?.length) return s.circleIds;
  return s.circleId ? [s.circleId] : [];
}

/** جلسة الحلقة (حصّة) */
export interface Session {
  id: string;
  circleId: string;
  /** التاريخ بصيغة YYYY-MM-DD */
  date: string;
  /** نافذة الحصّة «HH:MM» (منسوخة من الحلقة عند الجدولة) */
  fromTime?: string;
  toTime?: string;
  /** توقيت مفرد قديم — للتوافق */
  time?: string;
  status: SessionStatus;
  note?: string;
  createdAt: number;
  closedAt?: number;
}

/** سجل الحضور (ضمن جلسة) */
export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  circleId: string;
  /** تاريخ الجلسة بصيغة YYYY-MM-DD */
  date: string;
  status: AttendanceStatus;
  note?: string;
  createdAt: number;
}

/** سجل التسميع (مقدار الحفظ وما سُمِع) */
export interface RecitationRecord {
  id: string;
  studentId: string;
  circleId: string;
  /** الجلسة المرتبطة (إن وُجدت) */
  sessionId?: string;
  date: string;
  kind: RecitationKind;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  /** عدد الأوجه (الصفحات) المسمَّعة */
  pages: number;
  /** درجة التسميع ٠..١٠٠ (عتبة النجاح ٩٥٪) */
  score: number;
  /** @deprecated تقدير نصّيّ قديم — للقراءة فقط */
  grade?: string;
  /** أخطاء التجويد */
  tajweedErrors: number;
  /** أخطاء الحفظ */
  hifzErrors: number;
  /** عدد مرات التلقين / الفتح على الطالب */
  promptCount: number;
  notes?: string;
  createdAt: number;
}

/** التقييم اليومي */
export interface EvaluationRecord {
  id: string;
  studentId: string;
  circleId: string;
  sessionId?: string;
  date: string;
  /** كلّ الحقول درجات مئويّة ٠..١٠٠ (عتبة النجاح ٩٠٪) */
  memorization: number;
  review: number;
  tajweed: number;
  /** الانتباه والتفاعل داخل الحلقة */
  attention: number;
  /** الأدب والسلوك */
  behavior: number;
  notes?: string;
  createdAt: number;
}

/** نوع السرد */
export type SerdScope = 'juz' | 'block';

export const SERD_SCOPE_LABELS: Record<SerdScope, string> = {
  juz: 'سرد جزء',
  block: 'سرد مجمّع (٣ أجزاء)',
};

/**
 * سجلّ السرد — مراجعة/تسميع جزء محفوظ كاملًا أو كتلة ثلاثة أجزاء متتالية،
 * مع تقييم مستقلّ ورقم دورة المراجعة.
 */
export interface SerdRecord {
  id: string;
  studentId: string;
  circleId: string;
  scope: SerdScope;
  /** الجزء (scope='juz') أو أوّل جزء في الكتلة (scope='block': 1، 4، 7 … 28) */
  juz: number;
  /** أرقام أجزاء الكتلة الثلاثة (scope='block' فقط) */
  juzList?: number[];
  /** درجة السرد ٠..١٠٠ (عتبة النجاح ٩٠٪) */
  score: number;
  /** @deprecated تقدير نصّيّ قديم — للقراءة فقط */
  grade?: string;
  /** رقم دورة المراجعة لهذا الجزء/الكتلة (1 = أوّل سرد …) */
  cycle: number;
  date: string;
  sessionId?: string;
  notes?: string;
  createdAt: number;
}

/**
 * سجلّ اختبار جزء — اختبار مستقلّ تمامًا لكلّ جزء مكتمل الحفظ على حِدة.
 *
 * الفرق الجوهريّ عن السرد: السرد يتطلّب كتلة مجمّعة من ٣ أجزاء متتالية عند
 * المرحلة النهائيّة، أمّا الاختبار فمستقلّ لكلّ جزء — كلّما أتمّ الطالب حفظ جزء
 * (٣٠، ٢٩، …) يُفتح اختبار خاصّ بذلك الجزء وحده، بلا أيّ شرط كتلة.
 */
export interface ExamRecord {
  id: string;
  studentId: string;
  circleId: string;
  /** رقم الجزء المُختبَر (١..٣٠) */
  juz: number;
  /** درجة الاختبار ٠..١٠٠ (عتبة النجاح ٩٠٪ = EXAM_PASS) */
  score: number;
  /** رقم محاولة الاختبار لهذا الجزء (١ = أوّل اختبار …) */
  attempt: number;
  date: string;
  sessionId?: string;
  /** اسم المُختبِر (اختياريّ) */
  examiner?: string;
  notes?: string;
  createdAt: number;
}

/** أسماء المجموعات المشتركة على مستوى الجذر */
export const COL = {
  circles: 'circles',
  students: 'students',
  sessions: 'sessions',
  attendance: 'attendance',
  recitations: 'recitations',
  evaluations: 'evaluations',
  serd: 'serd',
  exams: 'exams',
} as const;

/** مجموعة ملفّات المعلّمين (اسم/جوال فقط) */
export const TEACHERS = 'teachers';
