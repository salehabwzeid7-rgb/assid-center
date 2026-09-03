---
description: إصدار نسخة جديدة من «مركز أسيد» — رفع الرقم، بناء، وسم، ودفع لتشغيل بناء APK على GitHub
argument-hint: "[patch|minor|major|X.Y.Z]  (افتراضيّ patch)"
allowed-tools: Bash(npm run *), Bash(node scripts/*), Bash(git *), Bash(npx cap *), Read, Edit
---

نفّذ إصدارًا جديدًا للتطبيق. الردود بالعربية.

المستوى المطلوب: `$1` (إن لم يُذكر فاستخدم `patch`).

الخطوات:

1. تحقّق أنّ شجرة العمل نظيفة (`git status`). إن كانت متّسخة، أخبر المستخدم وتوقّف.
2. شغّل: `npm run release -- $1 --push`
   - يرفع الرقم في `package.json` و`android/app/build.gradle` (versionName + versionCode +1).
   - يُنسّق ويبني الإنتاج (`build:prod`) ويُزامن Capacitor — تحقّق سريع.
   - يعمل `git commit` + `git tag vX.Y.Z` ثمّ `git push` للفرع والوسم.
   - دفع الوسم يُشغّل workflow «إصدار APK» في GitHub Actions فيُبنى الـ APK
     ويُرفَع تلقائيًّا إلى صفحة Releases.
3. المستودع مربوط بالفعل: `origin` = https://github.com/salehabwzeid7-rgb/assid-center (عام).
4. بعد الدفع: راقِب `.github/workflows/release.yml` حتى ينتهي، ثمّ أعطِ المستخدم
   الرابط المباشر: `https://github.com/salehabwzeid7-rgb/assid-center/releases/download/vX.Y.Z/AssidCenter-Teacher-vX.Y.Z.apk`
   (ورابط أحدث نسخة الثابت `…/releases/latest`).

ملاحظات:
- لا تُصدر إلا بعد اكتمال التغييرات المطلوبة والتحقّق منها.
- إن فشل `build:prod` أو `format` فأصلح السبب ولا تُكمل الإصدار.
- لتجاوز خطاطيف الالتزام عند الحاجة فقط: `npm run release -- $1 --push --no-verify`.
