/* ==========================================================================
   نماذج البيانات — مركز أَصيد (واجهة المعلّم)

   تُخزَّن كل بيانات المعلّم داخل مجموعات فرعية تحت مستنده:
     teachers/{uid}
       ├─ circles/{id}
       ├─ students/{id}
       ├─ attendance/{id}
       ├─ recitations/{id}
       └─ evaluations/{id}
   ========================================================================== */

/** حالة الحضور اليومي */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'مأذون له',
};

export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'excused', 'absent'];

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
  /** الفترة/التوقيت: صباحية، مسائية… */
  session?: string;
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

/** سجل الحضور */
export interface AttendanceRecord {
  id: string;
  studentId: string;
  circleId: string;
  /** التاريخ بصيغة YYYY-MM-DD */
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

/** أسماء المجموعات الفرعية تحت مستند المعلّم */
export const SUB = {
  circles: 'circles',
  students: 'students',
  attendance: 'attendance',
  recitations: 'recitations',
  evaluations: 'evaluations',
} as const;

/** المجموعة الجذر للمعلّمين */
export const TEACHERS = 'teachers';
