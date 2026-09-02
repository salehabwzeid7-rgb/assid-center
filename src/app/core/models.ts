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
export type SessionStatus = 'open' | 'closed';

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  open: 'مفتوحة',
  closed: 'منتهية',
};

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
  /** الفترة/التوقيت: مثال «بعد المغرب — من الأحد إلى الخميس» */
  schedule?: string;
  createdAt: number;
}

/** الطالب */
export interface Student {
  id: string;
  name: string;
  circleId: string;
  guardianPhone?: string;
  phone?: string;
  birthDate?: string;
  /** المستوى أو الصف الدراسي */
  level?: string;
  /** المقرر الحالي (وصف حر) */
  currentPlan?: string;
  active: boolean;
  createdAt: number;
}

/** جلسة الحلقة (حصّة) */
export interface Session {
  id: string;
  circleId: string;
  /** التاريخ بصيغة YYYY-MM-DD */
  date: string;
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

/** أسماء المجموعات المشتركة على مستوى الجذر */
export const COL = {
  circles: 'circles',
  students: 'students',
  sessions: 'sessions',
  attendance: 'attendance',
  recitations: 'recitations',
  evaluations: 'evaluations',
} as const;

/** مجموعة ملفّات المعلّمين (اسم/جوال فقط) */
export const TEACHERS = 'teachers';
