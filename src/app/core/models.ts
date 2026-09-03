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

/** التقدير */
export type Grade = 'excellent' | 'very_good' | 'good' | 'fair' | 'weak';

export const GRADE_LABELS: Record<Grade, string> = {
  excellent: 'ممتاز',
  very_good: 'جيد جدًا',
  good: 'جيد',
  fair: 'مقبول',
  weak: 'ضعيف',
};

export const GRADE_ORDER: Grade[] = ['excellent', 'very_good', 'good', 'fair', 'weak'];

/** قيمة رقمية للتقدير (لحساب المتوسط) */
export const GRADE_VALUE: Record<Grade, number> = {
  excellent: 5,
  very_good: 4,
  good: 3,
  fair: 2,
  weak: 1,
};

export function gradeFromValue(v: number): Grade {
  const r = Math.round(v);
  return (GRADE_ORDER.find((g) => GRADE_VALUE[g] === r) ?? 'good') as Grade;
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

/** «اسم الحلقة — الموضوع» — يُعرَض أينما ظهرت الحلقة (الإسناد، القوائم، الترويسات). */
export function circleLabel(c: Pick<Circle, 'name' | 'type'> | null | undefined): string {
  if (!c) return 'حلقة محذوفة';
  return c.type ? `${c.name} — ${CIRCLE_TYPE_SHORT[c.type]}` : c.name;
}

/** الطالب */
export interface Student {
  id: string;
  name: string;
  circleId: string;
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
  grade: Grade;
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
  memorization: Grade;
  review: Grade;
  tajweed: Grade;
  /** الانتباه والتفاعل داخل الحلقة */
  attention: Grade;
  /** الأدب والسلوك */
  behavior: Grade;
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
  grade: Grade;
  /** رقم دورة المراجعة لهذا الجزء/الكتلة (1 = أوّل سرد …) */
  cycle: number;
  date: string;
  sessionId?: string;
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
} as const;

/** مجموعة ملفّات المعلّمين (اسم/جوال فقط) */
export const TEACHERS = 'teachers';
