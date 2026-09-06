import { Injectable, signal, computed } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  GoogleAuthProvider,
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

  /** مساحة العمل المعزولة لهذا الحساب (uid) — null للحسابات القديمة (مساحة مشتركة). */
  readonly tenantId = computed(() => this.teacher()?.tenantId ?? null);
  /** هل هذا الحساب في مساحة معزولة خاصّة به؟ */
  readonly isTenant = computed(() => !!this.teacher()?.tenantId);

  constructor() {
    // التقاط نتيجة دخول Google عبر إعادة التوجيه (المسار الاحتياطيّ للنافذة) — غير حاجب.
    getRedirectResult(auth).catch((e) => console.warn('getRedirectResult:', e));

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
    const cred = await signInWithEmailAndPassword(
      auth,
      this.identifierToEmail(identifier),
      password,
    );
    await this.loadOrCreateTeacher(cred.user);
  }

  /** إنشاء حساب معلّم جديد من الصفر — يحصل على مساحة عمل معزولة خاصّة به. */
  async register(name: string, identifier: string, password: string): Promise<void> {
    const email = this.identifierToEmail(identifier);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name.trim() });
    const fresh: Omit<Teacher, 'id'> = {
      name: name.trim(),
      email: cred.user.email ?? email,
      phone: '',
      tenantId: cred.user.uid,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, TEACHERS, cred.user.uid), fresh);
    this.teacher.set({ id: cred.user.uid, ...fresh });
  }

  /**
   * دخول عبر حساب Google — بديل لاسم المستخدم/كلمة المرور.
   *   • على أندرويد (Capacitor): تسجيل الدخول الأصليّ عبر
   *     `FirebaseAuthentication.signInWithGoogle()` ثمّ جسر البيان إلى SDK
   *     الويب بـ `signInWithCredential` حتى تعرف بقيّة الواجهة أنّه مسجَّل.
   *   • على الويب: `signInWithPopup`، ومع تعذّر النافذة يُلجَأ لإعادة التوجيه.
   * أوّل دخول ينشئ ملفّ معلّم جديدًا بمساحة عمل معزولة (عبر loadOrCreateTeacher).
   * لا يمسّ حالة أيّ حساب آخر.
   */
  async loginWithGoogle(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      const accessToken = result.credential?.accessToken;
      if (!idToken) {
        throw { code: 'auth/no-google-credential' };
      }
      const cred = GoogleAuthProvider.credential(idToken, accessToken);
      const userCred = await signInWithCredential(auth, cred);
      await this.loadOrCreateTeacher(userCred.user);
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const cred = await signInWithPopup(auth, provider);
      await this.loadOrCreateTeacher(cred.user);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  }

  /** إرسال رابط إعادة تعيين كلمة المرور */
  async resetPassword(identifier: string): Promise<void> {
    await sendPasswordResetEmail(auth, this.identifierToEmail(identifier));
  }

  async logout(): Promise<void> {
    // على أندرويد نُنهي الجلسة الأصليّة للإضافة أيضًا (بمحاولة صامتة) قبل جلسة الويب.
    if (Capacitor.isNativePlatform()) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      } catch {
        /* لا بأس — المهمّ إنهاء جلسة SDK الويب أدناه */
      }
    }
    await signOut(auth);
    this.teacher.set(null);
  }

  /**
   * يقرأ ملف المعلّم، وينشئه تلقائيًا إن لم يكن موجودًا.
   * الملفّ الموجود يُحمَّل كما هو (حساب قديم يبقى في المساحة المشتركة بلا مساس).
   * الملفّ المُنشَأ حديثًا (أوّل دخول Google مثلًا) يحصل على مساحة معزولة.
   */
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
      tenantId: u.uid,
      createdAt: Date.now(),
    };
    await setDoc(ref, fresh);
    this.teacher.set({ id: u.uid, ...fresh });
  }

  /** تحديث بيانات المعلّم (الاسم/الجوال/رسائل تقرير الجلسة) — يحفظ `tenantId` كما هو. */
  async updateTeacher(
    patch: Partial<Pick<Teacher, 'name' | 'phone' | 'reportIntro' | 'reportOutro'>>,
  ): Promise<void> {
    const u = this.user();
    const current = this.teacher();
    if (!u || !current) return;
    const next: Teacher = { ...current, ...patch };
    const doc_: Record<string, unknown> = {
      name: next.name,
      email: next.email,
      phone: next.phone ?? '',
      reportIntro: next.reportIntro ?? '',
      reportOutro: next.reportOutro ?? '',
      createdAt: next.createdAt,
    };
    if (next.tenantId) doc_['tenantId'] = next.tenantId;
    await setDoc(doc(db, TEACHERS, u.uid), doc_);
    if (patch.name && patch.name !== u.displayName) {
      await updateProfile(u, { displayName: patch.name });
    }
    this.teacher.set(next);
  }
}
