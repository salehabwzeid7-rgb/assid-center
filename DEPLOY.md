# النشر والتحديث التلقائيّ — «الماهر»

هذا الملف يشرح سير العمل لإصدار نسخة APK جديدة تلقائيًّا عبر GitHub.

- **رابط التحميل المباشر (للمشاركة في واتساب):** `https://assid-center.web.app/download`
  — يفتح فيُنزّل الـ APK فورًا (بلا صفحة)، ويثبّته أندرويد مباشرةً. صفحة تحميل بزرّ: `https://assid-center.web.app`
- **المستودع:** https://github.com/salehabwzeid7-rgb/assid-center (عام)
- **أرشيف النسخ:** https://github.com/salehabwzeid7-rgb/assid-center/releases

> **تحديث مباشر (OTA):** بعد تثبيت نسخة **1.2.2 أو أحدث** مرّة واحدة، تصل تعديلات الواجهة
> والمنطق إلى التطبيق المُثبَّت **تلقائيًّا** — يفحص التطبيق `‎/ota/latest.json‎` عند كلّ فتح،
> ينزّل الحزمة الجديدة في الخلفيّة، ويُفعّلها في الفتحة التالية. **لا حاجة لإعادة تنزيل APK**
> إلّا عند تغييرات الطبقة الأصليّة (إضافة Capacitor جديدة، إذن جديد، رفع `versionCode`).

---

## ١) الربط بـ GitHub — تمّ ✅

المستودع مربوط بـ `origin` والفرع الافتراضيّ `master`. لا حاجة لإعادة هذه الخطوة.

---

## ٢) سير الإصدار المتكرّر

بعد أيّ تغييرات في الشيفرة:

```bash
npm run release -- patch --push      # 1.2.0 → 1.2.1
npm run release -- minor --push      # 1.2.0 → 1.3.0
npm run release -- major --push      # 1.2.0 → 2.0.0
```

أو من Claude Code: `‎/deploy patch‎`.

ما يحدث:

1. **رفع الرقم** في `package.json` و`android/app/build.gradle` (versionName + versionCode + 1).
2. **تنسيق + بناء إنتاج** للتحقّق أنّ كلّ شيء يترجم.
3. **مزامنة Capacitor** مع مجلّد `android`.
4. **commit + وسم** `vX.Y.Z` ثمّ **دفع** الفرع والوسم.
5. دفع الوسم يُشغّل workflow **«إصدار APK»** على GitHub → يبني `assembleDebug` ويرفع
   `AlMaher-Teacher-vX.Y.Z.apk` إلى صفحة **Releases** (أرشيف).
6. محليًّا: يبني `scripts/publish-ota.mjs` **حزمة تحديث مباشر (OTA)** وينشرها على Firebase Hosting
   → تصل الأجهزة المُثبَّتة تلقائيًّا عند فتح التطبيق.
7. محليًّا: يبني `scripts/publish-apk.mjs` نسخة APK وينشرها على **Firebase Hosting** →
   يتحدّث رابط `https://assid-center.web.app/download` فورًا (هذا الرابط للمشاركة والتثبيت الأوّل).

> الـ APK **موقّع بمفتاح debug** — يُثبَّت مباشرةً بعد تفعيل «تثبيت من مصادر غير معروفة». لا يصلح لمتجر Play.

### تحديث مباشر وحده — الأسرع لتعديلات الواجهة/المنطق (بلا إصدار ولا APK)

```bash
npm run publish:ota       # يبني الويب، يضغطه، وينشره → يصل الأجهزة المُثبَّتة تلقائيًّا
```

### تحديث رابط تنزيل الـ APK وحده (بلا إصدار جديد)

```bash
npm run publish:apk        # يبني APK debug وينشره على Firebase Hosting
```

---

## ٣) (اختياريّ) إصدار موقّع رسميًّا

لإنتاج APK موقّع بمفتاح إصدار ثابت (لازم لمتجر Play أو لتحديثات فوق نفس التطبيق):

1. أنشئ keystore مرّة واحدة:

   ```bash
   keytool -genkey -v -keystore assid-release.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias assid
   ```

2. حوّله إلى Base64 وأضِف أسرار المستودع (Settings → Secrets and variables → Actions):

   | السرّ | القيمة |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 assid-release.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المتجر |
   | `ANDROID_KEY_ALIAS` | `assid` |
   | `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح |

3. عند وجود هذه الأسرار، يبني الـ workflow `assembleRelease` موقّعًا تلقائيًّا بدل `assembleDebug`.

> احفظ ملفّ `assid-release.jks` في مكان آمن — فقدانه يمنع نشر تحديثات لاحقة فوق نفس التطبيق.

---

## ٤) بناء محلّيّ (بلا GitHub)

```bash
npm run apk:debug     # يحتاج JDK 21 + Android SDK — الناتج في مجلّد apk/
```

راجع `scripts/build-apk.mjs` لاكتشاف `JAVA_HOME` / `ANDROID_SDK_ROOT` تلقائيًّا.

---

## ٥) التحديث المباشر (OTA) — كيف يعمل

- الإضافة: `@capgo/capacitor-updater` (استضافة ذاتيّة على Firebase Hosting، بلا خدمة خارجيّة).
- `src/app/core/update.service.ts` يفحص `https://assid-center.web.app/ota/latest.json` عند
  إقلاع التطبيق وعند عودته للواجهة؛ إن اختلف رقم الإصدار نزّل `bundle-*.zip` وفعّله في الفتحة التالية.
- `npm run publish:ota` يبني `dist/assid-center/browser`، يضغط محتوياته، ويرفع الحزمة + `latest.json`.
- **يكفي الويب:** تعديلات Angular/HTML/CSS/منطق TS. **يحتاج APK جديدًا:** إضافة Capacitor جديدة،
  إذن أندرويد جديد، تغيير في `capacitor.config.ts` بخصوص الطبقة الأصليّة، رفع `versionCode`.
- عند تثبيت APK أحدث، تُمسح الحزم المُنزَّلة ويُعاد الاعتماد على حزمة الويب المدمجة (`resetWhenUpdate`).
