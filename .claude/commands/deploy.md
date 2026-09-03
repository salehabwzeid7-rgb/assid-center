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
3. إن لم يوجد `git remote origin` بعد: نفّذ خطوات الربط في [DEPLOY.md](../../DEPLOY.md)
   أوّلًا (أو اطلب من المستخدم ربط المستودع)، ثمّ أعِد المحاولة.
4. بعد الدفع: اذكر رقم الإصدار الجديد ورابطَي صفحتَي Actions وReleases في المستودع.

ملاحظات:
- لا تُصدر إلا بعد اكتمال التغييرات المطلوبة والتحقّق منها.
- إن فشل `build:prod` أو `format` فأصلح السبب ولا تُكمل الإصدار.
- لتجاوز خطاطيف الالتزام عند الحاجة فقط: `npm run release -- $1 --push --no-verify`.
