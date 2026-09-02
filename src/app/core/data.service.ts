import { Injectable, signal, type Signal, type DestroyRef } from '@angular/core';
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
  type CollectionReference,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  COL,
  type Circle,
  type Student,
  type Session,
  type SessionStatus,
  type AttendanceRecord,
  type RecitationRecord,
  type EvaluationRecord,
} from './models';

/** التاريخ الحالي بصيغة YYYY-MM-DD (توقيت الجهاز المحلي) */
export function today(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type NewCircle = { name: string; schedule?: string };
type NewStudent = Omit<Student, 'id' | 'createdAt'>;
type NewRecitation = Omit<RecitationRecord, 'id' | 'createdAt'>;
type NewEvaluation = Omit<EvaluationRecord, 'id' | 'createdAt'>;

@Injectable({ providedIn: 'root' })
export class DataService {
  /** مجموعة مشتركة على مستوى الجذر */
  private col(name: string): CollectionReference<DocumentData> {
    return collection(db, name);
  }
  private ref(name: string, id: string) {
    return doc(db, name, id);
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

  private live<T extends { id: string }>(
    q: Query<DocumentData>,
    destroyRef?: DestroyRef,
    sortBy?: (a: T, b: T) => number,
  ): Signal<T[] | undefined> {
    const out = signal<T[] | undefined>(undefined);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
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

  studentsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    const q = query(this.col(COL.students), where('circleId', '==', circleId));
    return this.live<Student>(q, destroyRef, this.byNameAr);
  }

  allStudents(destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    return this.live<Student>(query(this.col(COL.students)), destroyRef, this.byNameAr);
  }

  // ---------- الجلسات ----------

  sessionsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Session[] | undefined> {
    const q = query(this.col(COL.sessions), where('circleId', '==', circleId));
    return this.live<Session>(q, destroyRef, this.byDateDesc);
  }

  async getSession(id: string): Promise<Session | null> {
    const s = await getDoc(this.ref(COL.sessions, id));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as Session) : null;
  }

  /** يفتح جلسة الحلقة لتاريخ محدّد؛ يُعيد الموجودة إن وُجدت، وإلا ينشئ واحدة */
  async openSession(circleId: string, date: string): Promise<string> {
    const snap = await getDocs(query(this.col(COL.sessions), where('circleId', '==', circleId)));
    const existing = snap.docs.find((d) => (d.data() as Session).date === date);
    if (existing) {
      if ((existing.data() as Session).status === 'closed') {
        await updateDoc(existing.ref, { status: 'open' });
      }
      return existing.id;
    }
    const created = await addDoc(this.col(COL.sessions), {
      circleId,
      date,
      status: 'open' as SessionStatus,
      createdAt: Date.now(),
    });
    return created.id;
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

  sessionAttendance(sessionId: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
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
  }): Promise<void> {
    const id = `${input.sessionId}_${input.studentId}`;
    await setDoc(this.ref(COL.attendance, id), { ...input, createdAt: Date.now() });
  }

  /** تسميع الطالب ضمن جلسة — سجل واحد لكل طالب في الجلسة (قابل للتعديل) */
  async upsertSessionRecitation(
    sessionId: string,
    studentId: string,
    input: NewRecitation,
  ): Promise<void> {
    const id = `${sessionId}_${studentId}`;
    await setDoc(this.ref(COL.recitations, id), { ...clean(input), createdAt: Date.now() });
  }

  async getSessionRecitation(
    sessionId: string,
    studentId: string,
  ): Promise<RecitationRecord | null> {
    const s = await getDoc(this.ref(COL.recitations, `${sessionId}_${studentId}`));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as RecitationRecord) : null;
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

  circleAttendance(circleId: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
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

  recitationsForDate(date: string, destroyRef?: DestroyRef): Signal<RecitationRecord[] | undefined> {
    const q = query(this.col(COL.recitations), where('date', '==', date));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  // ---------- قراءات لمرة واحدة ----------

  async getCircle(id: string): Promise<Circle | null> {
    const s = await getDoc(this.ref(COL.circles, id));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as Circle) : null;
  }

  async getStudent(id: string): Promise<Student | null> {
    const s = await getDoc(this.ref(COL.students, id));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as Student) : null;
  }

  // ---------- كتابة ----------

  async addCircle(input: NewCircle): Promise<string> {
    const created = await addDoc(this.col(COL.circles), {
      name: input.name.trim(),
      schedule: input.schedule?.trim() ?? '',
      createdAt: Date.now(),
    });
    return created.id;
  }

  async updateCircle(id: string, patch: Partial<NewCircle>): Promise<void> {
    await updateDoc(this.ref(COL.circles, id), clean(patch));
  }

  async deleteCircle(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.circles, id));
  }

  async addStudent(input: NewStudent): Promise<string> {
    const created = await addDoc(this.col(COL.students), {
      ...clean(input),
      name: input.name.trim(),
      createdAt: Date.now(),
    });
    return created.id;
  }

  async updateStudent(id: string, patch: Partial<NewStudent>): Promise<void> {
    await updateDoc(this.ref(COL.students, id), clean(patch));
  }

  async setStudentActive(id: string, active: boolean): Promise<void> {
    await updateDoc(this.ref(COL.students, id), { active });
  }

  async addRecitation(input: NewRecitation): Promise<string> {
    const created = await addDoc(this.col(COL.recitations), {
      ...clean(input),
      createdAt: Date.now(),
    });
    return created.id;
  }

  async addEvaluation(input: NewEvaluation): Promise<string> {
    const created = await addDoc(this.col(COL.evaluations), {
      ...clean(input),
      createdAt: Date.now(),
    });
    return created.id;
  }

  async deleteRecitation(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.recitations, id));
  }

  async deleteEvaluation(id: string): Promise<void> {
    await deleteDoc(this.ref(COL.evaluations, id));
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
