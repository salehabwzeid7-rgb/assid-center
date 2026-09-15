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
  onSnapshot,
  query,
  where,
  writeBatch,
  deleteField,
  arrayUnion,
  runTransaction,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { completedJuz } from './quran-data';
import {
  COL,
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
  type ActivityAction,
  type ActivityTarget,
  type ActivityFieldChange,
  type ActivitySnapshot,
  type ActivityLogEntry,
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
      await addDoc(
        this.col(COL.activityLog),
        this.owned(
          clean({
            ...entry,
            actorName: this.auth.teacher()?.name ?? '',
            createdAt: Date.now(),
            restoredAt: null,
          }),
        ),
      );
    } catch (e) {
      console.error('تعذّر تسجيل الحركة في سجل التدقيق:', e);
    }
  }

  /** سجلّ الحركات كاملًا — الأحدث أوّلًا. تُستخدم في شاشة «سجل الحركات» فقط. */
  activityLog(destroyRef?: DestroyRef): Signal<ActivityLogEntry[] | undefined> {
    return this.live<ActivityLogEntry>(
      query(this.col(COL.activityLog)),
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
    return this.live<Circle>(query(this.col(COL.circles)), destroyRef, this.byNameAr);
  }

  /** طلاب حلقة معيّنة — يدعم التسجيل المتعدّد (circleIds) والقديم (circleId). */
  studentsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    const all = this.allStudents(destroyRef);
    return computed(() => all()?.filter((s) => studentCircleIds(s).includes(circleId)));
  }

  allStudents(destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    return this.live<Student>(query(this.col(COL.students)), destroyRef, this.byNameAr);
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
    const q = query(this.col(COL.sessions), where('circleId', '==', circleId));
    return this.live<Session>(q, destroyRef, this.byDateDesc);
  }

  /** كل الجلسات (للجدول واللوحة الرئيسية) — مرتّبة بالأحدث تاريخًا. */
  allSessions(destroyRef?: DestroyRef): Signal<Session[] | undefined> {
    return this.live<Session>(query(this.col(COL.sessions)), destroyRef, this.byDateDesc);
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

  async setSessionStatus(id: string, status: SessionStatus): Promise<void> {
    const before = await this.getOneForAudit<Session>(COL.sessions, id);
    await updateDoc(this.ref(COL.sessions, id), {
      status,
      ...(status === 'closed' ? { closedAt: Date.now() } : {}),
    });
    if (before && before.status !== status) {
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
      getDocs(query(this.col(COL.attendance), where('sessionId', '==', id))),
      getDocs(query(this.col(COL.recitations), where('sessionId', '==', id))),
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
    const q = query(this.col(COL.attendance), where('sessionId', '==', sessionId));
    return this.live<AttendanceRecord>(q, destroyRef);
  }

  sessionRecitations(
    sessionId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = query(this.col(COL.recitations), where('sessionId', '==', sessionId));
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

  /** تسميع الطالب ضمن جلسة — سجل واحد لكل طالب في الجلسة (قابل للتعديل) */
  async upsertSessionRecitation(
    sessionId: string,
    studentId: string,
    input: NewRecitation,
  ): Promise<void> {
    const id = `${sessionId}_${studentId}`;
    const ref = this.ref(COL.recitations, id);
    const payload = this.owned({ ...clean(input), createdAt: Date.now() });
    let before: RecitationRecord | null = null;
    try {
      // معاملة ذرّيّة: تحمي من فقدان تعديل حين يحفظ جهازان متّصلان بالإنترنت
      // لنفس السجلّ في اللحظة نفسها تقريبًا (كلّ من يقرأ قبل الآخر يكتب فوقه
      // بصمت في المسار العاديّ). المعاملات لا تعمل بلا اتصال إطلاقًا (خلافًا
      // للكتابة العاديّة المخزَّنة محلّيًّا)، فنتراجع تلقائيًّا للمسار المعتاد
      // أدناه عند فشلها لأيّ سبب — يبقى الحفظ يعمل دائمًا بلا اتصال كالمعتاد.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        before = snap.exists()
          ? (this.inScope([{ id: snap.id, ...(snap.data() as object) }] as RecitationRecord[])[0] ??
            null)
          : null;
        tx.set(ref, payload);
      });
    } catch (e) {
      console.warn('تعذّرت الكتابة الذرّيّة للتسميع (على الأرجح بلا اتصال) — الكتابة المعتادة:', e);
      before = await this.getOneForAudit<RecitationRecord>(COL.recitations, id);
      await setDoc(ref, payload);
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

  async getSessionRecitation(
    sessionId: string,
    studentId: string,
  ): Promise<RecitationRecord | null> {
    return this.getOne<RecitationRecord>(COL.recitations, `${sessionId}_${studentId}`);
  }

  // ---------- سجلات الطالب (للملف الشخصي) ----------

  studentRecitations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = query(this.col(COL.recitations), where('studentId', '==', studentId));
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
    const q = query(this.col(COL.attendance), where('studentId', '==', studentId));
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
    const q = query(this.col(COL.evaluations), where('studentId', '==', studentId));
    return this.live<EvaluationRecord>(q, destroyRef, this.byDateDesc);
  }

  // ---------- سجلات الحلقة (للإحصائيات) ----------

  /** كالسابقة — مقعد واحد لكلّ (طالب، تاريخ) لنفس السبب الموثَّق في `studentAttendance`. */
  circleAttendance(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = query(this.col(COL.attendance), where('circleId', '==', circleId));
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
    const q = query(this.col(COL.recitations), where('circleId', '==', circleId));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  // ---------- للوحة الرئيسية ----------

  /** كالسابقة — مقعد واحد لكلّ طالب في هذا التاريخ لنفس السبب الموثَّق في `studentAttendance`. */
  attendanceForDate(date: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    const q = query(this.col(COL.attendance), where('date', '==', date));
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
    const raw = this.live<AttendanceRecord>(query(this.col(COL.attendance)), destroyRef);
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
    const q = query(this.col(COL.recitations), where('date', '==', date));
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
    const [circleSnap, sessions, attendance, recitations, students] = await Promise.all([
      getDoc(this.ref(COL.circles, id)),
      getDocs(query(this.col(COL.sessions), where('circleId', '==', id))),
      getDocs(query(this.col(COL.attendance), where('circleId', '==', id))),
      getDocs(query(this.col(COL.recitations), where('circleId', '==', id))),
      getDocs(this.col(COL.students)),
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

    const snap = await getDocs(query(this.col(COL.sessions), where('circleId', '==', circle.id)));
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
    const legacy = await getDocs(query(this.col(COL.sessions), where('circleId', '==', circleId)));
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
    const cols = [COL.attendance, COL.recitations, COL.evaluations, COL.serd, COL.exams];
    const [studentSnap, ...snaps] = await Promise.all([
      getDoc(this.ref(COL.students, id)),
      ...cols.map((c) => getDocs(query(this.col(c), where('studentId', '==', id)))),
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
    const next = [...new Set([...prev, ...newOnes])];
    const wasComplete = new Set(completedJuz(prev));
    const newlyComplete = completedJuz(next).filter((j) => !wasComplete.has(j));
    return { added: newOnes.length, completedJuz: newlyComplete };
  }

  // ---------- السرد (مراجعة الأجزاء المحفوظة) ----------

  serdByStudent(studentId: string, destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    const q = query(this.col(COL.serd), where('studentId', '==', studentId));
    return this.live<SerdRecord>(q, destroyRef, this.byDateDesc);
  }

  circleSerd(circleId: string, destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    const q = query(this.col(COL.serd), where('circleId', '==', circleId));
    return this.live<SerdRecord>(q, destroyRef, this.byDateDesc);
  }

  allSerds(destroyRef?: DestroyRef): Signal<SerdRecord[] | undefined> {
    return this.live<SerdRecord>(query(this.col(COL.serd)), destroyRef, this.byDateDesc);
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
    const q = query(this.col(COL.exams), where('studentId', '==', studentId));
    return this.live<ExamRecord>(q, destroyRef, this.byDateDesc);
  }

  circleExams(circleId: string, destroyRef?: DestroyRef): Signal<ExamRecord[] | undefined> {
    const q = query(this.col(COL.exams), where('circleId', '==', circleId));
    return this.live<ExamRecord>(q, destroyRef, this.byDateDesc);
  }

  allExams(destroyRef?: DestroyRef): Signal<ExamRecord[] | undefined> {
    return this.live<ExamRecord>(query(this.col(COL.exams)), destroyRef, this.byDateDesc);
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
}

/** يحذف الحقول ذات القيمة undefined (Firestore لا يقبلها) */
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
