# النشر والتحديث التلقائيّ — «مركز أسيد»

هذا الملف يشرح سير العمل لإصدار نسخة APK جديدة تلقائيًّا عبر GitHub.

- **رابط التحميل المباشر (للمشاركة في واتساب):** `https://assid-center.web.app/download`
  — يفتح فيُنزّل الـ APK فورًا (بلا صفحة)، ويثبّته أندرويد مباشرةً. صفحة تحميل بزرّ: `https://assid-center.web.app`
- **المستودع:** https://github.com/salehabwzeid7-rgb/assid-center (عام)
- **أرشيف النسخ:** https://github.com/salehabwzeid7-rgb/assid-center/releases

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
   `AssidCenter-Teacher-vX.Y.Z.apk` إلى صفحة **Releases** (أرشيف).
6. محليًّا: يبني `scripts/publish-apk.mjs` نسخة APK وينشرها على **Firebase Hosting** →
   يتحدّث رابط `https://assid-center.web.app/download` فورًا (هذا الرابط للمشاركة).

> الـ APK **موقّع بمفتاح debug** — يُثبَّت مباشرةً بعد تفعيل «تثبيت من مصادر غير معروفة». لا يصلح لمتجر Play.

### تحديث الرابط المباشر وحده (بلا إصدار جديد)

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
