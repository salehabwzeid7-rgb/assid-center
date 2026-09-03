/**
 * إصدار نسخة جديدة من «مركز أسيد» ودفعها إلى GitHub.
 *
 *   node scripts/release.mjs [patch|minor|major|X.Y.Z] [--push] [--no-verify]
 *
 * الخطوات:
 *   1. رفع رقم الإصدار (package.json + android/app/build.gradle)  ← scripts/bump-version.mjs
 *   2. تنسيق الشيفرة + بناء الويب للإنتاج (تحقّق سريع أنّ كلّ شيء يترجم)
 *   3. مزامنة Capacitor مع مجلّد android
 *   4. commit + وسم Git «vX.Y.Z»
 *   5. مع --push: دفع الفرع والوسم إلى origin → يُشغّل ذلك workflow «إصدار APK»
 *      في GitHub Actions فيُبنى الـ APK ويُرفَع إلى «Releases» تلقائيًّا.
 *
 * بلا remote مضبوط، يقف السكربت عند الخطوة ٤ ويطبع تعليمات الربط.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const level = args.find((a) => !a.startsWith('--')) || 'patch';
const doPush = args.includes('--push');
const noVerify = args.includes('--no-verify');

// على ويندوز، npm/npx ملفّات .cmd وتحتاج shell؛ أمّا git/node فملفّات تنفيذيّة
// تُستدعى مباشرةً (بلا shell) وإلا أعاد cmd.exe تفسير الأقواس والنقطتين في الوسائط.
const needsShell = (cmd) =>
  process.platform === 'win32' && ['npm', 'npx', 'yarn', 'pnpm'].includes(cmd);
const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: needsShell(cmd),
    ...opts,
  });
const out = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: needsShell(cmd),
  }).trim();

// تأكيد أنّ شجرة العمل نظيفة (عدا ما سنغيّره)
const dirty = out('git', ['status', '--porcelain']);
if (dirty) {
  console.error('⚠️  هناك تغييرات غير مُلتزَمة. التزمها أو تراجع عنها قبل الإصدار:\n' + dirty);
  process.exit(1);
}

console.error('\n▶ ١) رفع رقم الإصدار…');
const version = out('node', ['scripts/bump-version.mjs', level]);
const tag = `v${version}`;

console.error('\n▶ ٢) تنسيق + بناء الإنتاج…');
run('npm', ['run', 'format']);
run('npm', ['run', 'build:prod']);

console.error('\n▶ ٣) مزامنة Capacitor…');
run('npx', ['cap', 'sync', 'android']);

console.error('\n▶ ٤) commit + وسم…');
run('git', ['add', '-A']);
run('git', ['commit', ...(noVerify ? ['--no-verify'] : []), '-m', `chore(release): ${tag}`]);
run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);

const hasRemote = out('git', ['remote']).length > 0;
if (doPush && hasRemote) {
  console.error('\n▶ ٥) دفع إلى origin (يُشغّل بناء APK ونشر إصدار على GitHub)…');
  const branch = out('git', ['branch', '--show-current']);
  run('git', ['push', 'origin', branch]);
  run('git', ['push', 'origin', tag]);

  // نشر APK محدَّث على Firebase Hosting (رابط التحميل المباشر assid-center.web.app/download)
  console.error('\n▶ ٦) بناء APK ونشره على Firebase Hosting…');
  try {
    run('node', ['scripts/publish-apk.mjs', 'debug']);
  } catch {
    console.error(
      'تعذّر نشر Firebase Hosting (تحقّق من JDK 21 / Android SDK / firebase login). ' +
        'الإصدار على GitHub Releases غير متأثّر.',
    );
  }

  console.error(`\n✅ تمّ الإصدار ${tag}:`);
  console.error('   • GitHub Releases: يُبنى الآن — راجِع تبويب Actions ثمّ صفحة Releases.');
  console.error('   • رابط مباشر (فوريّ):  https://assid-center.web.app/download');
} else {
  console.error(`\n✅ أُنشئ الالتزام والوسم ${tag} محليًّا.`);
  console.error(
    hasRemote
      ? 'ℹ️  أضِف --push للدفع تلقائيًّا، أو نفّذ:  git push origin HEAD --follow-tags'
      : 'ℹ️  لا يوجد remote — اربط المستودع أوّلًا (راجِع DEPLOY.md).',
  );
}
