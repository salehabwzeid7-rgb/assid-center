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
  type CollectionReference,
  type DocumentReference,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { AuthService } from './auth.service';
import { completedJuz } from './quran-data';
import {
  COL,
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
} from './models';

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
    )[],
  ): Promise<void> {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        if (op.kind === 'delete') batch.delete(op.ref);
        else batch.update(op.ref, op.data);
      }
      await batch.commit();
    }
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

  private live<T extends { id: string; ownerId?: string }>(
    q: Query<DocumentData>,
    destroyRef?: DestroyRef,
    sortBy?: (a: T, b: T) => number,
  ): Signal<T[] | undefined> {
    const out = signal<T[] | undefined>(undefined);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = this.inScope(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T),
        );
        out.set(sortBy ? rows.sort(sortBy) : rows);
      },
      (err) => {
        console.error('خطأ في مزامنة Firestore:', err);
        out.set([]);
      },
    );
    destroyRef?.onDestroy(unsub);
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

  async getSession(id: string): Promise<Session | null> {
    return this.getOne<Session>(COL.sessions, id);
  }

  async setSessionStatus(id: string, status: SessionStatus): Promise<void> {
    await updateDoc(this.ref(COL.sessions, id), {
      status,
      ...(status === 'closed' ? { closedAt: Date.now() } : {}),
    });
  }

  async setSessionNote(id: string, note: string): Promise<void> {
    await updateDoc(this.ref(COL.sessions, id), { note });
  }

  /** حذف الجلسة وكل حضورها وتسميعها */
  async deleteSession(id: string): Promise<void> {
    const [att, rec] = await Promise.all([
      getDocs(query(this.col(COL.attendance), where('sessionId', '==', id))),
      getDocs(query(this.col(COL.recitations), where('sessionId', '==', id))),
    ]);
    await Promise.all([
      ...att.docs.map((d) => deleteDoc(d.ref)),
      ...rec.docs.map((d) => deleteDoc(d.ref)),
      deleteDoc(this.ref(COL.sessions, id)),
    ]);
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
    await setDoc(
      this.ref(COL.attendance, id),
      this.owned(clean({ ...input, createdAt: Date.now() })),
      { merge: true },
    );
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
    await setDoc(
      this.ref(COL.recitations, id),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
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

  studentAttendance(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = query(this.col(COL.attendance), where('studentId', '==', studentId));
    return this.live<AttendanceRecord>(q, destroyRef, this.byDateDesc);
  }

  studentEvaluations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<EvaluationRecord[] | undefined> {
    const q = query(this.col(COL.evaluations), where('studentId', '==', studentId));
    return this.live<EvaluationRecord>(q, destroyRef, this.byDateDesc);
  }

  // ---------- سجلات الحلقة (للإحصائيات) ----------

  circleAttendance(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    const q = query(this.col(COL.attendance), where('circleId', '==', circleId));
    return this.live<AttendanceRecord>(q, destroyRef);
  }

  circleRecitations(
    circleId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    const q = query(this.col(COL.recitations), where('circleId', '==', circleId));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  // ---------- للوحة الرئيسية ----------

  attendanceForDate(date: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    const q = query(this.col(COL.attendance), where('date', '==', date));
    return this.live<AttendanceRecord>(q, destroyRef);
  }

  /** كل سجلات الحضور (لحساب معدّل الحضور العام في البانر). */
  allAttendance(destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    return this.live<AttendanceRecord>(query(this.col(COL.attendance)), destroyRef);
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
    return created.id;
  }

  async updateCircle(id: string, patch: Partial<NewCircle>): Promise<void> {
    const next: Record<string, unknown> = { ...patch };
    if (patch.name !== undefined) next['name'] = patch.name.trim();
    if (patch.weekdays !== undefined) next['weekdays'] = [...patch.weekdays].sort((a, b) => a - b);
    await updateDoc(this.ref(COL.circles, id), clean(next));
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
    const [sessions, attendance, recitations, students] = await Promise.all([
      getDocs(query(this.col(COL.sessions), where('circleId', '==', id))),
      getDocs(query(this.col(COL.attendance), where('circleId', '==', id))),
      getDocs(query(this.col(COL.recitations), where('circleId', '==', id))),
      getDocs(this.col(COL.students)),
    ]);

    const ops: Parameters<DataService['runBatched']>[0] = [];
    for (const d of [...sessions.docs, ...attendance.docs, ...recitations.docs]) {
      ops.push({ kind: 'delete', ref: d.ref });
    }
    for (const d of students.docs) {
      const s = d.data() as Student;
      const ids = studentCircleIds(s);
      if (ids.includes(id)) {
        ops.push({
          kind: 'update',
          ref: d.ref,
          data: { circleIds: ids.filter((x) => x !== id), circleId: deleteField() },
        });
      }
    }
    ops.push({ kind: 'delete', ref: this.ref(COL.circles, id) });
    await this.runBatched(ops);
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
    return created.id;
  }

  async updateStudent(id: string, patch: Partial<NewStudent>): Promise<void> {
    await updateDoc(this.ref(COL.students, id), clean(patch));
  }

  async setStudentActive(id: string, active: boolean): Promise<void> {
    await updateDoc(this.ref(COL.students, id), { active });
  }

  /**
   * حذف نهائيّ وكامل للطالب من السحابة والتخزين المحلّيّ معًا:
   * مستند الطالب + كلّ سجلّاته (الحضور، التسميع، التقييم اليوميّ، السرد، الاختبار).
   * لا يمسّ الحلقات. العمليّة ذرّيّة على دفعات وتنعكس لحظيًّا على كلّ الأجهزة.
   */
  async deleteStudent(id: string): Promise<void> {
    const cols = [COL.attendance, COL.recitations, COL.evaluations, COL.serd, COL.exams];
    const snaps = await Promise.all(
      cols.map((c) => getDocs(query(this.col(c), where('studentId', '==', id)))),
    );
    const ops: Parameters<DataService['runBatched']>[0] = [];
    for (const snap of snaps) for (const d of snap.docs) ops.push({ kind: 'delete', ref: d.ref });
    ops.push({ kind: 'delete', ref: this.ref(COL.students, id) });
    await this.runBatched(ops);
  }

  /**
   * يضمّ سورًا إلى سجلّ المقرّر القرآنيّ للطالب (دمج بلا تكرار).
   * يُستدعى تلقائيًّا عند تسجيل «حفظ جديد» في الجلسة/التسميع.
   * يُرجع عدد السور المضافة والأجزاء التي اكتملت حفظًا بهذه الإضافة.
   */
  async mergeStudentMemorizedSurahs(
    studentId: string,
    surahs: number[],
  ): Promise<{ added: number; completedJuz: number[] }> {
    const valid = surahs.filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
    if (valid.length === 0) return { added: 0, completedJuz: [] };
    const student = await this.getStudent(studentId);
    if (!student) return { added: 0, completedJuz: [] };
    const prev = student.memorizedSurahs ?? [];
    const set = new Set(prev);
    const before = set.size;
    valid.forEach((n) => set.add(n));
    if (set.size === before) return { added: 0, completedJuz: [] };
    const next = [...set].sort((a, b) => a - b);
    await updateDoc(this.ref(COL.students, studentId), { memorizedSurahs: next });
    const wasComplete = new Set(completedJuz(prev));
    const newlyComplete = completedJuz(next).filter((j) => !wasComplete.has(j));
    return { added: set.size - before, completedJuz: newlyComplete };
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
    return created.id;
  }

  async deleteSerd(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.serd, id));
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
    return created.id;
  }

  async deleteExam(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.exams, id));
  }

  async addRecitation(input: NewRecitation): Promise<string> {
    const created = await addDoc(
      this.col(COL.recitations),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    return created.id;
  }

  async addEvaluation(input: NewEvaluation): Promise<string> {
    const created = await addDoc(
      this.col(COL.evaluations),
      this.owned({ ...clean(input), createdAt: Date.now() }),
    );
    return created.id;
  }

  async deleteRecitation(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.recitations, id));
  }

  async deleteEvaluation(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.evaluations, id));
  }

  // ---------- حذف شامل (مرحلة الاختبار فقط) ----------

  /**
   * يحذف مستندات مجموعات البيانات من Firestore (الحلقات، الطلاب، الجلسات،
   * الحضور، التسميع، التقييم، السرد، الاختبار). لا يمسّ مجموعة teachers ولا
   * حسابات المصادقة. يعمل على دفعات ≤ ٤٠٠ مستند.
   *
   * العزل: الحساب المعزول يحذف مستنداته وحدها (`ownerId === uid`)، فلا يمسّ
   * بيانات المساحة المشتركة ولا أيّ حساب آخر. الحساب القديم يحذف الكلّ كما كان.
   * يُرجع إجماليّ عدد المستندات المحذوفة.
   */
  async wipeAllData(): Promise<number> {
    let deleted = 0;
    const uid = this.scopeUid();
    for (const name of Object.values(COL)) {
      // نكرّر لأنّ getDocs قد يعيد صفحةً واحدة كبيرة؛ الحذف على دفعات
      // ثمّ إعادة الجلب حتى تفرغ المجموعة تمامًا.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const q = uid ? query(this.col(name), where('ownerId', '==', uid)) : query(this.col(name));
        const snap = await getDocs(q);
        if (snap.empty) break;
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = snap.docs.slice(i, i + 400);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          deleted += chunk.length;
        }
      }
    }
    return deleted;
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
