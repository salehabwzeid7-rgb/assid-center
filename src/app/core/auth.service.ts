import { Injectable, signal, computed } from '@angular/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { TEACHERS, type Teacher } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** المستخدم الحالي من Firebase Auth (أو null) */
  readonly user = signal<User | null>(null);
  /** ملف المعلّم من Firestore */
  readonly teacher = signal<Teacher | null>(null);
  /** هل انتهى فحص حالة الدخول الأولي؟ */
  readonly ready = signal(false);

  private resolveReady!: () => void;
  /** وعد يُحَل بعد اكتمال فحص حالة الدخول الأولي (يُستخدم في الحُرّاس) */
  readonly readyPromise = new Promise<void>((res) => (this.resolveReady = res));

  readonly isLoggedIn = computed(() => !!this.user());
  readonly displayName = computed(
    () => this.teacher()?.name || this.user()?.displayName || this.user()?.email || 'المعلّم',
  );

  constructor() {
    onAuthStateChanged(auth, async (u) => {
      this.user.set(u);
      if (u) {
        await this.loadOrCreateTeacher(u);
      } else {
        this.teacher.set(null);
      }
      this.ready.set(true);
      this.resolveReady();
    });
  }

  /**
   * يحوّل المُدخَل إلى بريد صالح لـ Firebase.
   * يقبل بريدًا كاملًا، أو اسمًا بسيطًا (حروف/أرقام) فيُلحق به نطاقًا افتراضيًا
   * حتى يسهل الدخول والتجربة محليًا بلا قيود صارمة.
   */
  identifierToEmail(id: string): string {
    const v = id.trim();
    if (!v) return v;
    if (v.includes('@')) return v.toLowerCase();
    return `${v.replace(/\s+/g, '').toLowerCase()}@assid.local`;
  }

  /** تسجيل الدخول ببريد/اسم وكلمة مرور */
  async login(identifier: string, password: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(auth, this.identifierToEmail(identifier), password);
    await this.loadOrCreateTeacher(cred.user);
  }

  /** إنشاء حساب معلّم جديد من الصفر */
  async register(name: string, identifier: string, password: string): Promise<void> {
    const email = this.identifierToEmail(identifier);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name.trim() });
    const fresh: Omit<Teacher, 'id'> = {
      name: name.trim(),
      email: cred.user.email ?? email,
      phone: '',
      createdAt: Date.now(),
    };
    await setDoc(doc(db, TEACHERS, cred.user.uid), fresh);
    this.teacher.set({ id: cred.user.uid, ...fresh });
  }

  /** إرسال رابط إعادة تعيين كلمة المرور */
  async resetPassword(identifier: string): Promise<void> {
    await sendPasswordResetEmail(auth, this.identifierToEmail(identifier));
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.teacher.set(null);
  }

  /** يقرأ ملف المعلّم، وينشئه تلقائيًا إن لم يكن موجودًا */
  private async loadOrCreateTeacher(u: User): Promise<void> {
    const ref = doc(db, TEACHERS, u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      this.teacher.set({ id: u.uid, ...(snap.data() as Omit<Teacher, 'id'>) });
      return;
    }
    const fresh: Omit<Teacher, 'id'> = {
      name: u.displayName || (u.email ? u.email.split('@')[0] : 'معلّم جديد'),
      email: u.email ?? '',
      phone: u.phoneNumber ?? '',
      createdAt: Date.now(),
    };
    await setDoc(ref, fresh);
    this.teacher.set({ id: u.uid, ...fresh });
  }

  /** تحديث اسم/جوال المعلّم */
  async updateTeacher(patch: Partial<Pick<Teacher, 'name' | 'phone'>>): Promise<void> {
    const u = this.user();
    const current = this.teacher();
    if (!u || !current) return;
    const next: Teacher = { ...current, ...patch };
    await setDoc(doc(db, TEACHERS, u.uid), {
      name: next.name,
      email: next.email,
      phone: next.phone ?? '',
      createdAt: next.createdAt,
    });
    if (patch.name && patch.name !== u.displayName) {
      await updateProfile(u, { displayName: patch.name });
    }
    this.teacher.set(next);
  }
}
