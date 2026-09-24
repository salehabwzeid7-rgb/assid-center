import { Injectable, computed, inject, signal, type Signal, type DestroyRef } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  query,
  where,
  writeBatch,
  deleteField,
  arrayUnion,
  increment,
  runTransaction,
  collectionGroup,
  orderBy,
  limit as fbLimit,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from './firebase';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { completedJuz } from './quran-data';
import {
  COL,
  PLATFORM_COL,
  ATTENDANCE_LABELS,
  type Circle,
  type CircleType,
  type TajweedLevel,
  type Student,
  type Session,
  type SessionStatus,
  studentCircleIds,
  type AttendanceRecord,
  type RecitationRecord,
  type EvaluationRecord,
  type SerdRecord,
  type ExamRecord,
  type TajweedExam,
  type TajweedExamResult,
  type ActivityAction,
  type ActivityTarget,
  type ActivityFieldChange,
  type ActivitySnapshot,
  type ActivityLogEntry,
  type PlatformTeacherSummary,
  type PlatformMirrorItem,
  type PlatformSessionMirror,
  type PlatformStats,
  isActualRecitation,
} from './models';

/** حقل + تسميته العربيّة — أساس بناء `ActivityFieldChange[]` بمقارنة مباشرة. */
type DiffField = { key: string; label: string };

/** يقارن حقول محدّدة بين نسختين ويُعيد التغييرات الفعليّة فقط (يتجاهل undefined↔null). */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: DiffField[],
): ActivityFieldChange[] {
  const changes: ActivityFieldChange[] = [];
  for (const { key, label } of fields) {
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (b !== a) changes.push({ field: key, label, before: b, after: a });
  }
  return changes;
}

const RECITATION_DIFF_FIELDS: DiffField[] = [
  { key: 'kind', label: 'نوع التسميع' },
  { key: 'fromSurah', label: 'من سورة' },
  { key: 'fromAyah', label: 'من آية' },
  { key: 'toSurah', label: 'إلى سورة' },
  { key: 'toAyah', label: 'إلى آية' },
  { key: 'pages', label: 'عدد الأوجه' },
  { key: 'score', label: 'النسبة' },
  { key: 'hifzErrors', label: 'أخطاء الحفظ' },
  { key: 'tajweedErrors', label: 'أخطاء التجويد' },
  { key: 'promptCount', label: 'التردّد' },
  { key: 'rating', label: 'التقييم' },
  { key: 'notRecited', label: 'لم يسمّع' },
  { key: 'notes', label: 'ملاحظات التسميع' },
];
const ATTENDANCE_DIFF_FIELDS: DiffField[] = [{ key: 'status', label: 'حالة الحضور' }];
const STUDENT_DIFF_FIELDS: DiffField[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'level', label: 'المستوى' },
  { key: 'guardianPhone', label: 'جوال ولي الأمر' },
  { key: 'birthDate', label: 'تاريخ الميلاد' },
  { key: 'currentPlan', label: 'المقرّر الحاليّ' },
  { key: 'active', label: 'نشط' },
];
const CIRCLE_DIFF_FIELDS: DiffField[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'type', label: 'النوع' },
  { key: 'tajweedLevel', label: 'مستوى التجويد' },
  { key: 'fromTime', label: 'بداية الحصّة' },
  { key: 'toTime', label: 'نهاية الحصّة' },
];
const TAJWEED_EXAM_RESULT_DIFF_FIELDS: DiffField[] = [
  { key: 'score', label: 'الدرجة' },
  { key: 'rating', label: 'التقييم' },
  { key: 'notes', label: 'ملاحظات' },
];

/** التاريخ الحالي بصيغة YYYY-MM-DD (توقيت الجهاز المحلي) */
export function today(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** تواريخ الأيام المتكرّرة القادمة (من اليوم حتى +horizonDays) الموافقة لأيام الأسبوع المختارة */
export function upcomingDatesFor(weekdays: number[], horizonDays: number): string[] {
  const set = new Set(weekdays);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    if (set.has(d.getDay())) out.push(toDateStr(d));
  }
  return out;
}

type NewCircle = {
  name: string;
  type: CircleType;
  tajweedLevel?: TajweedLevel;
  weekdays: number[];
  fromTime: string;
  toTime: string;
};
type NewStudent = Omit<Student, 'id' | 'createdAt'>;
type NewRecitation = Omit<RecitationRecord, 'id' | 'createdAt'>;
type NewEvaluation = Omit<EvaluationRecord, 'id' | 'createdAt'>;
type NewSerd = Omit<SerdRecord, 'id' | 'createdAt'>;
type NewExam = Omit<ExamRecord, 'id' | 'createdAt'>;

@Injectable({ providedIn: 'root' })
export class DataService {
  private auth = inject(AuthService);
  private notify = inject(NotifyService);

  /**
   * مساحة العمل الحاليّة:
   *   • null  → حساب قديم (مساحة مشتركة): يرى المستندات القديمة بلا `ownerId` فقط.
   *   • uid   → حساب معزول: يرى ويكتب المستندات المملوكة له (`ownerId === uid`) فقط.
   * تُقرأ لحظيًّا من ملفّ المعلّم، فلا حاجة لإعادة تحميل عند تبدّل الحساب.
   */
  private scopeUid(): string | null {
    return this.auth.tenantId();
  }

  /** يُبقي من الصفوف ما يخصّ مساحة العمل الحاليّة (عزل الحسابات — عميلٌ جانبيّ). */
  private inScope<T extends { ownerId?: string }>(rows: T[]): T[] {
    const uid = this.scopeUid();
    return rows.filter((r) => (uid ? r.ownerId === uid : !r.ownerId));
  }

  /** يَسِم مستندًا جديدًا بمالكه في الحسابات المعزولة (لا شيء في المساحة المشتركة). */
  private owned<T extends Record<string, unknown>>(obj: T): T {
    const uid = this.scopeUid();
    return uid ? ({ ...obj, ownerId: uid } as T) : obj;
  }

  /** مجموعة مشتركة على مستوى الجذر */
  private col(name: string): CollectionReference<DocumentData> {
    return collection(db, name);
  }
  private ref(name: string, id: string) {
    return doc(db, name, id);
  }

  /**
   * استعلام مُقيَّد بمالك الحساب — ثغرة أمنيّة حقيقيّة مؤكَّدة (مراجعة أمنيّة،
   * اختُبرت مباشرةً ضدّ مشروع الإنتاج الحقيقيّ بحسابين مستقلّين): كنّا نظنّ
   * (منذ v1.21.1) أنّ استعلامات القوائم (`getDocs`/`onSnapshot` على مجموعة
   * كاملة بلا `where`) تُصفّى فعليًّا على الخادم حسب قاعدة `isOwner()` لكلّ
   * مستند، تمامًا كما تُرفَض قراءة/تعديل/حذف مستند واحد بمعرّفه (وهذا الجزء
   * صحيح ومؤكَّد). لكن اختبار اختراق مباشر أظهر أنّ استعلام قائمة غير مقيَّد
   * يُرجع فعليًّا مستندات مملوكة لحساب آخر تمامًا — القاعدة لا تُطبَّق لكلّ
   * مستند في نتيجة القائمة كما تُطبَّق على get/update/delete المفرد. الحلّ:
   * تقييد الاستعلام نفسه بـ `where('ownerId','==',uid)` للحسابات المعزولة،
   * بحيث تتحقّق القاعدة بشكل بديهيّ (مطابقة تامّة، بلا حاجة لفهرس مركّب — عدّة
   * شروط `==` على حقول مختلفة تُفهرَس تلقائيًّا في Firestore).
   *
   * الحسابات القديمة (بلا ownerId، مساحة مشتركة، تينانت=null) تبقى بلا هذا
   * الشرط الإضافيّ عمدًا — Firestore لا يدعم استعلام «الحقل غير موجود»، فلا
   * توجد طريقة لتقييد استعلامها بنفس الأسلوب دون هجرة بيانات. يبقى هذا خطرًا
   * متبقّيًا موثَّقًا لهذه الفئة تحديدًا (مجموعة حسابات مغلقة لا تكبر — كلّ
   * حساب جديد من v1.15.0 فصاعدًا يُصبح تينانت تلقائيًّا)، لا الفئة السائدة.
   */
  private scopedCol(name: string, ...constraints: QueryConstraint[]): Query<DocumentData> {
    const uid = this.scopeUid();
    return uid
      ? query(this.col(name), where('ownerId', '==', uid), ...constraints)
      : query(this.col(name), ...constraints);
  }

  /**
   * ترقية حساب قديم/مشترك إلى حساب معزول (tenant) — إصلاح لانكسار حقيقيّ
   * سبّبته قاعدة `list` الصارمة الجديدة (v1.25.4): أصبحت تشترط تطابق ownerId
   * تمامًا، فحسابٌ قديم (بلا ownerId على مستنداته) توقّف عن رؤية أيّ قائمة
   * بيانات كليًّا. الحلّ الآمن الوحيد المتاح بلا هجرة عبر بيانات اعتماد
   * إداريّة: تشغيل الترحيل من **نفس الجهاز الذي زامن هذه البيانات من قبل** —
   * `getDocsFromCache()` يقرأ من الذاكرة المحليّة المخبَّأة على هذا الجهاز
   * فقط (IndexedDB)، بلا لمس الخادم إطلاقًا، فلا يصطدم بقاعدة list الجديدة
   * أبدًا (القراءة محليّة بحتة). لكل مستند بلا ownerId هناك، تُكتب `ownerId
   * = uid` هذا الحساب (كتابة عاديّة تمرّ قواعد update الحاليّة بلا أيّ تغيير
   * فيها: isOwnerOrMissing(resource) صحيح لمستند بلا ownerId، وisOwner
   * للبيانات الجديدة صحيح لأنّ ownerId الجديد يساوي uid كاتبه بالضبط).
   * تحويل tenantId يحدث أخيرًا فقط، بعد نجاح ترحيل كل شيء.
   *
   * **لا تُشغَّل تلقائيًّا** — فقط من زرّ صريح في صفحة الحساب، ولمرّة واحدة.
   * إن كان الجهاز لم يفتح صفحات كافية من قبل ليُزامن كل البيانات محليًّا،
   * سيُرحِّل فقط ما هو موجود في الكاش — الأصحّ تشغيلها من الجهاز/الحساب
   * الأكثر استخدامًا للتطبيق (الأرجح مزامَن بالكامل).
   */
  async upgradeLegacyAccountToTenant(
    onProgress?: (collectionName: string, migratedCount: number) => void,
  ): Promise<number> {
    if (this.auth.isTenant()) return 0;
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('غير مسجَّل الدخول');
    let migrated = 0;
    for (const name of Object.values(COL)) {
      const snap = await getDocsFromCache(query(this.col(name)));
      const targets = snap.docs.filter((d) => !('ownerId' in (d.data() as object)));
      for (const d of targets) {
        await updateDoc(d.ref, { ownerId: uid });
        migrated++;
      }
      onProgress?.(name, targets.length);
    }
    await this.auth.promoteToTenant();
    return migrated;
  }

  /**
   * يملأ ملخّص لوحة المالك (v1.26.0) وقت أوّل دخول لحساب معلّم موجود مسبقًا
   * (سجَّل قبل شحن الميزة، أو ببساطة لم يُنشئ/يحذف شيئًا منذئذٍ فيُحدَّث
   * تلقائيًّا) — بدون هذا، `platformTeachers/{uid}` يبقى ناقصًا أو غائبًا كليًّا
   * فتظهر لوحة المالك هذا المعلّم بعدّادات صفريّة/غائبة رغم أنّ لديه حلقات
   * وطلّابًا حقيقيّين (v1.26.3، خلل مُبلَّغ: "بيانات قديمة لا تظهر").
   * محميّة من إعادة العمل: تتوقّف فورًا إن وجدت الملخّص مكتملًا بالفعل
   * (circleCount رقم حقيقيّ، لا `undefined`) — فلا تُعيد حساب كل شيء في كل
   * دخول عاديّ. تُستدعى من DataService لا AuthService عمدًا (auth.service.ts
   * لا يستطيع حقن DataService بلا حلقة اعتماديّة، وهذه العمليّة تحتاج
   * `scopedCol()` وكل استعلامات هذا الملفّ).
   */
  async backfillPlatformTeacherSummary(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.auth.isOwnerAccount()) return;
    try {
      const existing = await getDoc(doc(db, PLATFORM_COL.teachers, uid));
      const data = existing.exists() ? (existing.data() as Partial<PlatformTeacherSummary>) : null;
      if (data && typeof data.circleCount === 'number') return; // مكتمل بالفعل

      const [circles, students, recitations] = await Promise.all([
        getDocs(this.scopedCol(COL.circles)),
        getDocs(this.scopedCol(COL.students)),
        getDocs(this.scopedCol(COL.recitations)),
      ]);
      const recitationCount = recitations.docs.filter((d) =>
        isActualRecitation(d.data() as RecitationRecord),
      ).length;
      let memorizedCount = 0;
      for (const d of students.docs) {
        memorizedCount += ((d.data() as Student).memorizedSurahs ?? []).length;
      }
      const teacher = this.auth.teacher();
      const wasNeverCounted = !data; // لم يوجد ملخّص إطلاقًا (لا حتى ناقص) — لم يُحتسَب بعدّادات platformStats من قبل
      await setDoc(
        doc(db, PLATFORM_COL.teachers, uid),
        {
          name: teacher?.name ?? '',
          email: teacher?.email ?? '',
          deviceId: teacher?.deviceId ?? data?.deviceId ?? '',
          platform: teacher?.platform ?? data?.platform ?? '',
          circleCount: circles.size,
          studentCount: students.size,
          recitationCount,
          memorizedCount,
          createdAt: teacher?.createdAt ?? data?.createdAt ?? Date.now(),
          lastActiveAt: Date.now(),
        },
        { merge: true },
      );
      for (const c of circles.docs) {
        const cd = c.data() as Circle;
        await setDoc(doc(db, PLATFORM_COL.teachers, uid, 'circleMirror', c.id), {
          id: c.id,
          name: cd.name,
          teacherId: uid,
          teacherName: teacher?.name ?? '',
          createdAt: cd.createdAt ?? Date.now(),
        });
      }
      for (const s of students.docs) {
        const sd = s.data() as Student;
        await setDoc(doc(db, PLATFORM_COL.teachers, uid, 'studentMirror', s.id), {
          id: s.id,
          name: sd.name,
          teacherId: uid,
          teacherName: teacher?.name ?? '',
          createdAt: sd.createdAt ?? Date.now(),
        });
      }
      if (wasNeverCounted) {
        await setDoc(
          doc(db, PLATFORM_COL.statsDoc),
          {
            totalTeachers: increment(1),
            totalCircles: increment(circles.size),
            totalStudents: increment(students.size),
            totalRecitations: increment(recitationCount),
          },
          { merge: true },
        );
      }
    } catch {
      // صامت عمدًا — يُعاد المحاولة تلقائيًّا في الدخول التالي (لم تُعلَّم مكتملة).
    }
  }

  /**
   * ينفّذ قائمة عمليّات حذف/تحديث على دفعات ذرّيّة (≤ ٤٥٠ عمليّة لكلّ دفعة، حدّ
   * Firestore ٥٠٠). كلّ دفعة إمّا تنجح كاملةً أو تفشل كاملةً؛ والتغيير ينعكس فورًا
   * على التخزين المحلّيّ (IndexedDB) وعلى السحابة عبر نفس مستمعي onSnapshot.
   */
  private async runBatched(
    ops: (
      | { kind: 'delete'; ref: DocumentReference }
      | { kind: 'update'; ref: DocumentReference; data: Record<string, unknown> }
      | { kind: 'set'; ref: DocumentReference; data: Record<string, unknown> }
    )[],
  ): Promise<void> {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        if (op.kind === 'delete') batch.delete(op.ref);
        else if (op.kind === 'update') batch.update(op.ref, op.data);
        else batch.set(op.ref, op.data);
      }
      await batch.commit();
    }
  }

  // ======================================================================
  //  سجلّ الحركات (تدقيق + حذف ناعم + استعادة) — v1.21.0
  // ======================================================================

  /**
   * يسجّل حركة (إضافة/تعديل/حذف) في `activityLog` قبل أو بعد تنفيذها.
   * فشل التسجيل نفسه لا يجب أن يوقف العمليّة الأصليّة — يُسجَّل خطأ بالكونسول
   * فقط ويُكمَل العمل، فسجلّ التدقيق شبكة أمان إضافيّة لا مصدر البيانات الأساسيّ.
   */
  private async logActivity(
    entry: Omit<ActivityLogEntry, 'id' | 'createdAt' | 'ownerId' | 'actorName' | 'restoredAt'>,
  ): Promise<void> {
    try {
      const payload = this.owned(
        clean({
          ...entry,
          actorName: this.auth.teacher()?.name ?? '',
          createdAt: Date.now(),
          restoredAt: null,
        }),
      );
      const created = await addDoc(this.col(COL.activityLog), payload);
      // مرآة لوحة المالك (v1.26.0): نسخة من كل حركة حذف حقيقيّة فقط، بنفس
      // المعرّف، حتى يقدر المالك يراجعها/يستعيدها بمعزل تامّ عن activityLog
      // الأصليّ (قواعد منفصلة بالكامل — راجع التعليق في firestore.rules).
      if (entry.action === 'delete') {
        await this.writePlatformDeletedItem(created.id, payload);
      }
    } catch (e) {
      console.error('تعذّر تسجيل الحركة في سجل التدقيق:', e);
    }
  }

  // ======================================================================
  //  لوحة المالك (v1.26.0) — كتابة المرايا الخفيفة فقط، بلا أيّ تأثير على
  //  المسارات الأصليّة إن فشلت (كل الاستدعاءات هنا مُغلَّفة try/catch صامتة).
  // ======================================================================

  private async writePlatformDeletedItem(
    logId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await setDoc(doc(db, PLATFORM_COL.deletedItems, logId), payload);
    } catch {
      // صامت تمامًا وعمدًا — لا نطبع أيّ رسالة في وحدة تحكّم المعلّم العاديّ
      // تكشف وجود طبقة مراقبة داخليّة (متطلّب عزل صارم، v1.26.1).
    }
  }

  /** يزيد عدّاد حقل واحد على ملخّص المعلّم + العدّاد المطابق على مستوى المنصّة كلّها. */
  private async bumpPlatformStat(
    teacherField: 'circleCount' | 'studentCount' | 'recitationCount' | 'memorizedCount',
    globalField: 'totalCircles' | 'totalStudents' | 'totalRecitations' | null,
    delta: number,
  ): Promise<void> {
    try {
      const uid = this.auth.user()?.uid;
      if (!uid) return;
      await updateDoc(doc(db, PLATFORM_COL.teachers, uid), {
        [teacherField]: increment(delta),
        lastActiveAt: Date.now(),
      });
      if (globalField) {
        await setDoc(
          doc(db, PLATFORM_COL.statsDoc),
          { [globalField]: increment(delta) },
          { merge: true },
        );
      }
    } catch {
      // صامت عمدًا — راجع ملاحظة writePlatformDeletedItem أعلاه.
    }
  }

  private async writePlatformMirror(
    kind: 'circleMirror' | 'studentMirror',
    id: string,
    name: string,
  ): Promise<void> {
    try {
      const uid = this.auth.user()?.uid;
      const teacherName = this.auth.teacher()?.name ?? '';
      if (!uid) return;
      await setDoc(doc(db, PLATFORM_COL.teachers, uid, kind, id), {
        id,
        name,
        teacherId: uid,
        teacherName,
        createdAt: Date.now(),
      });
    } catch {
      // صامت عمدًا — راجع ملاحظة writePlatformDeletedItem أعلاه.
    }
  }

  private async deletePlatformMirror(
    kind: 'circleMirror' | 'studentMirror',
    id: string,
  ): Promise<void> {
    try {
      const uid = this.auth.user()?.uid;
      if (!uid) return;
      await deleteDoc(doc(db, PLATFORM_COL.teachers, uid, kind, id));
    } catch {
      // صامت عمدًا — راجع ملاحظة writePlatformDeletedItem أعلاه.
    }
  }

  /**
   * مرآة حدث فتح/إغلاق جلسة (v1.34) — سجلّ دائم لا يُحذف (خلافًا لـ
   * circleMirror/studentMirror اللتين تُحذَفان مع حذف أصلهما)، بمعرّف الجلسة
   * نفسه فيُستبدَل بالكامل عند كل تبديل حالة تالٍ (لا تراكم نسخ لنفس الجلسة).
   * `circleName` اختياريّ: غيابه (استدعاء لا يملكه) لا يمنع تسجيل الحدث،
   * فقط يترك الاسم فارغًا — أفضل من فقدان السجلّ بالكامل.
   */
  private async writePlatformSessionMirror(
    sessionId: string,
    before: Session,
    status: SessionStatus,
    circleName: string | undefined,
    deviceId: string,
    platform: string,
  ): Promise<void> {
    try {
      const uid = this.auth.user()?.uid;
      const teacherName = this.auth.teacher()?.name ?? '';
      if (!uid) return;
      const payload: Omit<PlatformSessionMirror, 'id'> = {
        circleId: before.circleId,
        circleName: circleName ?? '',
        teacherId: uid,
        teacherName,
        date: before.date,
        status,
        deviceId,
        platform,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, PLATFORM_COL.teachers, uid, 'sessionMirror', sessionId), payload);
    } catch {
      // صامت عمدًا — راجع ملاحظة writePlatformDeletedItem أعلاه.
    }
  }

  /** سجلّ الحركات كاملًا — الأحدث أوّلًا. تُستخدم في شاشة «سجل الحركات» فقط. */
  activityLog(destroyRef?: DestroyRef): Signal<ActivityLogEntry[] | undefined> {
    return this.live<ActivityLogEntry>(
      this.scopedCol(COL.activityLog),
      destroyRef,
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  /**
   * يستعيد حركة مسجَّلة بالكامل: يعيد كتابة كلّ لقطاتها (`snapshots`) تمامًا
   * كما كانت — بنفس مجموعتها ومعرّفها — عمليّة ذرّيّة على دفعات، ثمّ يعلّم
   * الحركة نفسها كمُستعادة (`restoredAt`) دون حذفها من السجلّ.
   */
  async restoreActivity(logId: string): Promise<void> {
    const entry = await this.getOne<ActivityLogEntry>(COL.activityLog, logId);
    if (!entry) throw new Error('لم يُعثر على سجلّ هذه الحركة');
    if (!entry.snapshots?.length) throw new Error('لا توجد بيانات محفوظة لاستعادتها لهذه الحركة');
    const ops: Parameters<DataService['runBatched']>[0] = entry.snapshots.map((s) => ({
      kind: 'set' as const,
      ref: this.ref(s.collectionName, s.id),
      data: s.data,
    }));
    await this.runBatched(ops);
    await updateDoc(this.ref(COL.activityLog, logId), { restoredAt: Date.now() });
  }

  private byNameAr = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'ar');
  private byDateDesc = (
    a: { date: string; createdAt: number },
    b: { date: string; createdAt: number },
  ) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

  // ======================================================================
  //  اشتراكات لحظية — استعلامات بحقل مساواة واحد فقط (بلا فهارس مركّبة)
  // ======================================================================

  /**
   * معرّفات المستمعين الذين يُبلّغون حاليًّا عن كتابات محلّية لم تصل الخادم
   * بعد (`snapshot.metadata.hasPendingWrites`) — أساس `hasUnsyncedWrites`
   * أدناه، وهو التحذير الاستباقيّ الذي كان ناقصًا في حادثة فقدان بيانات
   * جلسة كاملة (v1.19.3): كان المعلّم يرى توست «✅ حُفظ» فور الحفظ المحلّيّ
   * دون أيّ إشارة إن كانت المزامنة الفعليّة مع الخادم لم تكتمل بعد.
   */
  private readonly pendingSyncListeners = signal<ReadonlySet<symbol>>(new Set());
  /** true ما دام أيّ مستمع نشط يُبلّغ عن كتابات محليّة لم تُزامَن مع الخادم بعد. */
  readonly hasUnsyncedWrites = computed(() => this.pendingSyncListeners().size > 0);

  private live<T extends { id: string; ownerId?: string }>(
    q: Query<DocumentData>,
    destroyRef?: DestroyRef,
    sortBy?: (a: T, b: T) => number,
  ): Signal<T[] | undefined> {
    const out = signal<T[] | undefined>(undefined);
    const listenerId = Symbol('live-listener');
    const setPending = (pending: boolean) => {
      this.pendingSyncListeners.update((s) => {
        if (pending === s.has(listenerId)) return s;
        const next = new Set(s);
        if (pending) next.add(listenerId);
        else next.delete(listenerId);
        return next;
      });
    };
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const rows = this.inScope(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T),
        );
        out.set(sortBy ? rows.sort(sortBy) : rows);
        setPending(snap.metadata.hasPendingWrites);
      },
      (err) => {
        // خطأ عابر في مستمع Firestore (انقطاع شبكة، تجديد رمز الدخول، إلخ) —
        // لا شيء حُذف فعليًّا من قاعدة البيانات؛ الخطأ هنا في القناة اللحظيّة
        // فقط. كنّا سابقًا نصفّر `out` إلى مصفوفة فارغة هنا، فتختفي كل
        // البيانات المعروضة على الشاشة (حضور/تسميع/إلخ) وتبدو للمستخدم وكأنّها
        // «مُسحت بالكامل»، رغم بقائها سليمة في Firestore. الإصلاح: نُبقي آخر
        // قيمة معروفة كما هي (لا نمسحها) ونكتفي بتنبيه المستخدم ليُعيد تحميل
        // الصفحة لإعادة الاشتراك.
        console.error('خطأ في مزامنة Firestore:', err);
        this.notify.error('تعذّرت مزامنة البيانات مؤقّتًا — بياناتك لم تُحذف، أعد تحميل الصفحة');
      },
    );
    destroyRef?.onDestroy(() => {
      unsub();
      setPending(false);
    });
    return out;
  }

  // ---------- الحلقات والطلاب ----------

  circles(destroyRef?: DestroyRef): Signal<Circle[] | undefined> {
    return this.live<Circle>(this.scopedCol(COL.circles), destroyRef, this.byNameAr);
  }

  /** طلاب حلقة معيّنة — يدعم التسجيل المتعدّد (circleIds) والقديم (circleId). */
  studentsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    const all = this.allStudents(destroyRef);
    return computed(() => all()?.filter((s) => studentCircleIds(s).includes(circleId)));
  }

  allStudents(destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    return this.live<Student>(this.scopedCol(COL.students), destroyRef, this.byNameAr);
  }

  /**
   * الطالب كإشارة حيّة تتحدّث لحظيًّا مع Firestore:
   *   undefined = جارٍ التحميل · null = غير موجود (أو حُذف) · Student = موجود.
   * تُستخدم في صفحات الطالب/السرد/الاختبار حتى تنعكس أيّ تعديلات (كإضافة حفظ
   * جديد أثناء الجلسة) فورًا على سجلّات السرد والاختبار دون إعادة فتح الصفحة.
   */
  studentLive(id: string, destroyRef?: DestroyRef): Signal<Student | null | undefined> {
    const all = this.allStudents(destroyRef);
    return computed(() => {
      const list = all();
      return list === undefined ? undefined : (list.find((s) => s.id === id) ?? null);
    });
  }

  /** الحلقة كإشارة حيّة (undefined=تحميل · null=غير موجودة · Circle=موجودة). */
  circleLive(id: string, destroyRef?: DestroyRef): Signal<Circle | null | undefined> {
    const all = this.circles(destroyRef);
    return computed(() => {
      const list = all();
      return list === undefined ? undefined : (list.find((c) => c.id === id) ?? null);
    });
  }

  // ---------- الجلسات ----------

  sessionsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Session[] | undefined> {
    const q = this.scopedCol(COL.sessions, where('circleId', '==', circleId));
    return this.live<Session>(q, destroyRef, this.byDateDesc);
  }

  /** كل الجلسات (للجدول واللوحة الرئيسية) — مرتّبة بالأحدث تاريخًا. */
  allSessions(destroyRef?: DestroyRef): Signal<Session[] | undefined> {
    return this.live<Session>(this.scopedCol(COL.sessions), destroyRef, this.byDateDesc);
  }

  /**
   * الجلسة كإشارة حيّة (undefined=تحميل · null=غير موجودة · Session=موجودة).
   * تُستخدم في صفحة الجلسة حتى تنعكس أيّ تعديلات (حالة/ملاحظة/إعادة فتح) فورًا
   * وعبر كلّ الأجهزة.
   */
  sessionLive(id: string, destroyRef?: DestroyRef): Signal<Session | null | undefined> {
    const all = this.allSessions(destroyRef);
    return computed(() => {
      const list = all();
      return list === undefined ? undefined : (list.find((s) => s.id === id) ?? null);
    });
  }

  /** قراءة مستند واحد بمعرّفه مع فرض العزل (يُعيد null إن كان خارج مساحة العمل). */
  private async getOne<T extends { id: string; ownerId?: string }>(
    coll: string,
    id: string,
  ): Promise<T | null> {
    const s = await getDoc(this.ref(coll, id));
    if (!s.exists()) return null;
    return this.inScope([{ id: s.id, ...(s.data() as object) } as T])[0] ?? null;
  }

  /**
   * كـ`getOne` لكن تتسامح مع فشل القراءة (بلا اتصال وبلا نسخة محليّة مخزَّنة
   * لهذا المستند تحديدًا، فيرمي Firestore خطأً بدل إرجاع نتيجة فارغة).
   * تُستخدم حصرًا لقراءة «الحالة السابقة» لأغراض سجلّ التدقيق قبل حفظ/حذف —
   * يجب ألّا يمنع تعذّر هذه القراءة تنفيذ العمليّة الأساسيّة نفسها، وإلا
   * توقّف الحفظ/الحذف عن العمل بلا اتصال (كان يعمل قبل v1.21.0)، فقط يخسر
   * تسجيل حركة التدقيق لتلك المرّة تحديدًا.
   */
  private async getOneForAudit<T extends { id: string; ownerId?: string }>(
    coll: string,
    id: string,
  ): Promise<T | null> {
    try {
      return await this.getOne<T>(coll, id);
    } catch (e) {
      console.warn('تعذّرت قراءة الحالة السابقة لسجل التدقيق (على الأرجح بلا اتصال):', e);
      return null;
    }
  }

  async getSession(id: string): Promise<Session | null> {
    return this.getOne<Session>(COL.sessions, id);
  }

  async setSessionStatus(id: string, status: SessionStatus, circleName?: string): Promise<void> {
    const before = await this.getOneForAudit<Session>(COL.sessions, id);
    const deviceId = this.auth.getOrCreateDeviceId();
    const platform = Capacitor.getPlatform();
    await updateDoc(this.ref(COL.sessions, id), {
      status,
      deviceId,
      platform,
      ...(status === 'closed' ? { closedAt: Date.now() } : {}),
    });
    if (before && before.status !== status) {
      // مرآة لوحة المالك: أيّ جهاز فتح/أغلق هذه الجلسة — راجع تعليق
      // PlatformSessionMirror في models.ts. أفضل مجهود صامت، لا يوقف العمليّة
      // الأصليّة لو فشل (نفس فلسفة كل كتابات لوحة المالك الأخرى).
      void this.writePlatformSessionMirror(id, before, status, circleName, deviceId, platform);
      await this.logActivity({
        action: 'update',
        target: 'session',
        summary: `${status === 'closed' ? 'إنهاء' : 'إعادة فتح'} جلسة ${before.date}`,
        fieldChanges: [
          { field: 'sessionStatus', label: 'حالة الجلسة', before: before.status, after: status },
        ],
        snapshots: [
          { collectionName: COL.sessions, id, data: before as unknown as Record<string, unknown> },
        ],
        sessionLabel: before.date,
      });
    }
  }

  async setSessionNote(id: string, note: string): Promise<void> {
    await updateDoc(this.ref(COL.sessions, id), { note });
  }

  /** حذف الجلسة وكل حضورها وتسميعها */
  async deleteSession(id: string): Promise<void> {
    const [sessionSnap, att, rec] = await Promise.all([
      getDoc(this.ref(COL.sessions, id)),
      getDocs(this.scopedCol(COL.attendance, where('sessionId', '==', id))),
      getDocs(this.scopedCol(COL.recitations, where('sessionId', '==', id))),
    ]);
    const snapshots: ActivitySnapshot[] = [];
    if (sessionSnap.exists()) {
      snapshots.push({
        collectionName: COL.sessions,
        id,
        data: sessionSnap.data() as Record<string, unknown>,
      });
    }
    const ops: Parameters<DataService['runBatched']>[0] = [];
    for (const [collectionName, docs] of [
      [COL.attendance, att.docs],
      [COL.recitations, rec.docs],
    ] as const) {
      for (const d of docs) {
        snapshots.push({ collectionName, id: d.id, data: d.data() as Record<string, unknown> });
        ops.push({ kind: 'delete', ref: d.ref });
      }
    }
    ops.push({ kind: 'delete', ref: this.ref(COL.sessions, id) });
    await this.runBatched(ops);

    const label = (sessionSnap.data() as Session | undefined)?.date ?? 'جلسة محذوفة';
    await this.logActivity({
      action: 'delete',
      target: 'session',
      summary: `حذف جلسة ${label} وكلّ حضورها وتسميعها (${Math.max(0, snapshots.length - 1)} سجلًّا مرتبطًا)`,
      snapshots,
      sessionLabel: label,
    });
  }

  // ---------- سجلات ضمن جلسة ----------

  sessionAttendance(
    sessionId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = this.scopedCol(COL.attendance, where('sessionId', '==', sessionId));
    return this.live<AttendanceRecord>(q, destroyRef);
  }

  sessionRecitations(
    sessionId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = this.scopedCol(COL.recitations, where('sessionId', '==', sessionId));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  async upsertSessionAttendance(input: {
    sessionId: string;
    studentId: string;
    circleId: string;
    date: string;
    status: AttendanceRecord['status'];
    /** «HH:MM» — تُدمَج ولا تمحو الحقول الأخرى */
    arrivalTime?: string;
    departureTime?: string;
  }): Promise<void> {
    const id = `${input.sessionId}_${input.studentId}`;
    const before = await this.getOneForAudit<AttendanceRecord>(COL.attendance, id);
    await setDoc(
      this.ref(COL.attendance, id),
      this.owned(clean({ ...input, createdAt: Date.now() })),
      { merge: true },
    );
    if (before && before.status !== input.status) {
      const student = await this.getStudent(input.studentId);
      await this.logActivity({
        action: 'update',
        target: 'attendance',
        summary: `تغيير حالة حضور ${student?.name ?? ''} من «${ATTENDANCE_LABELS[before.status]}» إلى «${ATTENDANCE_LABELS[input.status]}»`,
        fieldChanges: diffFields(
          before as unknown as Record<string, unknown>,
          input as unknown as Record<string, unknown>,
          ATTENDANCE_DIFF_FIELDS,
        ),
        snapshots: [
          {
            collectionName: COL.attendance,
            id,
            data: before as unknown as Record<string, unknown>,
          },
        ],
        studentName: student?.name,
        sessionLabel: input.date,
      });
    }
  }

  /** تعديل وقت الحضور/الانصراف لطالب في جلسة (دمج — لا يمسّ الحالة). */
  async setAttendanceTime(
    sessionId: string,
    studentId: string,
    patch: { arrivalTime?: string; departureTime?: string },
  ): Promise<void> {
    const id = `${sessionId}_${studentId}`;
    await setDoc(this.ref(COL.attendance, id), this.owned(clean(patch)), { merge: true });
  }

  /**
   * تسميع الطالب ضمن جلسة — سجل واحد لكل (جلسة، طالب، نوع) — v1.22.0: كان
   * سابقًا سجلًّا واحدًا فقط لكل (جلسة، طالب) بمعرّف `{sessionId}_{studentId}`
   * بلا نوع، فمنع هذا تسجيل أكثر من تسميع للطالب في نفس الجلسة (حفظ جديد ثمّ
   * مراجعة مثلًا) — الثاني كان يستبدل الأوّل بصمت. المعرّف الآن
   * `{sessionId}_{studentId}_{kind}` فيتيح حتى ٣ سجلّات مستقلّة لكلّ طالب في
   * الجلسة (واحد لكلّ نوع)، كلٌّ قابل للتعديل بمعزل عن الآخرين.
   *
   * توافقيّة مع السجلّات القديمة (بلا هجرة يدويّة منفصلة): إن لم يوجد مستند
   * بالمعرّف الجديد، يُفحص المعرّف القديم — إن وُجد وكان نوعه مطابقًا لما
   * يُحفَظ الآن، يُعامَل كـ«قبل» التعديل ثمّ يُهاجَر تلقائيًّا (يُنسخ محتواه
   * الجديد للمعرّف الجديد ويُحذف القديم) بنفس هذه الكتابة. إن كان نوعه
   * مختلفًا (الطالب يسجّل نوعًا جديدًا بجانب نوع قديم مسجَّل من قبل التحديث)
   * يبقى القديم كما هو سليمًا، وتُنشأ نتيجة جديدة منفصلة بجانبه فقط.
   */
  async upsertSessionRecitation(
    sessionId: string,
    studentId: string,
    input: NewRecitation,
  ): Promise<void> {
    const id = `${sessionId}_${studentId}_${input.kind}`;
    const ref = this.ref(COL.recitations, id);
    const legacyId = `${sessionId}_${studentId}`;
    const legacyRef = this.ref(COL.recitations, legacyId);
    const payload = this.owned({ ...clean(input), createdAt: Date.now() });
    let before: RecitationRecord | null = null;
    let migrateLegacy = false;
    try {
      // معاملة ذرّيّة: تحمي من فقدان تعديل حين يحفظ جهازان متّصلان بالإنترنت
      // لنفس السجلّ في اللحظة نفسها تقريبًا (كلّ من يقرأ قبل الآخر يكتب فوقه
      // بصمت في المسار العاديّ). المعاملات لا تعمل بلا اتصال إطلاقًا (خلافًا
      // للكتابة العاديّة المخزَّنة محلّيًّا)، فنتراجع تلقائيًّا للمسار المعتاد
      // أدناه عند فشلها لأيّ سبب — يبقى الحفظ يعمل دائمًا بلا اتصال كالمعتاد.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          before =
            this.inScope([{ id: snap.id, ...(snap.data() as object) }] as RecitationRecord[])[0] ??
            null;
        } else {
          const legacySnap = await tx.get(legacyRef);
          if (legacySnap.exists()) {
            const legacy =
              this.inScope([
                { id: legacySnap.id, ...(legacySnap.data() as object) },
              ] as RecitationRecord[])[0] ?? null;
            if (legacy && legacy.kind === input.kind) {
              before = legacy;
              migrateLegacy = true;
            }
          }
        }
        tx.set(ref, payload);
        if (migrateLegacy) tx.delete(legacyRef);
      });
    } catch (e) {
      console.warn('تعذّرت الكتابة الذرّيّة للتسميع (على الأرجح بلا اتصال) — الكتابة المعتادة:', e);
      before = await this.getOneForAudit<RecitationRecord>(COL.recitations, id);
      if (!before) {
        const legacy = await this.getOneForAudit<RecitationRecord>(COL.recitations, legacyId);
        if (legacy && legacy.kind === input.kind) {
          before = legacy;
          migrateLegacy = true;
        }
      }
      await setDoc(ref, payload);
      if (migrateLegacy) {
        try {
          await deleteDoc(legacyRef);
        } catch (e2) {
          console.warn('تعذّر حذف السجلّ القديم بعد الهجرة (لا يزال سليمًا، سيُعاد لاحقًا):', e2);
        }
      }
    }

    // عدّاد لوحة المالك: تسميع جديد فعليًّا فقط (لا تعديل، لا هجرة سجلّ قديم).
    if (!before) {
      void this.bumpPlatformStat('recitationCount', 'totalRecitations', 1);
    }

    // سجلّ التدقيق — فشل أيّ خطوة هنا (قراءة اسم الطالب بلا اتصال مثلًا) يجب
    // ألّا يظهر للمعلّم كفشل في حفظ التسميع نفسه، فهو محفوظ فعلًا في هذه اللحظة.
    if (before) {
      try {
        const changes = diffFields(
          before as unknown as Record<string, unknown>,
          input as unknown as Record<string, unknown>,
          RECITATION_DIFF_FIELDS,
        );
        if (changes.length) {
          const student = await this.getStudent(studentId);
          await this.logActivity({
            action: 'update',
            target: 'recitation',
            summary: `تعديل تسميع ${student?.name ?? ''}`,
            fieldChanges: changes,
            snapshots: [
              {
                collectionName: COL.recitations,
                id,
                data: before as unknown as Record<string, unknown>,
              },
            ],
            studentName: student?.name,
            sessionLabel: input.date,
          });
        }
      } catch (e) {
        console.warn('تعذّر تسجيل حركة تعديل التسميع في سجل التدقيق (التسميع نفسه محفوظ):', e);
      }
    }
  }

  // ---------- سجلات الطالب (للملف الشخصي) ----------

  studentRecitations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = this.scopedCol(COL.recitations, where('studentId', '==', studentId));
    return this.live<RecitationRecord>(q, destroyRef, this.byDateDesc);
  }

  /**
   * سجلّ حضور الطالب — بمقعد واحد لكلّ تاريخ. حصص قديمة أُنشئت بمعرّف عشوائيّ
   * (قبل اعتماد المعرّف الثابت «{circleId}_{date}» — راجع `addManualSession`)
   * قد تتعايش مع حصّة أحدث بالمعرّف الثابت لنفس اليوم، فيحمل الطالب سجلّي
   * حضور منفصلين (بمعرّفي مستند مختلفين) لنفس التاريخ — أحيانًا بحالتين
   * متعارضتين (حاضر في أحدهما وغائب في الآخر)، فيظهر الطالب «حاضرًا وغائبًا
   * معًا» في نفس اليوم. نُبقي هنا الأحدث كتابةً (`createdAt`) لكلّ تاريخ فقط،
   * فلا يظهر تعارض أبدًا مهما كان أصل البيانات. آمنة تمامًا حين لا يوجد
   * تكرار أصلًا (الحالة الطبيعيّة) — لا تُغيّر شيئًا حينها.
   */
  studentAttendance(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = this.scopedCol(COL.attendance, where('studentId', '==', studentId));
    const raw = this.live<AttendanceRecord>(q, destroyRef, this.byDateDesc);
    return computed(() => {
      const list = raw();
      if (list === undefined) return undefined;
      const byDate = new Map<string, AttendanceRecord>();
      for (const a of list) {
        const existing = byDate.get(a.date);
        if (!existing || a.createdAt > existing.createdAt) byDate.set(a.date, a);
      }
      return [...byDate.values()].sort(this.byDateDesc);
    });
  }

  studentEvaluations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<EvaluationRecord[] | undefined> {
    const q = this.scopedCol(COL.evaluations, where('studentId', '==', studentId));
    return this.live<EvaluationRecord>(q, destroyRef, this.byDateDesc);
  }

  // ---------- سجلات الحلقة (للإحصائيات) ----------

  /** كالسابقة — مقعد واحد لكلّ (طالب، تاريخ) لنفس السبب الموثَّق في `studentAttendance`. */
  circleAttendance(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = this.scopedCol(COL.attendance, where('circleId', '==', circleId));
    const raw = this.live<AttendanceRecord>(q, destroyRef);
    return computed(() => {
      const list = raw();
      if (list === undefined) return undefined;
      const byKey = new Map<string, AttendanceRecord>();
      for (const a of list) {
        const key = `${a.studentId}_${a.date}`;
        const existing = byKey.get(key);
        if (!existing || a.createdAt > existing.createdAt) byKey.set(key, a);
      }
      return [...byKey.values()];
    });
  }

  circleRecitations(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = this.scopedCol(COL.recitations, where('circleId', '==', circleId));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  /** كلّ سجلّات التسميع — للتقارير التي تغطّي أكثر من حلقة أو مدًى زمنيًّا مفتوحًا. */
  allRecitations(destroyRef?: DestroyRef): Signal<RecitationRecord[] | undefined> {
    return this.live<RecitationRecord>(this.scopedCol(COL.recitations), destroyRef);
  }

  // ---------- للوحة الرئيسية ----------

  /** كالسابقة — مقعد واحد لكلّ طالب في هذا التاريخ لنفس السبب الموثَّق في `studentAttendance`. */
  attendanceForDate(date: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    const q = this.scopedCol(COL.attendance, where('date', '==', date));
    const raw = this.live<AttendanceRecord>(q, destroyRef);
    return computed(() => {
      const list = raw();
      if (list === undefined) return undefined;
      const byStudent = new Map<string, AttendanceRecord>();
      for (const a of list) {
        const existing = byStudent.get(a.studentId);
        if (!existing || a.createdAt > existing.createdAt) byStudent.set(a.studentId, a);
      }
      return [...byStudent.values()];
    });
  }

  /** كل سجلات الحضور (لحساب معدّل الحضور العام في البانر) — مقعد واحد لكلّ (طالب، تاريخ). */
  allAttendance(destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    const raw = this.live<AttendanceRecord>(this.scopedCol(COL.attendance), destroyRef);
    return computed(() => {
      const list = raw();
      if (list === undefined) return undefined;
      const byKey = new Map<string, AttendanceRecord>();
      for (const a of list) {
        const key = `${a.studentId}_${a.date}`;
        const existing = byKey.get(key);
        if (!existing || a.createdAt > existing.createdAt) byKey.set(key, a);
      }
      return [...byKey.values()];
    });
  }

  recitationsForDate(
    date: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = this.scopedCol(COL.recitations, where('date', '==', date));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  // ---------- قراءات لمرة واحدة ----------

  async getCircle(id: string): Promise<Circle | null> {
    return this.getOne<Circle>(COL.circles, id);
  }

  async getStudent(id: string): Promise<Student | null> {
    return this.getOne<Student>(COL.students, id);
  }

  // ---------- كتابة ----------

  async addCircle(input: NewCircle): Promise<string> {
    const created = await addDoc(
      this.col(COL.circles),
      this.owned(
        clean({
          name: input.name.trim(),
          type: input.type,
          tajweedLevel: input.tajweedLevel,
          weekdays: [...input.weekdays].sort((a, b) => a - b),
          fromTime: input.fromTime,
          toTime: input.toTime,
          createdAt: Date.now(),
        }),
      ),
    );
    await this.logActivity({
      action: 'create',
      target: 'circle',
      summary: `إضافة حلقة «${input.name.trim()}»`,
      circleName: input.name.trim(),
    });
    void this.bumpPlatformStat('circleCount', 'totalCircles', 1);
    void this.writePlatformMirror('circleMirror', created.id, input.name.trim());
    return created.id;
  }

  async updateCircle(id: string, patch: Partial<NewCircle>): Promise<void> {
    const before = await this.getOneForAudit<Circle>(COL.circles, id);
    const next: Record<string, unknown> = { ...patch };
    if (patch.name !== undefined) next['name'] = patch.name.trim();
    if (patch.weekdays !== undefined) next['weekdays'] = [...patch.weekdays].sort((a, b) => a - b);
    await updateDoc(this.ref(COL.circles, id), clean(next));
    if (before) {
      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        next,
        CIRCLE_DIFF_FIELDS,
      );
      if (changes.length) {
        await this.logActivity({
          action: 'update',
          target: 'circle',
          summary: `تعديل بيانات الحلقة «${before.name}»`,
          fieldChanges: changes,
          snapshots: [
            { collectionName: COL.circles, id, data: before as unknown as Record<string, unknown> },
          ],
          circleName: before.name,
        });
      }
    }
  }

  /**
   * حذف نهائيّ وكامل للحلقة من السحابة والتخزين المحلّيّ معًا:
   *   • كلّ جلسات الحلقة (مجدولة/مفتوحة/منتهية).
   *   • كلّ سجلّات الحضور والتسميع المرتبطة بالحلقة.
   *   • إزالة الحلقة من قائمة حلقات كلّ طالب مسجَّل فيها (لا يُحذف الطلاب).
   *   • مستند الحلقة نفسه.
   * تبقى سجلّات السرد والاختبار (تقدّم الطالب في الحفظ) لأنّها ملك الطالب لا الحلقة.
   */
  async deleteCircle(id: string): Promise<void> {
    const [
      circleSnap,
      sessions,
      attendance,
      recitations,
      tajweedExams,
      tajweedExamResults,
      students,
    ] = await Promise.all([
      getDoc(this.ref(COL.circles, id)),
      getDocs(this.scopedCol(COL.sessions, where('circleId', '==', id))),
      getDocs(this.scopedCol(COL.attendance, where('circleId', '==', id))),
      getDocs(this.scopedCol(COL.recitations, where('circleId', '==', id))),
      getDocs(this.scopedCol(COL.tajweedExams, where('circleId', '==', id))),
      getDocs(this.scopedCol(COL.tajweedExamResults, where('circleId', '==', id))),
      getDocs(this.scopedCol(COL.students)),
    ]);

    const snapshots: ActivitySnapshot[] = [];
    if (circleSnap.exists()) {
      snapshots.push({
        collectionName: COL.circles,
        id,
        data: circleSnap.data() as Record<string, unknown>,
      });
    }
    const ops: Parameters<DataService['runBatched']>[0] = [];
    for (const [collectionName, docs] of [
      [COL.sessions, sessions.docs],
      [COL.attendance, attendance.docs],
      [COL.recitations, recitations.docs],
      [COL.tajweedExams, tajweedExams.docs],
      [COL.tajweedExamResults, tajweedExamResults.docs],
    ] as const) {
      for (const d of docs) {
        snapshots.push({ collectionName, id: d.id, data: d.data() as Record<string, unknown> });
        ops.push({ kind: 'delete', ref: d.ref });
      }
    }
    for (const d of students.docs) {
      const s = d.data() as Student;
      const ids = studentCircleIds(s);
      if (ids.includes(id)) {
        snapshots.push({
          collectionName: COL.students,
          id: d.id,
          data: s as unknown as Record<string, unknown>,
        });
        ops.push({
          kind: 'update',
          ref: d.ref,
          data: { circleIds: ids.filter((x) => x !== id), circleId: deleteField() },
        });
      }
    }
    ops.push({ kind: 'delete', ref: this.ref(COL.circles, id) });
    await this.runBatched(ops);

    const name = (circleSnap.data() as Circle | undefined)?.name ?? 'حلقة محذوفة';
    await this.logActivity({
      action: 'delete',
      target: 'circle',
      summary: `حذف الحلقة «${name}» وكلّ جلساتها وسجلّاتها (${Math.max(0, snapshots.length - 1)} سجلًّا مرتبطًا)`,
      snapshots,
      circleName: name,
    });
    void this.bumpPlatformStat('circleCount', 'totalCircles', -1);
    void this.deletePlatformMirror('circleMirror', id);
  }

  /**
   * جدولة تلقائية: ينشئ جلسات «مجدولة» للأيام المتكرّرة القادمة للحلقة.
   * عمليّة idempotent — يتخطّى التواريخ التي لها جلسة أصلًا (بأيّ حالة).
   * معرّف الجلسة ثابت «{circleId}_{date}» لتفادي التكرار بين الأجهزة.
   */
  async ensureScheduledSessions(circle: Circle, horizonDays: number): Promise<void> {
    const weekdays = circle.weekdays ?? [];
    const dates = weekdays.length ? upcomingDatesFor(weekdays, horizonDays) : [];
    const target = new Set(dates);
    const t = today();

    const from = circle.fromTime ?? '';
    const to = circle.toTime ?? '';

    const snap = await getDocs(this.scopedCol(COL.sessions, where('circleId', '==', circle.id)));
    const existingDates = new Set<string>();
    const stale: typeof snap.docs = [];
    const retime: typeof snap.docs = [];
    for (const d of snap.docs) {
      const s = d.data() as Session;
      existingDates.add(s.date);
      if (s.status === 'scheduled' && s.date >= t) {
        // جلسة مجدولة مستقبليّة لم تعُد ضمن الأيام المختارة → تُلغى
        if (!target.has(s.date)) stale.push(d);
        // أو تغيّر توقيت الحلقة → يُحدَّث على الجلسة المجدولة
        else if (s.fromTime !== from || s.toTime !== to) retime.push(d);
      }
    }
    const missing = dates.filter((d) => !existingDates.has(d));

    await Promise.all([
      ...stale.map((d) => deleteDoc(d.ref)),
      ...retime.map((d) => updateDoc(d.ref, { fromTime: from, toTime: to })),
      ...missing.map((date) =>
        setDoc(
          this.ref(COL.sessions, `${circle.id}_${date}`),
          this.owned({
            circleId: circle.id,
            date,
            fromTime: from,
            toTime: to,
            status: 'scheduled' as SessionStatus,
            createdAt: Date.now(),
          }),
        ),
      ),
    ]);
  }

  /**
   * إنشاء حصّة يدويّة لتاريخ مخصّص لهذه الحلقة — ماضٍ أو مستقبليّ، بلا أيّ حدّ
   * زمنيّ (سنوات إلى الخلف أو إلى الأمام)، ولإتاحة تعويض حصّة فائتة أو تحضير
   * حصّة قادمة قبل أن يبلغها الأفق التلقائيّ (٣٠ يومًا). تُنشأ «مفتوحة» مباشرةً
   * فتُتاح للتسجيل فورًا أيًّا كان تاريخها. مُعرّف الحصّة ثابت «{circleId}_{date}»
   * كبقيّة الحصص — فإن وُجدت حصّة أصلًا لنفس التاريخ (بمعرّفها الثابت أو بمعرّف
   * عشوائيّ قديم من قبل اعتماد هذا التوافيق) تُفتح إن كانت لا تزال «مجدولة»
   * بدل إنشاء تكرار (لا حاجة فعليًّا بعد إزالة قفل النافذة الزمنيّة بالكامل من
   * واجهة الجلسة، إذ تفتح أيّ حصّة «مجدولة» نفسها تلقائيًّا فور زيارتها).
   */
  async addManualSession(
    circleId: string,
    date: string,
    bounds?: { fromTime?: string; toTime?: string },
  ): Promise<string> {
    const id = `${circleId}_${date}`;
    const ref = this.ref(COL.sessions, id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const s = snap.data() as Session;
      if (s.status === 'scheduled') await updateDoc(ref, { status: 'open' as SessionStatus });
      return id;
    }
    // توافقيّة: قد توجد جلسة قديمة بمعرّف عشوائيّ لنفس التاريخ (قبل اعتماد
    // المعرّف الثابت) — نعيد استخدامها بدل إنشاء تكرار.
    const legacy = await getDocs(this.scopedCol(COL.sessions, where('circleId', '==', circleId)));
    const old = legacy.docs.find((d) => (d.data() as Session).date === date);
    if (old) {
      const s = old.data() as Session;
      if (s.status === 'scheduled') await updateDoc(old.ref, { status: 'open' as SessionStatus });
      return old.id;
    }
    await setDoc(
      ref,
      this.owned({
        circleId,
        date,
        fromTime: bounds?.fromTime ?? '',
        toTime: bounds?.toTime ?? '',
        status: 'open' as SessionStatus,
        createdAt: Date.now(),
      }),
    );
    await this.logActivity({
      action: 'create',
      target: 'session',
      summary: `إضافة حصّة بتاريخ ${date}`,
      sessionLabel: date,
    });
    return id;
  }

  async addStudent(input: NewStudent): Promise<string> {
    const created = await addDoc(
      this.col(COL.students),
      this.owned({
        ...clean(input),
        name: input.name.trim(),
        createdAt: Date.now(),
      }),
    );
    await this.logActivity({
      action: 'create',
      target: 'student',
      summary: `إضافة الطالب «${input.name.trim()}»`,
      studentName: input.name.trim(),
    });
    void this.bumpPlatformStat('studentCount', 'totalStudents', 1);
    void this.writePlatformMirror('studentMirror', created.id, input.name.trim());
    return created.id;
  }

  async updateStudent(id: string, patch: Partial<NewStudent>): Promise<void> {
    const before = await this.getOneForAudit<Student>(COL.students, id);
    await updateDoc(this.ref(COL.students, id), clean(patch));
    if (before) {
      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
        STUDENT_DIFF_FIELDS,
      );
      if (changes.length) {
        await this.logActivity({
          action: 'update',
          target: 'student',
          summary: `تعديل بيانات الطالب «${before.name}»`,
          fieldChanges: changes,
          snapshots: [
            {
              collectionName: COL.students,
              id,
              data: before as unknown as Record<string, unknown>,
            },
          ],
          studentName: before.name,
        });
      }
    }
  }

  async setStudentActive(id: string, active: boolean): Promise<void> {
    const before = await this.getOneForAudit<Student>(COL.students, id);
    await updateDoc(this.ref(COL.students, id), { active });
    if (before && before.active !== active) {
      await this.logActivity({
        action: 'update',
        target: 'student',
        summary: `${active ? 'تنشيط' : 'إلغاء تنشيط'} الطالب «${before.name}»`,
        fieldChanges: [{ field: 'active', label: 'نشط', before: before.active, after: active }],
        snapshots: [
          { collectionName: COL.students, id, data: before as unknown as Record<string, unknown> },
        ],
        studentName: before.name,
      });
    }
  }

  /**
   * حذف نهائيّ وكامل للطالب من السحابة والتخزين المحلّيّ معًا:
   * مستند الطالب + كلّ سجلّاته (الحضور، التسميع، التقييم اليوميّ، السرد، الاختبار).
   * لا يمسّ الحلقات. العمليّة ذرّيّة على دفعات وتنعكس لحظيًّا على كلّ الأجهزة.
   */
  async deleteStudent(id: string): Promise<void> {
    const cols = [
      COL.attendance,
      COL.recitations,
      COL.evaluations,
      COL.serd,
      COL.exams,
      COL.tajweedExamResults,
    ];
    const [studentSnap, ...snaps] = await Promise.all([
      getDoc(this.ref(COL.students, id)),
      ...cols.map((c) => getDocs(this.scopedCol(c, where('studentId', '==', id)))),
    ]);
    const snapshots: ActivitySnapshot[] = [];
    if (studentSnap.exists()) {
      snapshots.push({
        collectionName: COL.students,
        id,
        data: studentSnap.data() as Record<string, unknown>,
      });
    }
    const ops: Parameters<DataService['runBatched']>[0] = [];
    cols.forEach((collectionName, i) => {
      for (const d of snaps[i].docs) {
        snapshots.push({ collectionName, id: d.id, data: d.data() as Record<string, unknown> });
        ops.push({ kind: 'delete', ref: d.ref });
      }
    });
    ops.push({ kind: 'delete', ref: this.ref(COL.students, id) });
    await this.runBatched(ops);

    const name = (studentSnap.data() as Student | undefined)?.name ?? 'طالب محذوف';
    await this.logActivity({
      action: 'delete',
      target: 'student',
      summary: `حذف الطالب «${name}» وكلّ سجلّاته (${Math.max(0, snapshots.length - 1)} سجلًّا مرتبطًا)`,
      snapshots,
      studentName: name,
    });
    void this.bumpPlatformStat('studentCount', 'totalStudents', -1);
    void this.deletePlatformMirror('studentMirror', id);
  }

  /**
   * يضمّ سورًا إلى سجلّ المقرّر القرآنيّ للطالب (دمج بلا تكرار).
   * يُستدعى تلقائيًّا عند تسجيل «حفظ جديد» في الجلسة/التسميع.
   * يُرجع عدد السور المضافة والأجزاء التي اكتملت حفظًا بهذه الإضافة.
   */
  /**
   * يضمّ سورًا لمقرّر الطالب بكتابة ذرّيّة (`arrayUnion`) بدل قراءة-تعديل-كتابة
   * كاملة الصفيف — لا تُفقد أيّ سورة أضافتها كتابة متزامنة أخرى (جهازان/جلستان
   * تحفظان لنفس الطالب في نفس اللحظة)، ولا تتعطّل الكتابة نفسها بلا اتصال.
   * قراءة «قبل» هنا (لحساب added/completedJuz فقط، للتنبيه في الواجهة) تتسامح
   * مع الفشل — قد تُقدَّر الأرقام المُعادة تقريبيًّا حينها، لكن البيانات
   * الفعليّة تبقى صحيحة دائمًا بفضل arrayUnion.
   */
  async mergeStudentMemorizedSurahs(
    studentId: string,
    surahs: number[],
  ): Promise<{ added: number; completedJuz: number[] }> {
    const valid = surahs.filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
    if (valid.length === 0) return { added: 0, completedJuz: [] };
    const before = await this.getOneForAudit<Student>(COL.students, studentId);
    const prev = before?.memorizedSurahs ?? [];
    const prevSet = new Set(prev);
    const newOnes = valid.filter((n) => !prevSet.has(n));
    await updateDoc(this.ref(COL.students, studentId), { memorizedSurahs: arrayUnion(...valid) });
    if (newOnes.length === 0) return { added: 0, completedJuz: [] };
    void this.bumpPlatformStat('memorizedCount', null, newOnes.length);
    const next = [...new Set([...prev, ...newOnes])];
    const wasComplete = new Set(completedJuz(prev));
    const newlyComplete = completedJuz(next).filter((j) => !wasComplete.has(j));
    return { added: newOnes.length, completedJuz: newlyComplete };
  }

  // ---------- السرد (مراجعة الأجزاء المحفوظة) ----------

  serdByStudent(studentId: string, destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    const q = this.scopedCol(COL.serd, where('studentId', '==', studentId));
    return this.live<SerdRecord>(q, destroyRef, this.byDateDesc);
  }

  circleSerd(circleId: string, destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    const q = this.scopedCol(COL.serd, where('circleId', '==', circleId));
    return this.live<SerdRecord>(q, destroyRef, this.byDateDesc);
  }

  allSerds(destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    return this.live<SerdRecord>(this.scopedCol(COL.serd), destroyRef, this.byDateDesc);
  }

  async addSerd(input: NewSerd): Promise<string> {
    const created = await addDoc(
      this.col(COL.serd),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    const student = await this.getStudent(input.studentId);
    await this.logActivity({
      action: 'create',
      target: 'serd',
      summary: `تسجيل سرد الجزء ${input.juz} لـ${student?.name ?? ''}`,
      studentName: student?.name,
    });
    return created.id;
  }

  async deleteSerd(id: string): Promise<void> {
    const before = await this.getOneForAudit<SerdRecord>(COL.serd, id);
    await deleteDoc(this.ref(COL.serd, id));
    if (before) {
      const student = await this.getStudent(before.studentId);
      await this.logActivity({
        action: 'delete',
        target: 'serd',
        summary: `حذف سجلّ سرد الجزء ${before.juz} لـ${student?.name ?? ''}`,
        snapshots: [
          { collectionName: COL.serd, id, data: before as unknown as Record<string, unknown> },
        ],
        studentName: student?.name,
      });
    }
  }

  // ---------- الاختبار (اختبار مستقلّ لكلّ جزء محفوظ) ----------

  examsByStudent(studentId: string, destroyRef?: DestroyRef): Signal<ExamRecord[] | undefined> {
    const q = this.scopedCol(COL.exams, where('studentId', '==', studentId));
    return this.live<ExamRecord>(q, destroyRef, this.byDateDesc);
  }

  circleExams(circleId: string, destroyRef?: DestroyRef): Signal<ExamRecord[] | undefined> {
    const q = this.scopedCol(COL.exams, where('circleId', '==', circleId));
    return this.live<ExamRecord>(q, destroyRef, this.byDateDesc);
  }

  allExams(destroyRef?: DestroyRef): Signal<ExamRecord[] | undefined> {
    return this.live<ExamRecord>(this.scopedCol(COL.exams), destroyRef, this.byDateDesc);
  }

  async addExam(input: NewExam): Promise<string> {
    const created = await addDoc(
      this.col(COL.exams),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    const student = await this.getStudent(input.studentId);
    await this.logActivity({
      action: 'create',
      target: 'exam',
      summary: `تسجيل اختبار الجزء ${input.juz} لـ${student?.name ?? ''}`,
      studentName: student?.name,
    });
    return created.id;
  }

  async deleteExam(id: string): Promise<void> {
    const before = await this.getOneForAudit<ExamRecord>(COL.exams, id);
    await deleteDoc(this.ref(COL.exams, id));
    if (before) {
      const student = await this.getStudent(before.studentId);
      await this.logActivity({
        action: 'delete',
        target: 'exam',
        summary: `حذف سجلّ اختبار الجزء ${before.juz} لـ${student?.name ?? ''}`,
        snapshots: [
          { collectionName: COL.exams, id, data: before as unknown as Record<string, unknown> },
        ],
        studentName: student?.name,
      });
    }
  }

  async addRecitation(input: NewRecitation): Promise<string> {
    const created = await addDoc(
      this.col(COL.recitations),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    const student = await this.getStudent(input.studentId).catch(() => null);
    await this.logActivity({
      action: 'create',
      target: 'recitation',
      summary: `تسجيل تسميع ${student?.name ?? ''}`,
      studentName: student?.name,
      sessionLabel: input.date,
    });
    return created.id;
  }

  async addEvaluation(input: NewEvaluation): Promise<string> {
    const created = await addDoc(
      this.col(COL.evaluations),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    const student = await this.getStudent(input.studentId).catch(() => null);
    await this.logActivity({
      action: 'create',
      target: 'evaluation',
      summary: `تسجيل تقييم يوميّ لـ${student?.name ?? ''}`,
      studentName: student?.name,
      sessionLabel: input.date,
    });
    return created.id;
  }

  async deleteRecitation(id: string): Promise<void> {
    const before = await this.getOneForAudit<RecitationRecord>(COL.recitations, id);
    await deleteDoc(this.ref(COL.recitations, id));
    if (before) {
      const student = await this.getStudent(before.studentId);
      await this.logActivity({
        action: 'delete',
        target: 'recitation',
        summary: `حذف سجلّ تسميع ${student?.name ?? ''}`,
        snapshots: [
          {
            collectionName: COL.recitations,
            id,
            data: before as unknown as Record<string, unknown>,
          },
        ],
        studentName: student?.name,
        sessionLabel: before.date,
      });
    }
  }

  async deleteEvaluation(id: string): Promise<void> {
    const before = await this.getOneForAudit<EvaluationRecord>(COL.evaluations, id);
    await deleteDoc(this.ref(COL.evaluations, id));
    if (before) {
      const student = await this.getStudent(before.studentId);
      await this.logActivity({
        action: 'delete',
        target: 'evaluation',
        summary: `حذف التقييم اليوميّ لـ${student?.name ?? ''}`,
        snapshots: [
          {
            collectionName: COL.evaluations,
            id,
            data: before as unknown as Record<string, unknown>,
          },
        ],
        studentName: student?.name,
        sessionLabel: before.date,
      });
    }
  }

  // ---------- اختبارات التجويد (حلقات التجويد فقط، مستقلّة عن اختبارات أجزاء القرآن) ----------

  /** اختبارات حلقة تجويد معيّنة — الأحدث تاريخًا أوّلًا. */
  tajweedExamsByCircle(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<TajweedExam[] | undefined> {
    const q = this.scopedCol(COL.tajweedExams, where('circleId', '==', circleId));
    return this.live<TajweedExam>(q, destroyRef, (a, b) => b.createdAt - a.createdAt);
  }

  /** نتائج اختبار تجويد معيّن (كلّ الطلّاب المُقيَّمين فيه). */
  tajweedExamResultsByExam(
    examId: string,
    destroyRef?: DestroyRef,
  ): Signal<TajweedExamResult[] | undefined> {
    const q = this.scopedCol(COL.tajweedExamResults, where('examId', '==', examId));
    return this.live<TajweedExamResult>(q, destroyRef, (a, b) => b.createdAt - a.createdAt);
  }

  /** كلّ نتائج اختبارات التجويد لطالب معيّن — لمزامنتها مع صفحة ملفّه الشخصيّ. */
  studentTajweedExamResults(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<TajweedExamResult[] | undefined> {
    const q = this.scopedCol(COL.tajweedExamResults, where('studentId', '==', studentId));
    return this.live<TajweedExamResult>(q, destroyRef, (a, b) => b.createdAt - a.createdAt);
  }

  /** كلّ اختبارات التجويد — للتقارير التي تغطّي أكثر من حلقة تجويد. */
  allTajweedExams(destroyRef?: DestroyRef): Signal<TajweedExam[] | undefined> {
    return this.live<TajweedExam>(this.scopedCol(COL.tajweedExams), destroyRef, this.byDateDesc);
  }

  /** كلّ نتائج اختبارات التجويد — تُربَط باختباراتها داخل طبقة حساب التقارير. */
  allTajweedExamResults(destroyRef?: DestroyRef): Signal<TajweedExamResult[] | undefined> {
    return this.live<TajweedExamResult>(
      this.scopedCol(COL.tajweedExamResults),
      destroyRef,
      this.byDateDesc,
    );
  }

  async addTajweedExam(input: {
    circleId: string;
    name: string;
    date: string;
    time?: string;
    durationMin?: number;
    studentIds: string[];
    totalScore: number;
    passScore: number;
  }): Promise<string> {
    const created = await addDoc(
      this.col(COL.tajweedExams),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    await this.logActivity({
      action: 'create',
      target: 'tajweedExam',
      summary: `إنشاء اختبار تجويد «${input.name}» (${input.studentIds.length} طالبًا، من ${input.totalScore} وعلامة نجاح ${input.passScore})`,
      sessionLabel: input.date,
    });
    return created.id;
  }

  async updateTajweedExam(
    id: string,
    patch: Partial<Pick<TajweedExam, 'name' | 'date' | 'time' | 'durationMin' | 'studentIds'>>,
  ): Promise<void> {
    await updateDoc(this.ref(COL.tajweedExams, id), clean(patch));
  }

  /** حذف اختبار تجويد وكلّ نتائجه المرتبطة معًا — ذرّيًّا مع تسجيل في سجلّ الحركات. */
  async deleteTajweedExam(id: string): Promise<void> {
    const [examSnap, results] = await Promise.all([
      getDoc(this.ref(COL.tajweedExams, id)),
      getDocs(this.scopedCol(COL.tajweedExamResults, where('examId', '==', id))),
    ]);
    if (!examSnap.exists()) return;
    const exam = examSnap.data() as TajweedExam;
    const snapshots: ActivitySnapshot[] = [
      { collectionName: COL.tajweedExams, id, data: exam as unknown as Record<string, unknown> },
    ];
    const ops: Parameters<DataService['runBatched']>[0] = [
      { kind: 'delete', ref: this.ref(COL.tajweedExams, id) },
    ];
    for (const d of results.docs) {
      snapshots.push({
        collectionName: COL.tajweedExamResults,
        id: d.id,
        data: d.data() as Record<string, unknown>,
      });
      ops.push({ kind: 'delete', ref: d.ref });
    }
    await this.runBatched(ops);
    await this.logActivity({
      action: 'delete',
      target: 'tajweedExam',
      summary: `حذف اختبار التجويد «${exam.name}» (${results.docs.length} نتيجة مرتبطة)`,
      snapshots,
      sessionLabel: exam.date,
    });
  }

  /**
   * يسجّل/يحدّث درجة طالب في اختبار تجويد — معرّف ثابت `{examId}_{studentId}`
   * فلا يتكرّر السجلّ عند إعادة الحفظ (upsert حقيقيّ). تُزامَن النتيجة تلقائيًّا
   * مع صفحة ملفّ الطالب عبر `studentTajweedExamResults()` (نفس المجموعة، بلا
   * أيّ خطوة نسخ إضافيّة).
   */
  async upsertTajweedExamResult(input: {
    examId: string;
    circleId: string;
    studentId: string;
    examName: string;
    date: string;
    totalScore: number;
    passScore: number;
    score: number;
    /** ذو معنى فقط عند score >= passScore — يُهمَل (وليس يُرسَل) دون ذلك. */
    rating?: 'very_good' | 'excellent';
    notes?: string;
  }): Promise<void> {
    const { examId, studentId } = input;
    const id = `${examId}_${studentId}`;
    const before = await this.getOneForAudit<TajweedExamResult>(COL.tajweedExamResults, id);
    const payload = this.owned(
      clean({
        ...input,
        rating: input.score >= input.passScore ? (input.rating ?? 'very_good') : undefined,
        createdAt: Date.now(),
      }),
    );
    await setDoc(this.ref(COL.tajweedExamResults, id), payload, { merge: true });
    const student = await this.getStudent(studentId).catch(() => null);
    if (before) {
      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        payload as unknown as Record<string, unknown>,
        TAJWEED_EXAM_RESULT_DIFF_FIELDS,
      );
      if (changes.length) {
        await this.logActivity({
          action: 'update',
          target: 'tajweedExam',
          summary: `تعديل درجة اختبار التجويد لـ${student?.name ?? ''}`,
          fieldChanges: changes,
          snapshots: [
            {
              collectionName: COL.tajweedExamResults,
              id,
              data: before as unknown as Record<string, unknown>,
            },
          ],
          studentName: student?.name,
        });
      }
    } else {
      await this.logActivity({
        action: 'create',
        target: 'tajweedExam',
        summary: `تسجيل درجة اختبار تجويد لـ${student?.name ?? ''} (${input.score}/${input.totalScore})`,
        studentName: student?.name,
      });
    }
  }

  // ======================================================================
  //  لوحة المالك (v1.26.0) — قراءة فقط، لا يصل لها إلّا حساب المالك (البريد
  //  المطابق لـ OWNER_EMAIL) بفضل isPlatformOwner() في firestore.rules.
  //  استخدام هذه الدوال من حساب غير المالك يُرجع قائمة فارغة/رفض صلاحيّات،
  //  لا خطأ — الحارس ownerGuard يمنع الوصول لصفحات المالك أصلًا قبل ذلك.
  // ======================================================================

  /** عدّادات المنصّة العامّة (مستند واحد). */
  platformStats(destroyRef?: DestroyRef): Signal<PlatformStats | undefined> {
    const out = signal<PlatformStats | undefined>(undefined);
    const unsub = onSnapshot(doc(db, PLATFORM_COL.statsDoc), (snap) => {
      out.set(
        (snap.data() as PlatformStats | undefined) ?? {
          totalTeachers: 0,
          totalCircles: 0,
          totalStudents: 0,
          totalRecitations: 0,
          uniqueDevices: 0,
        },
      );
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /** قائمة كل المعلّمين المسجَّلين — للوحة المالك فقط. */
  platformTeachers(destroyRef?: DestroyRef): Signal<PlatformTeacherSummary[] | undefined> {
    const out = signal<PlatformTeacherSummary[] | undefined>(undefined);
    const unsub = onSnapshot(collection(db, PLATFORM_COL.teachers), (snap) => {
      out.set(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) }) as PlatformTeacherSummary)
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt),
      );
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /** حلقات معلّم محدَّد (نسخة خفيفة) — لتصفّح المالك التفصيليّ. */
  platformTeacherCircles(
    uid: string,
    destroyRef?: DestroyRef,
  ): Signal<PlatformMirrorItem[] | undefined> {
    const out = signal<PlatformMirrorItem[] | undefined>(undefined);
    const unsub = onSnapshot(collection(db, PLATFORM_COL.teachers, uid, 'circleMirror'), (snap) => {
      out.set(snap.docs.map((d) => d.data() as PlatformMirrorItem));
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /** طلّاب معلّم محدَّد (نسخة خفيفة) — لتصفّح المالك التفصيليّ. */
  platformTeacherStudents(
    uid: string,
    destroyRef?: DestroyRef,
  ): Signal<PlatformMirrorItem[] | undefined> {
    const out = signal<PlatformMirrorItem[] | undefined>(undefined);
    const unsub = onSnapshot(
      collection(db, PLATFORM_COL.teachers, uid, 'studentMirror'),
      (snap) => {
        out.set(snap.docs.map((d) => d.data() as PlatformMirrorItem));
      },
    );
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /**
   * آخر ٥٠ حدث فتح/إغلاق جلسة لمعلّم محدَّد، الأحدث أوّلًا — لتبويب «الأجهزة
   * والجلسات» في تفاصيل المعلّم من لوحة المالك (v1.34).
   */
  platformTeacherSessions(
    uid: string,
    destroyRef?: DestroyRef,
  ): Signal<PlatformSessionMirror[] | undefined> {
    const out = signal<PlatformSessionMirror[] | undefined>(undefined);
    const unsub = onSnapshot(
      query(
        collection(db, PLATFORM_COL.teachers, uid, 'sessionMirror'),
        orderBy('updatedAt', 'desc'),
        fbLimit(50),
      ),
      (snap) => {
        out.set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlatformSessionMirror));
      },
    );
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /**
   * كل الحلقات عبر كل المعلّمين دفعة واحدة (collectionGroup) — لصفحة تصفّح
   * الحلقات من لوحة المالك (v1.34)، مطابقًا تمامًا لأسلوب `searchPlatformStudents`
   * (عرض فقط، بلا أيّ دمج أو فرز خادميّ يحتاج فهرسًا مركّبًا).
   */
  platformAllCircles(destroyRef?: DestroyRef): Signal<PlatformMirrorItem[] | undefined> {
    const out = signal<PlatformMirrorItem[] | undefined>(undefined);
    const unsub = onSnapshot(collectionGroup(db, 'circleMirror'), (snap) => {
      out.set(
        snap.docs
          .map((d) => d.data() as PlatformMirrorItem)
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /**
   * كل الطلّاب عبر كل المعلّمين دفعة واحدة (collectionGroup، حيّة) — لصفحة
   * تصفّح/بحث الطلّاب من لوحة المالك (v1.34؛ كانت `searchPlatformStudents`
   * السابقة بحثًا لمرّة واحدة بلا تصفّح، فلا تعرض شيئًا قبل الكتابة — استُبدلت
   * بهذه لإتاحة «كل الطلّاب» كقائمة فعليّة، والتصفية تحدث محليًّا في الصفحة).
   * **بلا أيّ دمج أو محاولة مطابقة** بين نتائج معلّمين مختلفين (قرار متعمَّد
   * بموافقة المستخدم: لا يوجد معرّف فريد حقيقيّ للطالب في هذا التطبيق، فتشابه
   * الاسم لا يعني بالضرورة نفس الطفل — كل نتيجة سجلّ طالب مستقلّ تمامًا تحت معلّمه).
   */
  platformAllStudents(destroyRef?: DestroyRef): Signal<PlatformMirrorItem[] | undefined> {
    const out = signal<PlatformMirrorItem[] | undefined>(undefined);
    const unsub = onSnapshot(collectionGroup(db, 'studentMirror'), (snap) => {
      out.set(
        snap.docs
          .map((d) => d.data() as PlatformMirrorItem)
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /** سجلّ كل حركات الحذف عبر كل المعلّمين — للوحة المالك فقط. */
  platformDeletedItems(destroyRef?: DestroyRef): Signal<ActivityLogEntry[] | undefined> {
    const out = signal<ActivityLogEntry[] | undefined>(undefined);
    const unsub = onSnapshot(query(collection(db, PLATFORM_COL.deletedItems)), (snap) => {
      out.set(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) }) as ActivityLogEntry)
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    });
    destroyRef?.onDestroy(unsub);
    return out;
  }

  /**
   * يستعيد حركة حذف من منظور المالك — نفس منطق `restoreActivity()` بالضبط،
   * لكن مصدرها `platformDeletedItems` (يقرؤها المالك) لا `activityLog`
   * (لا يقرؤه المالك). الكتابة تمرّ لأنّ كل مستند مُستعاد يحمل ownerId
   * الأصليّ الصحيح (المعلّم الحقيقيّ صاحب البيانات)، وقواعد create/update
   * تسمح صراحة لحساب المالك بهذا تحديدًا (`isPlatformOwner()` — راجع
   * firestore.rules، عمليّات مستند واحد آمنة مع OR، لا علاقة بثغرة list).
   */
  async restorePlatformDeletedItem(logId: string): Promise<void> {
    const snap = await getDoc(doc(db, PLATFORM_COL.deletedItems, logId));
    if (!snap.exists()) throw new Error('لم يُعثر على سجلّ هذه الحركة');
    const entry = snap.data() as ActivityLogEntry;

    // حساب معلّم موقوف (v1.34) — استعادة مختلفة تمامًا عن بقيّة الأنواع: لا
    // `snapshots` هنا إطلاقًا (لم نُخزِّن نسخة من مستند platformTeachers كاملًا
    // عمدًا — إعادة كتابته بالكامل كانت ستمحو عدّاداته الحاليّة إن تغيّرت منذ
    // الإيقاف). المطلوب فقط مسح `disabledAt`، لا استبدال المستند.
    if (entry.target === 'teacher') {
      if (!entry.teacherUid) throw new Error('سجلّ حساب معلّم بلا معرّف — تعذّرت الاستعادة');
      await updateDoc(doc(db, PLATFORM_COL.teachers, entry.teacherUid), {
        disabledAt: deleteField(),
      });
      await updateDoc(doc(db, PLATFORM_COL.deletedItems, logId), { restoredAt: Date.now() });
      return;
    }

    if (!entry.snapshots?.length) throw new Error('لا توجد بيانات محفوظة لاستعادتها لهذه الحركة');
    for (const s of entry.snapshots) {
      await setDoc(this.ref(s.collectionName, s.id), s.data);
    }
    await updateDoc(doc(db, PLATFORM_COL.deletedItems, logId), { restoredAt: Date.now() });
  }

  /**
   * يوقف حساب معلّم (v1.34) — لوحة المالك فقط (`isPlatformOwner()` في
   * firestore.rules). لا يحذف حساب Firebase Auth نفسه ولا أيًّا من بياناته
   * الحقيقيّة (circles/students/...، تبقى سليمة تمامًا) — فقط يمنع الدخول
   * (`AuthService.loadOrCreateTeacher` يرفضه عند أوّل تحقّق تالٍ) ويُسجَّله في
   * «سجلّ المحذوفات» قابلًا للاستعادة الفوريّة (مسح `disabledAt` فقط).
   *
   * حذف حساب Firebase Auth فعليًّا وبياناته نهائيًّا يتطلّب Admin SDK (Cloud
   * Function) — غير متاح على خطّة Spark الحاليّة بلا ترقية، ومتروك عمدًا
   * خارج هذه الدالّة (قرار تكلفة يخصّ صاحب المشروع، لا قرارًا تقنيًّا فقط).
   */
  async disableTeacherAccount(uid: string, name: string, email: string): Promise<void> {
    await updateDoc(doc(db, PLATFORM_COL.teachers, uid), { disabledAt: Date.now() });
    const logRef = doc(collection(db, PLATFORM_COL.deletedItems));
    const payload: Omit<ActivityLogEntry, 'id'> = {
      action: 'delete',
      target: 'teacher',
      summary: `إيقاف حساب المعلّم «${name}» (${email})`,
      teacherUid: uid,
      actorName: this.auth.teacher()?.name || 'المالك',
      createdAt: Date.now(),
      restoredAt: null,
    };
    await setDoc(logRef, clean(payload));
  }
}

/** يحذف الحقول ذات القيمة undefined (Firestore لا يقبلها) */
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
