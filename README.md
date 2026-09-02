# مركز أسيد لتحفيظ القرآن الكريم — واجهة المعلّم

تطبيق جوّال (Android / APK) لمعلّمي **مركز أسيد** لتسجيل متابعة الطلاب:
**مقدار الحفظ وما سُمِع**، و**الحضور**، و**التقييم اليومي** — بمزامنة لحظية عبر
Firebase ودعم العمل دون اتصال.

---

## التقنيات

| الطبقة | التقنية |
| --- | --- |
| الواجهة | Angular 22 (Standalone + Signals، بلا Zone.js) |
| اللغة | عربية بالكامل مع تخطيط RTL |
| الخلفية | Firebase — Authentication (Email/Password) + Cloud Firestore |
| التطوير المحلي | Firebase Emulator Suite (مصادقة + Firestore حقيقيان على الجهاز) |
| التغليف كتطبيق Android | Capacitor 8 |

---

## المتطلبات

- Node.js 20+ و npm
- **JDK 21** — لبناء APK وتشغيل المحاكي (Gradle 8.14 لا يدعم JDK 25 المرفق مع Android Studio):
  ```
  winget install EclipseAdoptium.Temurin.21.JDK
  ```
- Android SDK (مع Android Studio) لبناء APK فقط.

`firebase-tools` و `concurrently` مثبّتان محليًا ضمن المشروع (لا حاجة لتثبيت عام).

---

## التشغيل والتطوير (بلا إعداد سحابي)

```
npm install
npm run dev
```

`npm run dev` يشغّل **بأمر واحد**:
- محاكيات Firebase المحلية (مصادقة `:9099`، Firestore `:8080`، واجهة `:4000`)
- خادم Angular على <http://localhost:4200>

كل شيء حقيقي: أنشئ حسابًا من شاشة **«حساب جديد»**، ثم أنشئ حلقات وطلابًا وسجّل
التسميع والحضور والتقييم. البيانات تُحفَظ في `./.emulator-data` وتُستعاد عند إعادة
التشغيل. لا توجد أي بيانات وهمية.

> لتشغيل الواجهة فقط بلا محاكي: `npm start` (لن تعمل المصادقة/الحفظ حتى يعمل المحاكي
> أو يُضبط مشروع Firebase حقيقي).

---

## الربط بمشروع Firebase حقيقي (للإنتاج / APK)

1. أنشئ مشروعًا في <https://console.firebase.google.com>.
2. فعّل **Authentication → Email/Password**، وأنشئ قاعدة **Cloud Firestore**.
3. من **إعدادات المشروع → تطبيقاتك → تطبيق ويب**، انسخ الإعداد إلى
   `src/environments/environment.prod.ts` (كائن `firebase`)، وابقِ `useEmulator: false`.
4. اضبط اسم المشروع في `.firebaserc` ثم انشر القواعد:
   ```
   npx firebase login
   npm run firebase:rules
   ```

قواعد `firestore.rules`: كل معلّم يصل إلى شجرته فقط تحت `teachers/{uid}/…`.
لا حاجة لفهارس مركّبة (استعلامات بحقل واحد + ترتيب داخل التطبيق).

للتطوير على مشروع سحابي بدل المحاكي: اجعل `useEmulator: false` في
`src/environments/environment.ts` واملأ قيم `firebase` فيه.

---

## السمات (المظهر)

سمتان قابلتان للتبديل من **حساب المعلّم ← المظهر**، أو بزر 🎨 في ترويسة اللوحة:

- **الأساسية**: أخضر قرآني + ذهبي + خلفية هادئة.
- **سمة الشعار**: مستوحاة من شعار المركز — ترويسة القوس الذهبي بأشعّة،
  وشريط أخضر، وأرضية عاجية.

كلتاهما تدعمان الوضعين الفاتح والداكن، ويُحفَظ الاختيار محليًا.

---

## بناء ملف APK

```
npm run apk:debug      # يبني ويُخرج إلى apk/AssidCenter-Teacher-debug-<التاريخ>.apk
npm run apk:release    # نسخة غير موقّعة للنشر
npm run android:open   # فتح المشروع في Android Studio
```

`scripts/build-apk.mjs` يجد JDK 21 و Android SDK تلقائيًا (أو عبر `JAVA_HOME` /
`ANDROID_SDK_ROOT`). التثبيت على جهاز: `adb install -r <ملف APK>`.

> بناء APK يستخدم `environment.prod.ts` (`useEmulator: false`) — أي أنه يتطلب
> إعدادات Firebase حقيقية لتعمل المصادقة والحفظ على الجهاز.

---

## هيكل المشروع

```
src/app/
  core/
    firebase.ts        تهيئة Firebase + ربط المحاكي عند useEmulator
    theme.service.ts   إدارة السمة والتبديل بينها
    models.ts          نماذج البيانات ومسمّيات الحقول العربية
    quran-data.ts      أسماء سور القرآن الـ114 وعدد آياتها
    auth.service.ts    الدخول / إنشاء حساب / إعادة تعيين كلمة المرور / ملف المعلّم
    auth.guard.ts      حماية المسارات
    data.service.ts    قراءة/كتابة الحلقات والطلاب والحضور والتسميع والتقييم
  shared/
    page-header.ts     الشريط العلوي الموحّد
    grade-picker.ts    منتقي التقدير (ممتاز → ضعيف)
  pages/
    login/ dashboard/ profile/ circle-form/ circle/
    attendance/ student-form/ student/ recitation-form/ evaluation-form/
```

### نموذج البيانات في Firestore
```
teachers/{uid}                  { name, email, phone, createdAt }
  circles/{id}                  { name, session, createdAt }
  students/{id}                 { name, circleId, level, birthDate,
                                  guardianPhone, phone, currentPlan, active }
  attendance/{studentId_date}   { studentId, circleId, date, status }
  recitations/{id}              { studentId, circleId, date, kind, fromSurah,
                                  fromAyah, toSurah, toAyah, pages, grade,
                                  hifzErrors, tajweedErrors, promptCount, notes }
  evaluations/{id}              { studentId, circleId, date, memorization,
                                  review, tajweed, attention, behavior, notes }
```

---

## الميزات

- **حساب المعلّم**: إنشاء حساب من الصفر، تسجيل دخول، إعادة تعيين كلمة المرور، تعديل الاسم/الجوال.
- **لوحة المعلّم**: عدد الحلقات والطلاب، وحضور/تسميع اليوم.
- **الحلقات والطلاب**: إنشاء حلقات، وإضافة/تعديل طلاب بأرقام أولياء الأمور.
- **التحضير الجماعي**: حالة كل طالب (حاضر/متأخر/مأذون/غائب) لتاريخ محدّد + «تعيين الكل حاضر».
- **تسجيل التسميع**: النوع، من/إلى سورة وآية، عدد الأوجه، التقدير، أخطاء الحفظ والتجويد، مرات التلقين، ملاحظات.
- **التقييم اليومي**: الحفظ، المراجعة، التجويد، الانتباه، السلوك + ملاحظة.
- **ملف الطالب**: إحصائيات مجمّعة وسجل كامل بكل تبويب.
- **مزامنة لحظية** و**عمل دون اتصال** مع مزامنة تلقائية عند عودة الشبكة.
- **سمتان للواجهة** قابلتان للتبديل الفوري.
