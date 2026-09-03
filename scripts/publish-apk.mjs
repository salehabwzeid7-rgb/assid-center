/**
 * بناء APK ونشره على Firebase Hosting كرابط تحميل مباشر:
 *   https://assid-center.web.app/download   (يفتح فيثبّت مباشرةً على أندرويد)
 *
 *   node scripts/publish-apk.mjs [debug|release]     (افتراضيّ debug)
 *
 * الخطوات:
 *   1. npm run apk:<mode>  → يبني APK محليًّا (يحتاج JDK 21 + Android SDK) وينسخه إلى apk/
 *   2. نسخ أحدث ناتج إلى public-apk/app.bin
 *      (بامتداد .bin لأنّ خطّة Spark تمنع رفع ملفّات .apk — الترويسات في firebase.json
 *       تجعل المتصفّح يحفظه AssidCenter-Teacher.apk ويثبّته أندرويد بشكل صحيح.)
 *   3. firebase deploy --only hosting
 */
import { readdirSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mode = (process.argv[2] || 'debug').toLowerCase();
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

console.error(`▶ بناء APK (${mode})…`);
run('npm', ['run', `apk:${mode}`]);

const apkDir = join(root, 'apk');
const latest = readdirSync(apkDir)
  .filter((f) => f.endsWith('.apk') && f.includes(mode))
  .map((f) => ({ f, t: statSync(join(apkDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!latest) {
  console.error('لم يُعثر على ملفّ APK في apk/');
  process.exit(1);
}
const target = join(root, 'public-apk', 'app.bin');
copyFileSync(join(apkDir, latest.f), target);
console.error(`✔ نُسِخ ${latest.f} → public-apk/app.bin`);

console.error('▶ نشر Firebase Hosting…');
run('npx', ['firebase', 'deploy', '--only', 'hosting', '--project', 'assid-center']);

console.error('\n✅ رابط التحميل المباشر:  https://assid-center.web.app/download');
console.error('   صفحة التحميل:          https://assid-center.web.app');
