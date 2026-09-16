import { Injectable, signal, computed } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

  async logout(): Promise<void> {
    // على أندرويد: إنهاء أيّ جلسة Google أصليّة متبقّية من إصدار سابق كان يدعم
    // الدخول بحساب Google (الميزة أُزيلت، لكن أجهزة قديمة قد لا تزال تحمل جلسة
    // من الإضافة الأصليّة) — محاولة صامتة، لا تُوقف إنهاء جلسة SDK الويب أدناه.
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
   * الملفّ المُنشَأ حديثًا يحصل على مساحة معزولة.
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

  /**
   * تحديث بيانات المعلّم (الاسم/الجوال/رسائل تقرير الجلسة) — تحديث جزئيّ
   * (`updateDoc`) للحقول المُمرَّرة فقط، لا استبدال كامل للمستند. الاستبدال
   * الكامل السابق كان يعتمد على النسخة المحليّة المخزَّنة (`this.teacher()`)
   * كأساس، فلو عُدِّل المستند من جهاز آخر خلال نفس الجلسة، كان يُكتَب فوقه
   * ويُلغى تعديل الجهاز الآخر بصمت رغم أنّ هذا الجهاز لم يمسّ تلك الحقول.
   */
  async updateTeacher(
    patch: Partial<Pick<Teacher, 'name' | 'phone' | 'reportIntro' | 'reportOutro'>>,
  ): Promise<void> {
    const u = this.user();
    const current = this.teacher();
    if (!u || !current) return;
    const fields: Record<string, unknown> = {};
    if (patch.name !== undefined) fields['name'] = patch.name;
    if (patch.phone !== undefined) fields['phone'] = patch.phone;
    if (patch.reportIntro !== undefined) fields['reportIntro'] = patch.reportIntro;
    if (patch.reportOutro !== undefined) fields['reportOutro'] = patch.reportOutro;
    if (Object.keys(fields).length > 0) {
      await updateDoc(doc(db, TEACHERS, u.uid), fields);
    }
    if (patch.name && patch.name !== u.displayName) {
      await updateProfile(u, { displayName: patch.name });
    }
    this.teacher.set({ ...current, ...patch });
  }
}
