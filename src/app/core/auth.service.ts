import { Injectable, signal, computed } from '@angular/core';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { auth, db } from './firebase';
import { TEACHERS, type Teacher } from './models';

const PREVIEW_KEY = 'assid-center:preview:teacher';

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

  /** وضع المعاينة: بلا Firebase، ودخول تلقائي بمعلّم تجريبي */
  readonly preview = environment.preview;

  constructor() {
    if (this.preview) {
      this.restorePreviewTeacher();
      this.ready.set(true);
      this.resolveReady();
      return;
    }
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

  async login(email: string, password: string): Promise<void> {
    if (this.preview) {
      const name = email.trim() ? email.trim().split('@')[0] : 'معلّم المعاينة';
      const t: Teacher = {
        id: 'preview-teacher',
        name,
        email: email.trim() || 'preview@assid.center',
        phone: '',
        createdAt: Date.now(),
      };
      this.setPreviewTeacher(t);
      return;
    }
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await this.loadOrCreateTeacher(cred.user);
  }

  async logout(): Promise<void> {
    if (this.preview) {
      this.user.set(null);
      this.teacher.set(null);
      try {
        localStorage.removeItem(PREVIEW_KEY);
      } catch {
        /* لا شيء */
      }
      return;
    }
    await signOut(auth);
    this.teacher.set(null);
  }

  private setPreviewTeacher(t: Teacher): void {
    this.user.set({ uid: t.id, displayName: t.name, email: t.email } as User);
    this.teacher.set(t);
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(t));
    } catch {
      /* لا شيء */
    }
  }

  private restorePreviewTeacher(): void {
    let t: Teacher = {
      id: 'preview-teacher',
      name: 'معلّم المعاينة',
      email: 'preview@assid.center',
      phone: '',
      createdAt: Date.now(),
    };
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      if (raw) t = JSON.parse(raw) as Teacher;
    } catch {
      /* استخدم الافتراضي */
    }
    this.user.set({ uid: t.id, displayName: t.name, email: t.email } as User);
    this.teacher.set(t);
  }

  /** يقرأ ملف المعلّم، وينشئه تلقائيًا عند أول دخول إن لم يكن موجودًا */
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
    if (this.preview) {
      this.setPreviewTeacher(next);
      return;
    }
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
