# النشر والتحديث التلقائيّ — «مركز أسيد»

هذا الملف يشرح الإعداد **لمرّة واحدة**، ثمّ سير العمل المتكرّر لإصدار نسخة APK جديدة تلقائيًّا عبر GitHub.

---

## ١) ربط المستودع بـ GitHub (مرّة واحدة)

المشروع مستودع Git محلّيّ بلا `remote`. اربطه:

```bash
# باستخدام GitHub CLI (الأسهل):
gh repo create assid-center --private --source=. --remote=origin --push

# أو يدويًّا:
#   أنشئ مستودعًا فارغًا على github.com باسم assid-center، ثمّ:
git remote add origin https://github.com/<USERNAME>/assid-center.git
git push -u origin master
git push origin --tags
```

بعدها تعمل سير العمل تلقائيًّا في تبويب **Actions**.

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
5. دفع الوسم يُشغّل workflow **«إصدار APK»** على GitHub:
   - يبني الويب، يزامن Capacitor، يبني `assembleDebug`.
   - يرفع `AssidCenter-Teacher-vX.Y.Z.apk` إلى صفحة **Releases** مع ملاحظات تلقائيّة.

> الـ APK الناتج **موقّع بمفتاح debug** — قابل للتثبيت مباشرةً على الأجهزة (تفعيل «تثبيت من مصادر غير معروفة»). لا يصلح لرفعه على Google Play.

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
