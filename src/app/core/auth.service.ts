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
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import { TEACHERS, PLATFORM_COL, OWNER_EMAIL, type Teacher } from './models';

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
  /** هل هذا الحساب هو حساب المالك (لوحة المراقبة، v1.26.0)؟ مطابقة بريد تامّة فقط. */
  readonly isOwnerAccount = computed(
    () => (this.user()?.email ?? '').toLowerCase() === OWNER_EMAIL,
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
    const deviceId = this.getOrCreateDeviceId();
    const platform = Capacitor.getPlatform();
    const fresh: Omit<Teacher, 'id'> = {
      name: name.trim(),
      email: cred.user.email ?? email,
      phone: '',
      tenantId: cred.user.uid,
      deviceId,
      platform,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, TEACHERS, cred.user.uid), fresh);
    this.teacher.set({ id: cred.user.uid, ...fresh });
    void this.recordNewPlatformTeacher(cred.user.uid, fresh.name, fresh.email, deviceId, platform);
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
      void this.touchPlatformTeacher(u.uid);
      return;
    }
    const deviceId = this.getOrCreateDeviceId();
    const platform = Capacitor.getPlatform();
    const fresh: Omit<Teacher, 'id'> = {
      name: u.displayName || (u.email ? u.email.split('@')[0] : 'معلّم جديد'),
      email: u.email ?? '',
      phone: u.phoneNumber ?? '',
      tenantId: u.uid,
      deviceId,
      platform,
      createdAt: Date.now(),
    };
    await setDoc(ref, fresh);
    this.teacher.set({ id: u.uid, ...fresh });
    void this.recordNewPlatformTeacher(u.uid, fresh.name, fresh.email, deviceId, platform);
  }

  /**
   * معرّف جهاز ثابت (UUID مُولَّد محليًّا مرّة واحدة، مخزَّن في localStorage) —
   * لأغراض لوحة المالك فقط (v1.26.0): عدّ الأجهزة الفريدة وربط الحسابات
   * المتعدّدة على نفس الجهاز. ليس معرّف جهاز حقيقيًّا على مستوى النظام (يُفقَد
   * لو مُسحت بيانات المتصفّح/التطبيق) — أقرب تقدير ممكن بلا Cloud Functions
   * ولا نشر على متجر يوفّر رقم تثبيت حقيقيًّا.
   */
  private getOrCreateDeviceId(): string {
    const KEY = 'almaher_device_id';
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return 'unknown-device';
    }
  }

  /** true فقط أوّل مرّة يُسجَّل فيها أيّ حساب من هذا الجهاز إطلاقًا (لعدّاد uniqueDevices). */
  private isFirstEverDeviceUse(): boolean {
    const KEY = 'almaher_device_counted';
    try {
      if (localStorage.getItem(KEY)) return false;
      localStorage.setItem(KEY, '1');
      return true;
    } catch {
      return false;
    }
  }

  /** يُسجَّل عند إنشاء حساب معلّم جديد (تسجيل أو أوّل دخول بلا ملفّ سابق) — يزيد عدّادات المنصّة. */
  private async recordNewPlatformTeacher(
    uid: string,
    name: string,
    email: string,
    deviceId: string,
    platform: string,
  ): Promise<void> {
    try {
      const isNewDevice = this.isFirstEverDeviceUse();
      await setDoc(doc(db, PLATFORM_COL.teachers, uid), {
        name,
        email,
        deviceId,
        platform,
        circleCount: 0,
        studentCount: 0,
        recitationCount: 0,
        memorizedCount: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
      await setDoc(
        doc(db, PLATFORM_COL.statsDoc),
        {
          totalTeachers: increment(1),
          ...(isNewDevice ? { uniqueDevices: increment(1) } : {}),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('تعذّر تسجيل حساب المعلّم الجديد للوحة المالك (غير حرج):', e);
    }
  }

  /** يُحدِّث آخر نشاط + الجهاز/المنصّة عند كل دخول عاديّ لحساب موجود مسبقًا. */
  private async touchPlatformTeacher(uid: string): Promise<void> {
    try {
      await setDoc(
        doc(db, PLATFORM_COL.teachers, uid),
        {
          deviceId: this.getOrCreateDeviceId(),
          platform: Capacitor.getPlatform(),
          lastActiveAt: Date.now(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('تعذّر تحديث آخر نشاط للوحة المالك (غير حرج):', e);
    }
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

  /**
   * يحوّل حسابًا قديمًا/مشتركًا إلى حساب معزول (tenant) دفعة واحدة — خطوة
   * أخيرة في DataService.upgradeLegacyAccountToTenant() (v1.25.5)، تُستدعى
   * فقط بعد ترحيل كل مستندات الحساب بنجاح (وسمها بـ ownerId=uid)؛ لو نُفِّذت
   * قبل ذلك ستظهر بيانات لم تُرحَّل بعد كأنّها غير موجودة. لا رجوع عنها من
   * داخل التطبيق — تُكتب مباشرة في ملفّ المعلّم وتُحدَّث الإشارة المحليّة فورًا
   * حتى يعمل scopeUid() الجديد في نفس الجلسة بلا حاجة لإعادة تحميل الصفحة.
   */
  async promoteToTenant(): Promise<void> {
    const u = this.user();
    const current = this.teacher();
    if (!u || !current) return;
    await updateDoc(doc(db, TEACHERS, u.uid), { tenantId: u.uid });
    this.teacher.set({ ...current, tenantId: u.uid });
  }
}
