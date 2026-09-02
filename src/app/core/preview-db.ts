import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import type {
  Circle,
  Student,
  AttendanceRecord,
  RecitationRecord,
  EvaluationRecord,
} from './models';

/* ==========================================================================
   مخزن بيانات المعاينة — يعمل بلا Firebase.
   يُخزَّن في localStorage ليبقى بين الجلسات، ويُبذَر ببيانات تجريبية واقعية.
   يُستخدَم فقط عندما environment.preview === true.
   ========================================================================== */

const KEY = 'assid-center:preview:v1';

interface Snapshot {
  circles: Circle[];
  students: Student[];
  attendance: AttendanceRecord[];
  recitations: RecitationRecord[];
  evaluations: EvaluationRecord[];
}

/** تاريخ بإزاحة أيام عن اليوم، بصيغة YYYY-MM-DD */
function d(offset = 0): string {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

@Injectable({ providedIn: 'root' })
export class PreviewDb {
  readonly circles = signal<Circle[]>([]);
  readonly students = signal<Student[]>([]);
  readonly attendance = signal<AttendanceRecord[]>([]);
  readonly recitations = signal<RecitationRecord[]>([]);
  readonly evaluations = signal<EvaluationRecord[]>([]);

  constructor() {
    if (environment.preview) this.load();
  }

  // ---------- استمرارية ----------
  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Snapshot;
        this.circles.set(s.circles ?? []);
        this.students.set(s.students ?? []);
        this.attendance.set(s.attendance ?? []);
        this.recitations.set(s.recitations ?? []);
        this.evaluations.set(s.evaluations ?? []);
        return;
      }
    } catch {
      /* تجاهل واذهب للبذر */
    }
    this.seed();
    this.save();
  }

  private save(): void {
    try {
      const snap: Snapshot = {
        circles: this.circles(),
        students: this.students(),
        attendance: this.attendance(),
        recitations: this.recitations(),
        evaluations: this.evaluations(),
      };
      localStorage.setItem(KEY, JSON.stringify(snap));
    } catch {
      /* التخزين ممتلئ أو محجوب — نتجاهل */
    }
  }

  /** إعادة ضبط بيانات المعاينة إلى الحالة الأصلية */
  reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* لا شيء */
    }
    this.seed();
    this.save();
  }

  private id(prefix = 'p'): string {
    return prefix + Math.random().toString(36).slice(2, 10);
  }

  // ---------- كتابة ----------
  addCircle(input: { name: string; session?: string }): string {
    const c: Circle = {
      id: this.id('c'),
      name: input.name.trim(),
      session: input.session?.trim() ?? '',
      createdAt: Date.now(),
    };
    this.circles.update((a) => [...a, c]);
    this.save();
    return c.id;
  }

  addStudent(input: Omit<Student, 'id' | 'createdAt'>): string {
    const s: Student = { ...input, id: this.id('s'), createdAt: Date.now() };
    this.students.update((a) => [...a, s]);
    this.save();
    return s.id;
  }

  updateStudent(id: string, patch: Partial<Student>): void {
    this.students.update((a) => a.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    this.save();
  }

  addRecitation(input: Omit<RecitationRecord, 'id' | 'createdAt'>): string {
    const r: RecitationRecord = { ...input, id: this.id('r'), createdAt: Date.now() };
    this.recitations.update((a) => [...a, r]);
    this.save();
    return r.id;
  }

  addEvaluation(input: Omit<EvaluationRecord, 'id' | 'createdAt'>): string {
    const e: EvaluationRecord = { ...input, id: this.id('e'), createdAt: Date.now() };
    this.evaluations.update((a) => [...a, e]);
    this.save();
    return e.id;
  }

  upsertAttendance(input: Omit<AttendanceRecord, 'id' | 'createdAt'>): void {
    const id = `${input.studentId}_${input.date}`;
    const rec: AttendanceRecord = { ...input, id, createdAt: Date.now() };
    this.attendance.update((a) => {
      const rest = a.filter((x) => x.id !== id);
      return [...rest, rec];
    });
    this.save();
  }

  deleteRecitation(id: string): void {
    this.recitations.update((a) => a.filter((r) => r.id !== id));
    this.save();
  }

  deleteEvaluation(id: string): void {
    this.evaluations.update((a) => a.filter((e) => e.id !== id));
    this.save();
  }

  // ---------- بيانات تجريبية ----------
  private seed(): void {
    const c1 = 'c_nafi';
    const c2 = 'c_asim';

    this.circles.set([
      { id: c1, name: 'حلقة الإمام نافع', session: 'يوميًا بعد صلاة المغرب', createdAt: Date.now() },
      {
        id: c2,
        name: 'حلقة الإمام عاصم',
        session: 'السبت والاثنين والأربعاء — بعد العصر',
        createdAt: Date.now(),
      },
    ]);

    const students: Student[] = [
      {
        id: 's_abdullah',
        name: 'عبدالله محمد الأحمد',
        circleId: c1,
        level: 'الصف السادس',
        guardianPhone: '0501234567',
        currentPlan: 'حفظ جزء عمّ مع إتقان التجويد',
        active: true,
        createdAt: Date.now(),
      },
      {
        id: 's_yousef',
        name: 'يوسف خالد العتيبي',
        circleId: c1,
        level: 'الصف الخامس',
        guardianPhone: '0553219876',
        currentPlan: 'حفظ سورة الملك ثم سورة القلم',
        active: true,
        createdAt: Date.now(),
      },
      {
        id: 's_ibrahim',
        name: 'إبراهيم سعد القحطاني',
        circleId: c1,
        level: 'الصف السابع',
        guardianPhone: '0544567890',
        currentPlan: 'مراجعة جزء تبارك + حفظ جزء قد سمع',
        active: true,
        createdAt: Date.now(),
      },
      {
        id: 's_omar',
        name: 'عمر فهد الدوسري',
        circleId: c2,
        level: 'أول متوسط',
        guardianPhone: '0509988776',
        currentPlan: 'حفظ الأجزاء 28 و29 و30',
        active: true,
        createdAt: Date.now(),
      },
      {
        id: 's_salman',
        name: 'سلمان ناصر الحربي',
        circleId: c2,
        level: 'الصف السادس',
        guardianPhone: '0566554433',
        currentPlan: 'حفظ جزء عمّ',
        active: true,
        createdAt: Date.now(),
      },
      {
        id: 's_mohammed',
        name: 'محمد عبدالعزيز المطيري',
        circleId: c2,
        level: 'ثاني متوسط',
        guardianPhone: '0577001122',
        currentPlan: 'مراجعة النصف الأول من القرآن',
        active: false,
        createdAt: Date.now(),
      },
    ];
    this.students.set(students);

    this.attendance.set([
      a('s_abdullah', c1, d(0), 'present'),
      a('s_yousef', c1, d(0), 'late'),
      a('s_ibrahim', c1, d(0), 'present'),
      a('s_abdullah', c1, d(-1), 'present'),
      a('s_yousef', c1, d(-1), 'absent'),
      a('s_ibrahim', c1, d(-1), 'present'),
      a('s_abdullah', c1, d(-3), 'present'),
      a('s_yousef', c1, d(-3), 'present'),
      a('s_omar', c2, d(-1), 'present'),
      a('s_salman', c2, d(-1), 'excused'),
      a('s_omar', c2, d(-3), 'present'),
      a('s_salman', c2, d(-3), 'present'),
    ]);

    this.recitations.set([
      r('s_abdullah', c1, d(0), 'new', 78, 1, 78, 30, 1, 'excellent', 0, 1, 0, 'حفظ متقن وأداء جيد للمدود'),
      r('s_abdullah', c1, d(-1), 'near_review', 99, 1, 99, 8, 0.5, 'very_good', 1, 0, 1, ''),
      r('s_ibrahim', c1, d(0), 'far_review', 67, 1, 67, 30, 2, 'good', 2, 3, 2, 'يحتاج تقوية الربع الأخير'),
      r('s_yousef', c1, d(-1), 'new', 67, 1, 67, 12, 1, 'very_good', 0, 1, 0, ''),
      r('s_omar', c2, d(-1), 'new', 78, 1, 78, 40, 1.5, 'excellent', 0, 0, 0, 'ما شاء الله، إتقان تام'),
      r('s_salman', c2, d(-3), 'new', 93, 1, 93, 11, 1, 'good', 1, 2, 1, ''),
    ]);

    this.evaluations.set([
      e('s_abdullah', c1, d(0), 'excellent', 'very_good', 'excellent', 'excellent', 'excellent', 'طالب مثالي، حريص ومنضبط'),
      e('s_ibrahim', c1, d(0), 'good', 'good', 'very_good', 'fair', 'good', 'يحتاج إلى مزيد من التركيز أثناء الحلقة'),
      e('s_omar', c2, d(-1), 'excellent', 'excellent', 'very_good', 'excellent', 'excellent', ''),
    ]);
  }
}

function a(
  studentId: string,
  circleId: string,
  date: string,
  status: AttendanceRecord['status'],
): AttendanceRecord {
  return { id: `${studentId}_${date}`, studentId, circleId, date, status, createdAt: Date.now() };
}

let seq = 0;
const nextId = (p: string) => `${p}_seed_${++seq}`;

function r(
  studentId: string,
  circleId: string,
  date: string,
  kind: RecitationRecord['kind'],
  fromSurah: number,
  fromAyah: number,
  toSurah: number,
  toAyah: number,
  pages: number,
  grade: RecitationRecord['grade'],
  tajweedErrors: number,
  hifzErrors: number,
  promptCount: number,
  notes: string,
): RecitationRecord {
  return {
    id: nextId('r'),
    studentId,
    circleId,
    date,
    kind,
    fromSurah,
    fromAyah,
    toSurah,
    toAyah,
    pages,
    grade,
    tajweedErrors,
    hifzErrors,
    promptCount,
    notes,
    createdAt: Date.now(),
  };
}

function e(
  studentId: string,
  circleId: string,
  date: string,
  memorization: EvaluationRecord['memorization'],
  review: EvaluationRecord['review'],
  tajweed: EvaluationRecord['tajweed'],
  attention: EvaluationRecord['attention'],
  behavior: EvaluationRecord['behavior'],
  notes: string,
): EvaluationRecord {
  return {
    id: nextId('e'),
    studentId,
    circleId,
    date,
    memorization,
    review,
    tajweed,
    attention,
    behavior,
    notes,
    createdAt: Date.now(),
  };
}
