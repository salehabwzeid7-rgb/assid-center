/**
 * رفع رقم إصدار تطبيق «مركز أسيد» في مكان واحد:
 *   • package.json            → version
 *   • android/app/build.gradle → versionName (نفس الرقم) + versionCode (+1)
 *
 * الاستخدام:
 *   node scripts/bump-version.mjs patch     1.2.0 → 1.2.1   (افتراضيّ)
 *   node scripts/bump-version.mjs minor     1.2.0 → 1.3.0
 *   node scripts/bump-version.mjs major     1.2.0 → 2.0.0
 *   node scripts/bump-version.mjs 1.5.2      تعيين رقم صريح
 *
 * يطبع الرقم الجديد على stdout (لتستعمله سكربتات النشر).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkgPath = resolve(root, 'package.json');
const gradlePath = resolve(root, 'android/app/build.gradle');

const arg = (process.argv[2] || 'patch').trim();

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = String(pkg.version).split('.').map(Number);

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else if (arg === 'major') {
  next = `${maj + 1}.0.0`;
} else if (arg === 'minor') {
  next = `${maj}.${min + 1}.0`;
} else if (arg === 'patch') {
  next = `${maj}.${min}.${pat + 1}`;
} else {
  console.error(`وسيط غير معروف: «${arg}» — استخدم patch | minor | major | X.Y.Z`);
  process.exit(1);
}

// ---- package.json ----
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ---- android/app/build.gradle ----
let gradle = readFileSync(gradlePath, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
if (!codeMatch) {
  console.error('لم يُعثر على versionCode في build.gradle');
  process.exit(1);
}
const nextCode = Number(codeMatch[1]) + 1;
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${next}"`);
writeFileSync(gradlePath, gradle);

console.error(`↑ الإصدار: ${pkg.version}  (versionCode ${nextCode})`);
// الرقم فقط على stdout ليُلتقط بسهولة
console.log(next);
