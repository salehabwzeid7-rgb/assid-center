import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
  type DestroyRef,
} from '@angular/core';
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
import { environment } from '../../environments/environment';
import { db } from './firebase';
import { AuthService } from './auth.service';
import { PreviewDb } from './preview-db';
import {
  SUB,
  TEACHERS,
  type Circle,
  type Student,
  type AttendanceRecord,
  type RecitationRecord,
  type EvaluationRecord,
} from './models';

/** التاريخ الحالي بصيغة YYYY-MM-DD (توقيت الجهاز المحلي) */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type NewCircle = { name: string; session?: string };
type NewStudent = Omit<Student, 'id' | 'createdAt'>;
type NewRecitation = Omit<RecitationRecord, 'id' | 'createdAt'>;
type NewEvaluation = Omit<EvaluationRecord, 'id' | 'createdAt'>;
type NewAttendance = Omit<AttendanceRecord, 'id' | 'createdAt'>;

@Injectable({ providedIn: 'root' })
export class DataService {
  private auth = inject(AuthService);
  private pdb = inject(PreviewDb);
  private readonly preview = environment.preview;

  private get uid(): string {
    const id = this.auth.user()?.uid;
    if (!id) throw new Error('لا يوجد مستخدم مسجَّل الدخول');
    return id;
  }

  /** مرجع مجموعة فرعية تحت مستند المعلّم الحالي */
  private col(name: string): CollectionReference<DocumentData> {
    return collection(db, TEACHERS, this.uid, name);
  }

  private byNameAr = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'ar');
  private byDateDesc = (
    a: { date: string; createdAt: number },
    b: { date: string; createdAt: number },
  ) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

  // ======================================================================
  //  اشتراكات لحظية
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

  /** كل حلقات المعلّم */
  circles(destroyRef?: DestroyRef): Signal<Circle[] | undefined> {
    if (this.preview) return computed(() => [...this.pdb.circles()].sort(this.byNameAr));
    return this.live<Circle>(query(this.col(SUB.circles)), destroyRef, this.byNameAr);
  }

  /** طلاب حلقة معيّنة */
  studentsByCircle(circleId: string, destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    if (this.preview)
      return computed(() =>
        this.pdb.students().filter((s) => s.circleId === circleId).sort(this.byNameAr),
      );
    const q = query(this.col(SUB.students), where('circleId', '==', circleId));
    return this.live<Student>(q, destroyRef, this.byNameAr);
  }

  /** كل طلاب المعلّم */
  allStudents(destroyRef?: DestroyRef): Signal<Student[] | undefined> {
    if (this.preview) return computed(() => [...this.pdb.students()].sort(this.byNameAr));
    return this.live<Student>(query(this.col(SUB.students)), destroyRef, this.byNameAr);
  }

  studentRecitations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<RecitationRecord[] | undefined> {
    if (this.preview)
      return computed(() =>
        this.pdb.recitations().filter((r) => r.studentId === studentId).sort(this.byDateDesc),
      );
    const q = query(this.col(SUB.recitations), where('studentId', '==', studentId));
    return this.live<RecitationRecord>(q, destroyRef, this.byDateDesc);
  }

  studentAttendance(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<AttendanceRecord[] | undefined> {
    if (this.preview)
      return computed(() =>
        this.pdb.attendance().filter((r) => r.studentId === studentId).sort(this.byDateDesc),
      );
    const q = query(this.col(SUB.attendance), where('studentId', '==', studentId));
    return this.live<AttendanceRecord>(q, destroyRef, this.byDateDesc);
  }

  studentEvaluations(
    studentId: string,
    destroyRef?: DestroyRef,
  ): Signal<EvaluationRecord[] | undefined> {
    if (this.preview)
      return computed(() =>
        this.pdb.evaluations().filter((r) => r.studentId === studentId).sort(this.byDateDesc),
      );
    const q = query(this.col(SUB.evaluations), where('studentId', '==', studentId));
    return this.live<EvaluationRecord>(q, destroyRef, this.byDateDesc);
  }

  /** حضور يوم محدد (كل الحلقات) */
  attendanceForDate(date: string, destroyRef?: DestroyRef): Signal<AttendanceRecord[] | undefined> {
    if (this.preview) return computed(() => this.pdb.attendance().filter((a) => a.date === date));
    const q = query(this.col(SUB.attendance), where('date', '==', date));
    return this.live<AttendanceRecord>(q, destroyRef);
  }

  /** تسميع يوم محدد (كل الحلقات) */
  recitationsForDate(date: string, destroyRef?: DestroyRef): Signal<RecitationRecord[] | undefined> {
    if (this.preview) return computed(() => this.pdb.recitations().filter((r) => r.date === date));
    const q = query(this.col(SUB.recitations), where('date', '==', date));
    return this.live<RecitationRecord>(q, destroyRef);
  }

  // ======================================================================
  //  قراءات لمرة واحدة
  // ======================================================================

  async getCircle(id: string): Promise<Circle | null> {
    if (this.preview) return this.pdb.circles().find((c) => c.id === id) ?? null;
    const s = await getDoc(doc(db, TEACHERS, this.uid, SUB.circles, id));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as Circle) : null;
  }

  async getStudent(id: string): Promise<Student | null> {
    if (this.preview) return this.pdb.students().find((s) => s.id === id) ?? null;
    const s = await getDoc(doc(db, TEACHERS, this.uid, SUB.students, id));
    return s.exists() ? ({ id: s.id, ...(s.data() as object) } as Student) : null;
  }

  /** حضور حلقة في يوم محدد (قراءة واحدة) — للتحضير الجماعي */
  async loadCircleAttendance(circleId: string, date: string): Promise<AttendanceRecord[]> {
    if (this.preview)
      return this.pdb.attendance().filter((a) => a.date === date && a.circleId === circleId);
    const snap = await getDocs(query(this.col(SUB.attendance), where('date', '==', date)));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as AttendanceRecord)
      .filter((a) => a.circleId === circleId);
  }

  // ======================================================================
  //  كتابة
  // ======================================================================

  async addCircle(input: NewCircle): Promise<string> {
    if (this.preview) return this.pdb.addCircle(input);
    const ref = await addDoc(this.col(SUB.circles), {
      name: input.name.trim(),
      session: input.session?.trim() ?? '',
      createdAt: Date.now(),
    });
    return ref.id;
  }

  async addStudent(input: NewStudent): Promise<string> {
    if (this.preview) return this.pdb.addStudent({ ...input, name: input.name.trim() });
    const ref = await addDoc(this.col(SUB.students), {
      ...clean(input),
      name: input.name.trim(),
      createdAt: Date.now(),
    });
    return ref.id;
  }

  async updateStudent(id: string, patch: Partial<NewStudent>): Promise<void> {
    if (this.preview) return this.pdb.updateStudent(id, clean(patch));
    await updateDoc(doc(db, TEACHERS, this.uid, SUB.students, id), clean(patch));
  }

  async setStudentActive(id: string, active: boolean): Promise<void> {
    if (this.preview) return this.pdb.updateStudent(id, { active });
    await updateDoc(doc(db, TEACHERS, this.uid, SUB.students, id), { active });
  }

  async addRecitation(input: NewRecitation): Promise<string> {
    if (this.preview) return this.pdb.addRecitation(clean(input) as NewRecitation);
    const ref = await addDoc(this.col(SUB.recitations), { ...clean(input), createdAt: Date.now() });
    return ref.id;
  }

  async addEvaluation(input: NewEvaluation): Promise<string> {
    if (this.preview) return this.pdb.addEvaluation(clean(input) as NewEvaluation);
    const ref = await addDoc(this.col(SUB.evaluations), { ...clean(input), createdAt: Date.now() });
    return ref.id;
  }

  /** حضور واحد لكل طالب في اليوم — معرّف ثابت حتى يُحدَّث عند إعادة التحضير */
  async upsertAttendance(input: NewAttendance): Promise<void> {
    if (this.preview) return this.pdb.upsertAttendance(clean(input) as NewAttendance);
    const id = `${input.studentId}_${input.date}`;
    await setDoc(doc(db, TEACHERS, this.uid, SUB.attendance, id), {
      ...clean(input),
      createdAt: Date.now(),
    });
  }

  async deleteRecitation(id: string): Promise<void> {
    if (this.preview) return this.pdb.deleteRecitation(id);
    await deleteDoc(doc(db, TEACHERS, this.uid, SUB.recitations, id));
  }

  async deleteEvaluation(id: string): Promise<void> {
    if (this.preview) return this.pdb.deleteEvaluation(id);
    await deleteDoc(doc(db, TEACHERS, this.uid, SUB.evaluations, id));
  }

  /** إعادة ضبط بيانات المعاينة (يظهر الزر في وضع المعاينة فقط) */
  resetPreview(): void {
    if (this.preview) this.pdb.reset();
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
