/* ==========================================================================
   نماذج البيانات — الماهر (واجهة المعلّم)

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
   عتبة النجاح موحّدة ٩٠٪ فأعلى = ناجح، في كلّ سياق: السرد، التقييم اليوميّ،
   اختبار الجزء، والتسميع داخل الجلسة.
   ========================================================================== */

/** عتبة نجاح السرد والتقييم اليوميّ */
export const SARD_PASS = 90;
/** عتبة نجاح اختبار الجزء (مماثلة للسرد) */
export const EXAM_PASS = 90;
/** عتبة نجاح التسميع داخل الجلسة */
export const TASMIE_PASS = 90;

/** يحصر الدرجة ضمن ٠..١٠٠ ويقرّبها لعدد صحيح */
export function clampScore(v: number | string | null | undefined): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(100, n));
}

/** «ناجح» عند بلوغ العتبة، وإلا «إعادة» (يحتاج الطالب إعادة المقطع) */
export function passLabel(score: number, threshold: number): 'ناجح' | 'إعادة' {
  return score >= threshold ? 'ناجح' : 'إعادة';
}

/** فئة الشارة اللونيّة حسب النجاح/الرسوب */
export function scoreClass(score: number, threshold: number): 'pass' | 'fail' {
  return score >= threshold ? 'pass' : 'fail';
}

/**
 * تصنيف نصّيّ أدقّ من `passLabel` (للتقرير المصوَّر ونحوه) — **لا تُغيّر**
 * عتبة النجاح الفعليّة `TASMIE_PASS`/`SARD_PASS`/`EXAM_PASS` (تبقى ٩٠ كما
 * هي في كل مكان آخر بالتطبيق) — هذا تصنيف عرض إضافيّ فوقها فقط.
 * دون ٩٠ = «إعادة» تلقائيًّا (لا اختيار). من ٩٠ فأعلى، المعلّم يختار
 * يدويًّا بين «جيد جدًّا» و«ممتاز» (`RecitationRecord.rating`) — الدرجة
 * وحدها لا تكفي للتفريق بينهما؛ الفئة الوسطى «جيد» أُزيلت بناءً على طلب
 * المستخدم الصريح (كانت مشتقّة تلقائيًّا من الدرجة، أصبحت خيارًا يدويًّا
 * بحتًا لثنائيّة جيد جدًّا/ممتاز فقط). إن كان ≥٩٠ ولم يختر المعلّم بعد،
 * الافتراض «جيد جدًّا» (الأدنى من الفئتين) حتى يُغيَّر صراحةً.
 */
export type ScoreRating = 'إعادة' | 'جيد جدًّا' | 'ممتاز';
export function ratingLabel(score: number, rating?: 'very_good' | 'excellent'): ScoreRating {
  if (score < 90) return 'إعادة';
  return rating === 'excellent' ? 'ممتاز' : 'جيد جدًّا';
}

/**
 * نفس منطق `ratingLabel()` لكن بعتبة نجاح متغيّرة (لا ٩٠ ثابتة) — لاختبارات
 * التجويد، حيث لكلّ اختبار علامته الكلّية وعلامة نجاحه الخاصّتين (وليست
 * بالضرورة نسبة مئويّة من ١٠٠).
 */
export function tajweedExamVerdict(
  score: number,
  passScore: number,
  rating?: 'very_good' | 'excellent',
): ScoreRating {
  if (score < passScore) return 'إعادة';
  return rating === 'excellent' ? 'ممتاز' : 'جيد جدًّا';
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

/* ==========================================================================
   عزل الحسابات (تعدّد المستأجرين) — يبدأ من v1.15.0:
     • الحسابات القديمة: ملفّ المعلّم بلا `tenantId` → «مساحة مشتركة» ترى كلّ
       المستندات القديمة (بلا `ownerId`) كما كانت تمامًا — بلا أيّ تغيير.
     • الحسابات الجديدة (تسجيل جديد أو Google): ملفّ المعلّم يحمل `tenantId`
       = مُعرّف المستخدم، وكلّ مستنداتها تُوسَم بـ `ownerId` = نفس المُعرّف،
       فترى مساحتها وحدها فقط. لا تُلمَس بيانات الحسابات القديمة إطلاقًا.
   ========================================================================== */

/** مالك المستند في نظام العزل — غائب على كلّ المستندات القديمة (مساحة مشتركة). */
export interface Owned {
  ownerId?: string;
}

/** المعلّم */
export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /**
   * مساحة عمل معزولة لهذا الحساب — يساوي `uid`. يُضبَط للحسابات المُنشأة من
   * v1.15.0 فأحدث فقط؛ غيابه يعني حسابًا قديمًا في المساحة المشتركة.
   */
  tenantId?: string;
  /** ترويسة رسالة تقرير الجلسة للأهالي — يفرغها المعلّم من الإعدادات (وإلّا `DEFAULT_REPORT_INTRO`) */
  reportIntro?: string;
  /** خاتمة رسالة تقرير الجلسة للأهالي (وإلّا `DEFAULT_REPORT_OUTRO`) */
  reportOutro?: string;
  /** معرّف جهاز ثابت (يُولَّد محليًّا مرّة واحدة) — لأغراض لوحة المالك فقط، راجع v1.26.0 أسفل الملفّ. */
  deviceId?: string;
  /** المنصّة وقت التسجيل: 'android' أو 'web' (Capacitor.getPlatform()). */
  platform?: string;
  createdAt: number;
}

/** ترويسة افتراضيّة لتقرير الجلسة (تُستبدل من إعدادات المعلّم). */
export const DEFAULT_REPORT_INTRO =
  'السلام عليكم ورحمة الله وبركاته\nحيّاكم الله أولياء الأمور، هذا تقرير حلقة اليوم:';
/** خاتمة افتراضيّة لتقرير الجلسة (تُستبدل من إعدادات المعلّم). */
export const DEFAULT_REPORT_OUTRO =
  'بارك الله في أبنائكم وأعانهم على حفظ كتابه، وجزاكم الله خيرًا على حسن المتابعة.';

/** الحلقة */
export interface Circle extends Owned {
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

/** هل الحلقة حلقة تجويد؟ — مادّة دراسة لا تسميع/سرد قرآنيّ. */
export function isTajweedCircle(c: Pick<Circle, 'type'> | null | undefined): boolean {
  return !!c && c.type === 'tajweed';
}

/** الطالب */
export interface Student extends Owned {
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
export interface Session extends Owned {
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
export interface AttendanceRecord extends Owned {
  id: string;
  sessionId: string;
  studentId: string;
  circleId: string;
  /** تاريخ الجلسة بصيغة YYYY-MM-DD */
  date: string;
  status: AttendanceStatus;
  /** وقت الحضور «HH:MM» — يُملأ تلقائيًّا عند تعليم الطالب حاضرًا/متأخّرًا، وقابل للتعديل */
  arrivalTime?: string;
  /** وقت الانصراف «HH:MM» — يُملأ تلقائيًّا عند إنهاء الجلسة، وقابل للتعديل */
  departureTime?: string;
  note?: string;
  createdAt: number;
}

/** سجل التسميع (مقدار الحفظ وما سُمِع) */
export interface RecitationRecord extends Owned {
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
  /** درجة التسميع ٠..١٠٠ (عتبة النجاح ٩٠٪) */
  score: number;
  /** @deprecated تقدير نصّيّ قديم — للقراءة فقط */
  grade?: string;
  /** أخطاء التجويد */
  tajweedErrors: number;
  /** أخطاء الحفظ (الأخطاء المباشرة) */
  hifzErrors: number;
  /** عدد مرات التلقين / الفتح على الطالب — يُعرَض في الواجهة باسم «التردّد» */
  promptCount: number;
  /**
   * تقييم المعلّم اليدويّ — ذو معنى فقط عندما تبلغ `score` ٩٠ فأعلى (دون
   * ذلك التصنيف «إعادة» تلقائيًّا، لا حاجة لحقل). المعلّم يختار يدويًّا
   * بين «جيد جدًّا» و«ممتاز» بدل اشتقاقها تلقائيًّا من الدرجة فقط — راجع
   * `ratingLabel()` أدناه.
   */
  rating?: 'very_good' | 'excellent';
  /**
   * المدّة الفعليّة للتسميع بالثواني (من مؤقّت الجلسة).
   * المعيار: ٤ دقائق لكلّ وجه → المتوقّع = pages × ٢٤٠ ثانية.
   */
  durationSec?: number;
  /**
   * الطالب حاضر لكنّه لم يسمّع في هذه الجلسة — حالة صريحة يسجّلها المعلّم
   * (وليست مجرّد غياب بيانات). عند `true` تبقى بقيّة حقول المقطع/الدرجة
   * صفريّة بلا معنى فعليّ؛ يجب استثناء هذا السجلّ من كلّ حسابات المتوسّط
   * والصفحات ونسبة النجاح — راجع `isActualRecitation()` أدناه.
   */
  notRecited?: boolean;
  /**
   * ملاحظة/تأجيل — بديل لطيف عن «لم يسمّع» (v1.26.9): نفس فكرة `notRecited`
   * (لا مقطع فعليّ) لكن بلا الصياغة السلبيّة في التقرير؛ `notes` هنا تُطبَع
   * كما هي مباشرةً («أُجِّل التسميع ليوم الأحد» مثلًا) بدل «لم يسمّع».
   */
  postponed?: boolean;
  notes?: string;
  createdAt: number;
}

/** سجلّ تسميع فعليّ (وليس مجرّد علامة «لم يسمّع»/«ملاحظة»‎) — للاستخدام في كل حسابات المتوسّط/الصفحات/النجاح. */
export function isActualRecitation(r: RecitationRecord): boolean {
  return !r.notRecited && !r.postponed;
}

/** المعيار الزمنيّ للتسميع: ٤ دقائق (٢٤٠ ثانية) لكلّ وجه. */
export const SECONDS_PER_PAGE = 240;

/** الزمن المتوقّع للتسميع بالثواني وفق عدد الأوجه (٤ د/وجه). */
export function expectedRecitationSec(pages: number): number {
  return Math.round(Math.max(0, pages) * SECONDS_PER_PAGE);
}

/** التقييم اليومي */
export interface EvaluationRecord extends Owned {
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
export interface SerdRecord extends Owned {
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

/** نوع الاختبار */
export type ExamScope = 'juz' | 'block';

export const EXAM_SCOPE_LABELS: Record<ExamScope, string> = {
  juz: 'اختبار جزء',
  block: 'اختبار مجمّع (٣ أجزاء)',
};

/**
 * سجلّ اختبار — اختبار جزء مفرد فور اكتمال حفظه، أو اختبار مجمّع لكتلة ٣
 * أجزاء متتالية بعد اختبار كلٍّ منها منفردًا (مثل السرد تمامًا).
 *
 * الشرط الأساسيّ: لا يُفتح اختبار جزء إلّا بعد اكتمال حفظه (`completedJuz`)،
 * ولا يُفتح الاختبار المجمّع لكتلة إلّا بعد اختبار أجزائها الثلاثة فرديًّا —
 * يُحسَب هذا كلّه في `analyzeExam()` (core/exam.ts)، لا يُخزَّن كحقل مباشر.
 */
export interface ExamRecord extends Owned {
  id: string;
  studentId: string;
  circleId: string;
  /**
   * نوع الاختبار. اختياريّ للتوافق مع سجلّات قديمة أُنشئت قبل إضافة الاختبار
   * المجمّع — كانت كلّها اختبار جزء مفرد، فتُقرأ القيمة الغائبة كـ 'juz'.
   */
  scope?: ExamScope;
  /** رقم الجزء المُختبَر (scope='juz') أو رقم الكتلة (scope='block': ١..١٠) */
  juz: number;
  /** أرقام أجزاء الكتلة الثلاثة (scope='block' فقط) */
  juzList?: number[];
  /** درجة الاختبار ٠..١٠٠ (عتبة النجاح ٩٠٪ = EXAM_PASS) */
  score: number;
  /** رقم محاولة الاختبار لهذا الجزء/الكتلة (١ = أوّل اختبار …) */
  attempt: number;
  date: string;
  sessionId?: string;
  /** اسم المُختبِر (اختياريّ) */
  examiner?: string;
  notes?: string;
  createdAt: number;
}

/**
 * اختبار تجويد — حدث اختبار واحد داخل حلقة تجويد (مبحث/اسم + تاريخ ووقت
 * ومدّة + قائمة الطلّاب المستهدَفين)، مستقلّ تمامًا عن اختبارات أجزاء القرآن
 * (`ExamRecord` أعلاه، خاصّ بحلقات التحفيظ). راجع `TajweedExamResult` لدرجة
 * كلّ طالب ضمن هذا الاختبار.
 */
export interface TajweedExam extends Owned {
  id: string;
  circleId: string;
  /** اسم الاختبار أو المبحث — مثال: «مخارج الحروف» */
  name: string;
  date: string;
  time?: string;
  /** مدّة الاختبار بالدقائق (اختياريّ) */
  durationMin?: number;
  /** الطلّاب المستهدَفون بهذا الاختبار (اختيار الكلّ أو فئة منهم) */
  studentIds: string[];
  /** العلامة الكلّية للاختبار (مثال: ٢٠) — ليست بالضرورة ١٠٠، خاصّة بكلّ اختبار. */
  totalScore: number;
  /** علامة النجاح — يجب ألّا تتجاوز `totalScore`. */
  passScore: number;
  createdAt: number;
}

/**
 * درجة طالب واحد ضمن اختبار تجويد — سجلّ واحد لكلّ (اختبار، طالب)، معرّفه
 * `{examId}_{studentId}`. `examName`/`date`/`totalScore`/`passScore` منسوخة
 * من `TajweedExam` وقت الحفظ (تكرار متعمَّد) حتى تعرض صفحة ملفّ الطالب
 * النتائج (بما فيها حالة النجاح/الإعادة) دون استعلام إضافيّ عبر المجموعتين.
 */
export interface TajweedExamResult extends Owned {
  id: string;
  examId: string;
  circleId: string;
  studentId: string;
  examName: string;
  date: string;
  totalScore: number;
  passScore: number;
  /** الدرجة الفعليّة المُحرَزة ٠..totalScore (وليست نسبة مئويّة). */
  score: number;
  /**
   * تقييم المعلّم اليدويّ — ذو معنى فقط عند `score >= passScore` (دون ذلك
   * الحالة «إعادة» تلقائيًّا بلا حاجة لحقل). نفس مفهوم `RecitationRecord.rating`.
   */
  rating?: 'very_good' | 'excellent';
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
  tajweedExams: 'tajweedExams',
  tajweedExamResults: 'tajweedExamResults',
  activityLog: 'activityLog',
} as const;

/** مجموعة ملفّات المعلّمين (اسم/جوال فقط) */
export const TEACHERS = 'teachers';

/* ==========================================================================
   سجلّ الحركات (تدقيق + حذف ناعم + استعادة) — v1.21.0
   كلّ حذف أو استبدال لبيانات حسّاسة (طالب، حلقة، تسميع، حضور، سرد، اختبار،
   تقييم) يُسجَّل هنا قبل تنفيذه، مع لقطة كاملة (`snapshots`) تكفي لاستعادة
   الحالة السابقة تمامًا بنفس المجموعة والمعرّف — راجع
   `DataService.restoreActivity()`. لا يُحذف من هذا السجلّ تلقائيًّا أبدًا.
   ========================================================================== */

/** نوع الحركة المسجَّلة. */
export type ActivityAction = 'create' | 'update' | 'delete';

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
};

/** نوع السجلّ المتأثّر بالحركة. */
export type ActivityTarget =
  | 'student'
  | 'circle'
  | 'session'
  | 'attendance'
  | 'recitation'
  | 'evaluation'
  | 'serd'
  | 'exam'
  | 'tajweedExam';

export const ACTIVITY_TARGET_LABELS: Record<ActivityTarget, string> = {
  student: 'طالب',
  circle: 'حلقة',
  session: 'جلسة',
  attendance: 'حضور',
  recitation: 'تسميع',
  evaluation: 'تقييم يوميّ',
  serd: 'سرد',
  exam: 'اختبار',
  tajweedExam: 'اختبار تجويد',
};

/** حقل تغيّر ضمن حركة «تعديل» — بقيمتيه قبل وبعد، لعرض تفصيليّ. */
export interface ActivityFieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** لقطة مستند كامل قبل تغييره/حذفه — تكفي وحدها لاستعادته بنفس مجموعته ومعرّفه. */
export interface ActivitySnapshot {
  collectionName: string;
  id: string;
  data: Record<string, unknown>;
}

/** سجلّ حركة واحدة — إدخال/تعديل/حذف. */
export interface ActivityLogEntry extends Owned {
  id: string;
  action: ActivityAction;
  target: ActivityTarget;
  /** نصّ عربيّ جاهز للعرض يلخّص الحركة. */
  summary: string;
  /** تفاصيل الحقول المتغيّرة (action='update' فقط، إن وُجد تغيير فعليّ). */
  fieldChanges?: ActivityFieldChange[];
  /** لقطات الحالة قبل الحركة — أساس الاستعادة. غائبة لحركات «إضافة». */
  snapshots?: ActivitySnapshot[];
  studentName?: string;
  circleName?: string;
  sessionLabel?: string;
  /** اسم المعلّم الذي نفّذ الحركة، وقت وقوعها. */
  actorName?: string;
  /** وقت الاستعادة إن استُعيدت هذه الحركة (null/غائب = لم تُستعَد بعد). */
  restoredAt?: number | null;
  createdAt: number;
}

/* ==========================================================================
   لوحة المالك (v1.26.0) — طبقة مراقبة منفصلة تمامًا عن بيانات المعلّمين
   المعزولة (circles/students/...). لا تُقرأ هذه المجموعات إلّا من حساب
   المالك (request.auth.token.email == OWNER_EMAIL في firestore.rules)،
   وتُكتَب من كل معلّم لبياناته الخاصّة فقط (نفس نمط ownerId=uid المعتاد).

   قرار معماريّ متعمَّد: بدل إضافة قراءة المالك على قواعد المجموعات
   القائمة (circles/students/...) — وهذا كان سيعيد فتح ثغرة قوائم Firestore
   الحقيقيّة المُصلَحة للتوّ (v1.25.4، راجع الذاكرة الدائمة: أيّ شرط OR إضافيّ
   على قاعدة list يُبطل إثبات الأمان، حتى لو كان الشرط الجديد نفسه آمنًا
   بمفرده) — بُنيت مجموعات منفصلة تمامًا، كل قاعدة list فيها شرط واحد بسيط
   بلا أيّ OR (isPlatformOwner() فقط)، بنفس الشكل المُثبَت آمنًا تجريبيًّا.
   الثمن: نسخ خفيفة (اسم فقط تقريبًا) تُكتَب من جانب التطبيق عند كل إنشاء/
   حذف حلقة أو طالب أو تسميع، لا مصدر بيانات إضافيّ حقيقيّ.
   ========================================================================== */

/** بريد حساب المالك الوحيد المسموح له بلوحة المراقبة — راجع firestore.rules أيضًا (يجب أن يطابق تمامًا). */
export const OWNER_EMAIL = 'samaster@assid.local';

/** أسماء مجموعات لوحة المالك. */
export const PLATFORM_COL = {
  /** ملخّص لكلّ معلّم — مستند واحد بمعرّف uid المعلّم نفسه. */
  teachers: 'platformTeachers',
  /** عدّادات عامّة على مستوى المنصّة كلّها — مستند واحد ثابت المعرّف 'global'. */
  statsDoc: 'platformStats/global',
  /** نسخة من كل حركة حذف حقيقيّة (activityLog) — يقرؤها المالك فقط، بنفس آليّة الاستعادة. */
  deletedItems: 'platformDeletedItems',
} as const;

/** ملخّص معلّم واحد — يُكتَب/يُحدَّث من جهاز المعلّم نفسه فقط، يقرؤه المالك فقط. */
export interface PlatformTeacherSummary {
  id: string;
  name: string;
  email: string;
  deviceId?: string;
  platform?: string;
  circleCount: number;
  studentCount: number;
  recitationCount: number;
  memorizedCount: number;
  createdAt: number;
  lastActiveAt: number;
}

/** نسخة خفيفة لحلقة/طالب ضمن ملخّص معلّم — للتصفّح والبحث من لوحة المالك فقط. */
export interface PlatformMirrorItem {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  createdAt: number;
}

/** عدّادات عامّة على مستوى المنصّة — مستند واحد، يُحدَّث بـ increment() من كل الأجهزة. */
export interface PlatformStats {
  totalTeachers: number;
  totalCircles: number;
  totalStudents: number;
  totalRecitations: number;
  uniqueDevices: number;
}
