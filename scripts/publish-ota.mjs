/**
 * نشر تحديث مباشر (OTA) للتطبيق المُثبَّت — دون إعادة تنزيل APK.
 *
 *   node scripts/publish-ota.mjs
 *
 * الخطوات:
 *   1. بناء الويب للإنتاج (ng build --configuration production)
 *   2. ضغط محتويات dist/assid-center/browser إلى  public-apk/ota/bundle-<إصدار>.zip
 *   3. كتابة  public-apk/ota/latest.json  ={ version, url, checksum }
 *   4. firebase deploy --only hosting  → يصبح متاحًا على
 *        https://assid-center.web.app/ota/latest.json
 *
 * الأجهزة المُثبَّتة تفحص هذا الملفّ عند كلّ فتح للتطبيق، فتنزّل الحزمة الجديدة
 * وتُفعّلها في الفتحة التالية. تعديلات الطبقة الأصليّة وحدها تحتاج APK جديدًا.
 */
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import archiver from 'archiver';

const root = resolve(import.meta.dirname, '..');
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''); // YYYYMMDDHHmm
const version = `${pkg.version}+${stamp}`; // فريدة لكلّ نشر

console.error('▶ ١) بناء الويب للإنتاج…');
run('npm', ['run', 'build:prod']);

const webDir = join(root, 'dist', 'assid-center', 'browser');
const outDir = join(root, 'public-apk', 'ota');
mkdirSync(outDir, { recursive: true });
const zipName = `bundle-${version}.zip`;
const zipPath = join(outDir, zipName);

console.error(`▶ ٢) ضغط الحزمة → ${zipName}…`);
await new Promise((res, rej) => {
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', res);
  archive.on('error', rej);
  archive.pipe(output);
  archive.directory(webDir, false); // المحتويات في جذر الأرشيف (index.html بالأعلى)
  archive.finalize();
});

const buf = readFileSync(zipPath);
const checksum = createHash('sha256').update(buf).digest('hex');
const sizeMB = (buf.length / 1048576).toFixed(1);

const manifest = {
  version,
  url: `https://assid-center.web.app/ota/${zipName}`,
  checksum,
  releasedAt: new Date().toISOString(),
};
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.error(`✔ ${zipName} — ${sizeMB} MB — sha256 ${checksum.slice(0, 12)}…`);

console.error('▶ ٣) نشر Firebase Hosting…');
run('npx', ['firebase', 'deploy', '--only', 'hosting', '--project', 'assid-center']);

console.error(`\n✅ نُشِر التحديث المباشر ${version}`);
console.error('   ستستقبله الأجهزة المُثبَّتة تلقائيًّا عند فتح التطبيق (تُفعَّل الحزمة في الفتحة التالية).');
