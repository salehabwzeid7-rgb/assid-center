# مركز أسيد — واجهة المعلّم

تطبيق Angular 22 (zoneless · signals · ‎`@if`/`@for`‎) + Firebase 12 (Firestore + Auth) + Capacitor 8 (Android).
لتحفيظ القرآن: حلقات، طلاب، جلسات (حصص)، تسميع، تقييم، وسرد (مراجعة الأجزاء المحفوظة).

## قواعد أساسيّة

- **كلّ نصوص الواجهة والردود بالعربية** (RTL). المُعرّفات والشيفرة بالإنجليزية.
- **لا Tailwind** — نظام رموز CSS يدويّ في `src/styles.css` (خلفيتان: `misk` = «خلفية رقم واحد»، `zumurrud` = «خلفية رقم اثنين»، عبر `data-app-theme`).
- التقييم **بالنسبة المئويّة ٠..١٠٠** (لا تقديرات نصّيّة). عتبات: السرد/التقييم ٩٠٪، التسميع ٩٥٪ (`SARD_PASS`/`TASMIE_PASS` في `core/models.ts`).
- `Student.circleIds: string[]` (تسجيل متعدّد الحلقات) — استعمل `studentCircleIds()`. `Circle.tajweedLevel` لحلقات التجويد.
- Firestore **مسطّح ومشترك** (لا عزل لكلّ معلّم). لا حذف للطلاب في الواجهة (فقط `setStudentActive`).

## أوامر

| الأمر | الغرض |
|---|---|
| `npm start` | خادم تطوير على `localhost:4200` |
| `npm run dev` | خادم + محاكيات Firebase |
| `npm run build:prod` | بناء إنتاج (تحقّق سريع) |
| `npm run format` / `format:check` | Prettier |
| `npm run apk:debug` | بناء APK محليًّا (يحتاج JDK 21 + Android SDK) |
| `npm run version:bump -- minor` | رفع الرقم في `package.json` + `android/app/build.gradle` |
| `npm run release -- patch --push` | إصدار كامل: رفع رقم → بناء → commit → tag → push |

## سير الإصدار والتحديث التلقائيّ

- **المستودع:** https://github.com/salehabwzeid7-rgb/assid-center (عام · `origin` · فرع `master`).
- **رابط تحميل APK المباشر (للمشاركة):** `https://assid-center.web.app/download` (Firebase Hosting، الملفّ `public-apk/app.bin` بامتداد `.bin` لأنّ خطّة Spark تمنع رفع `.apk`؛ ترويسات `firebase.json` تجعله يُنزَّل ويُثبَّت كـ APK).

1. بعد اكتمال التغييرات والتحقّق منها، شغّل: `/deploy [patch|minor|major]` (أو `npm run release -- <level> --push`).
2. `scripts/release.mjs`: رفع الرقم → تنسيق → بناء → `commit` + `tag vX.Y.Z` → دفع → ثمّ `publish-apk.mjs` (بناء APK محليًّا + `firebase deploy --only hosting`).
3. دفع الوسم يُشغّل `.github/workflows/release.yml` → APK إلى **GitHub Releases** (أرشيف).
4. كلّ دفع إلى `master` يُشغّل `.github/workflows/ci.yml` (فحص تنسيق + بناء).
5. تحديث الرابط المباشر وحده: `npm run publish:apk`. توقيع رسميّ: [DEPLOY.md](DEPLOY.md).

## اختبار E2E

سكربتات Puppeteer في مجلّد scratchpad للجلسة. افرض `prefers-color-scheme: light` لسمة misk. حساب تجربة: `card2_1788423026732@assid.local` / `123456` (البيانات الحقيقيّة: حلقة «زيد الشاويش»).
