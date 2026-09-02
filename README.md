# مركز أَصيد لتحفيظ القرآن الكريم — واجهة المعلّم

تطبيق جوّال (Android / APK) مخصّص لمعلّمي مركز أَصيد لتسجيل متابعة الطلاب:
**مقدار الحفظ وما سُمِع**، و**الحضور**، و**التقييم اليومي** — مع مزامنة لحظية عبر
Firebase ودعم العمل دون اتصال.

> هذه **الخطوة الثانية** من المشروع، وتركّز حصريًا على **واجهة المعلّم**.

---

## التقنيات

| الطبقة | التقنية |
| --- | --- |
| الواجهة | Angular 22 (Standalone + Signals، بلا Zone.js) |
| اللغة | عربية بالكامل مع تخطيط RTL |
| الخلفية وقاعدة البيانات | Firebase — Authentication + Cloud Firestore (مزامنة لحظية + تخزين محلي دائم) |
| التغليف كتطبيق Android | Capacitor 8 |

---

## المتطلبات

- Node.js 20+ و npm
- **JDK 21** لبناء APK (Gradle 8.14 لا يدعم JDK 25 المرفق حديثًا مع Android Studio):
  ```
  winget install EclipseAdoptium.Temurin.21.JDK
  ```
- Android SDK (مع Android Studio): `platform-tools` و `platforms;android-36` و `build-tools`
- (اختياري) Firebase CLI لنشر قواعد الأمان: `npm i -g firebase-tools`

---

## الإعداد الأول

### 1) تثبيت الحزم
```
npm install
```

### 2) تهيئة مشروع Firebase
1. أنشئ مشروعًا في <https://console.firebase.google.com> (اسم مقترح: `assid-center`).
2. فعّل **Authentication → Sign-in method → Email/Password**.
3. أنشئ قاعدة **Cloud Firestore** (وضع الإنتاج).
4. من **إعدادات المشروع → تطبيقاتك → إضافة تطبيق ويب**، وانسخ كائن الإعداد.
5. ضع القيم في الملفَّين `src/environments/environment.ts` و `src/environments/environment.prod.ts`:
   ```ts
   firebase: {
     apiKey: '...',
     authDomain: 'assid-center.firebaseapp.com',
     projectId: 'assid-center',
     storageBucket: 'assid-center.appspot.com',
     messagingSenderId: '...',
     appId: '...',
   }
   ```

### 3) نشر قواعد الأمان
```
firebase login
firebase use assid-center
firebase deploy --only firestore:rules
```
القواعد في `firestore.rules`: كل معلّم يصل إلى شجرته فقط تحت `teachers/{uid}/…`.
لا حاجة لفهارس مركّبة (كل الاستعلامات بحقل مساواة واحد + ترتيب داخل التطبيق).

### 4) إنشاء حساب معلّم
من Firebase Console → Authentication → **Add user** (بريد + كلمة مرور).
عند أول دخول يُنشئ التطبيق تلقائيًا ملف المعلّم في Firestore.

---

## المعاينة قبل إعداد Firebase (وضع المعاينة)

```
npm start        →  http://localhost:4200
```

يبدأ التطبيق في **وضع المعاينة** (`environment.preview = true`): دخول تلقائي بمعلّم
تجريبي، وبيانات واقعية (حلقتان وستة طلاب وسجلات حضور/تسميع/تقييم) مخزّنة محليًا في
`localStorage` بلا أي اتصال بـ Firebase. كل الإضافة/التعديل يعمل ويُحفَظ محليًا.

- شريط علوي بلون ذهبي يوضّح أنك في وضع المعاينة، وفيه زر **«إعادة الضبط»** لاسترجاع
  البيانات الأصلية.
- شاشة الدخول تقبل أي بريد/كلمة مرور.

بعد إدخال إعدادات Firebase، غيّر `preview` إلى `false` في
`src/environments/environment.ts` (و`environment.prod.ts`) ليعمل التطبيق على Firebase
فعليًا. **بناء APK للإنتاج يستخدم `preview = false` أصلًا.**

---

## بناء ملف APK

### الطريقة السريعة
```
npm run apk:debug
```
ينفّذ: بناء Angular للإنتاج ← `cap sync` ← `gradlew assembleDebug`، ثم ينسخ الناتج إلى:
```
apk/AssidCenter-Teacher-debug-<التاريخ>.apk
```
السكربت `scripts/build-apk.mjs` يجد JDK 21 و Android SDK تلقائيًا، ويمكن تجاوزهما عبر
`JAVA_HOME` و `ANDROID_SDK_ROOT`.

### عبر Android Studio
```
npm run android:open
```
ثم: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

### نسخة موقّعة للنشر
```
npm run apk:release
```
تُنتج APK غير موقّع؛ وقّعه بمفتاحك عبر `apksigner` أو `signingConfig` في
`android/app/build.gradle`.

### التثبيت على الجهاز
```
adb install -r apk/AssidCenter-Teacher-debug-<التاريخ>.apk
```

---

## هيكل المشروع

```
src/app/
  core/
    firebase.ts        تهيئة Firebase (Auth + Firestore + كاش دائم)
    models.ts          نماذج البيانات ومسمّيات الحقول العربية
    quran-data.ts      أسماء سور القرآن الـ114 وعدد آياتها
    auth.service.ts    تسجيل الدخول وملف المعلّم
    auth.guard.ts      حماية المسارات
    data.service.ts    قراءة/كتابة الحلقات والطلاب والحضور والتسميع والتقييم
  shared/
    page-header.ts     الشريط العلوي الموحّد
    grade-picker.ts    منتقي التقدير (ممتاز → ضعيف)
  pages/
    login/             تسجيل دخول المعلّم
    dashboard/         لوحة المعلّم + إحصائيات اليوم
    profile/           بيانات المعلّم وتسجيل الخروج
    circle-form/       إضافة حلقة
    circle/            حلقة: قائمة الطلاب + تحضير اليوم
    attendance/        التحضير الجماعي لتاريخ محدّد
    student-form/      إضافة/تعديل طالب
    student/           ملف الطالب: نظرة عامة / التسميع / الحضور / التقييم
    recitation-form/   تسجيل جلسة تسميع
    evaluation-form/   تقييم يومي
```

### نموذج البيانات في Firestore
```
teachers/{uid}                  { name, email, phone, createdAt }
  circles/{id}                  { name, session, createdAt }
  students/{id}                 { name, circleId, level, birthDate,
                                  guardianPhone, phone, currentPlan, active }
  attendance/{studentId_date}   { studentId, circleId, date, status }
  recitations/{id}              { studentId, circleId, date, kind,
                                  fromSurah, fromAyah, toSurah, toAyah,
                                  pages, grade, hifzErrors, tajweedErrors,
                                  promptCount, notes }
  evaluations/{id}              { studentId, circleId, date, memorization,
                                  review, tajweed, attention, behavior, notes }
```

---

## الميزات

- **لوحة المعلّم**: عدد الحلقات والطلاب، وحضور/تسميع اليوم.
- **الحلقات والطلاب**: إنشاء حلقات، وإضافة طلاب ببياناتهم وأرقام أولياء الأمور.
- **التحضير الجماعي**: حالة كل طالب (حاضر/متأخر/مأذون/غائب) لتاريخ محدّد، وزر «تعيين الكل حاضر».
- **تسجيل التسميع**: النوع، ومن سورة/آية إلى سورة/آية، وعدد الأوجه، والتقدير،
  وأخطاء الحفظ والتجويد، ومرات التلقين، والملاحظات.
- **التقييم اليومي**: خمسة محاور (الحفظ، المراجعة، التجويد، الانتباه، السلوك) + ملاحظة.
- **ملف الطالب**: إحصائيات مجمّعة (جلسات، مجموع الأوجه، نسبة الحضور) وسجل كامل بكل تبويب.
- **مزامنة لحظية** بين أجهزة المعلّم، و**عمل دون اتصال** مع مزامنة تلقائية عند عودة الشبكة.
