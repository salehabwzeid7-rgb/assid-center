/**
 * بناء ملف APK لتطبيق "مركز أَصيد" (واجهة المعلّم).
 *
 * الاستخدام:
 *   node scripts/build-apk.mjs debug     → APK للتجربة (موقّع بمفتاح debug)
 *   node scripts/build-apk.mjs release    → APK غير موقّع (يحتاج توقيعًا لاحقًا)
 *
 * يبحث السكربت تلقائيًا عن JDK وSDK من Android Studio، ويمكن تجاوزهما عبر:
 *   JAVA_HOME , ANDROID_SDK_ROOT
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const androidDir = join(root, 'android');
const mode = (process.argv[2] || 'debug').toLowerCase();
if (!['debug', 'release'].includes(mode)) {
  console.error('النمط غير معروف. استخدم debug أو release.');
  process.exit(1);
}

// ---- تحديد JAVA_HOME ----
// نُفضّل JDK 17–21 (متوافق مع Gradle 8.14 / AGP 8.13). JBR الحديث في Android Studio
// أصبح JDK 25 وهو غير مدعوم من Gradle 8.14، لذا نبحث عن Temurin/OpenJDK أولًا.
const adoptiumDir = 'C:/Program Files/Eclipse Adoptium';
const adoptiumJdks = existsSync(adoptiumDir)
  ? readdirSync(adoptiumDir)
      .filter((d) => /^jdk-(17|21)/.test(d))
      .map((d) => join(adoptiumDir, d))
      .sort()
      .reverse()
  : [];
const javaCandidates = [
  process.env.JAVA_HOME,
  ...adoptiumJdks,
  'C:/Program Files/Microsoft/jdk-21',
  'C:/Program Files/Java/jdk-21',
  'C:/Program Files/Android/Android Studio/jbr',
  'C:/Program Files/Android/Android Studio1/jbr',
].filter(Boolean);
const javaHome = javaCandidates.find(
  (p) => existsSync(join(p, 'bin', 'java.exe')) || existsSync(join(p, 'bin', 'java')),
);
if (!javaHome) {
  console.error('لم يُعثر على JDK. ثبّت JDK 21 ثم عيّن المتغيّر JAVA_HOME يدويًا.');
  console.error('  مثال: winget install EclipseAdoptium.Temurin.21.JDK');
  process.exit(1);
}

// ---- تحديد ANDROID_SDK_ROOT ----
const sdkCandidates = [
  process.env.ANDROID_SDK_ROOT,
  process.env.ANDROID_HOME,
  join(process.env.LOCALAPPDATA || 'C:/Users/Default/AppData/Local', 'Android/Sdk'),
  'C:/Program Files/Android/Sdk',
].filter(Boolean);
const sdkRoot = sdkCandidates.find((p) => existsSync(p));
if (!sdkRoot) {
  console.error('لم يُعثر على Android SDK. عيّن المتغيّر ANDROID_SDK_ROOT يدويًا.');
  process.exit(1);
}

console.log('JAVA_HOME        =', javaHome);
console.log('ANDROID_SDK_ROOT =', sdkRoot);
console.log('النمط            =', mode);
console.log('---------------------------------------------');

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_SDK_ROOT: sdkRoot,
  ANDROID_HOME: sdkRoot,
};

const task = mode === 'release' ? ':app:assembleRelease' : ':app:assembleDebug';

// نُشغّل Gradle Wrapper عبر java مباشرةً (نفس ما يفعله gradlew داخليًا)
// لتفادي مشاكل تشغيل ملفات .bat من Node على ويندوز.
const javaExe = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const wrapperJar = join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');

const res = spawnSync(
  javaExe,
  [
    '-Dorg.gradle.appname=gradlew',
    '-classpath',
    wrapperJar,
    'org.gradle.wrapper.GradleWrapperMain',
    task,
    '--no-daemon',
  ],
  { cwd: androidDir, env, stdio: 'inherit' },
);

if (res.status !== 0) {
  console.error('\nفشل بناء Gradle (رمز الخروج ' + res.status + ').');
  process.exit(res.status ?? 1);
}

// ---- نسخ الناتج ----
const outDir = join(androidDir, 'app', 'build', 'outputs', 'apk', mode);
if (!existsSync(outDir)) {
  console.error('لم يُنتَج ملف APK في:', outDir);
  process.exit(1);
}
const apk = readdirSync(outDir).find((f) => f.endsWith('.apk'));
if (!apk) {
  console.error('لا يوجد ملف .apk داخل', outDir);
  process.exit(1);
}

const distDir = join(root, 'apk');
mkdirSync(distDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const target = join(distDir, `AlMaher-Teacher-${mode}-${stamp}.apk`);
copyFileSync(join(outDir, apk), target);

console.log('---------------------------------------------');
console.log('✅ تم إنشاء ملف APK:');
console.log('   ', target);
console.log('   (النسخة الأصلية:', join(outDir, apk), ')');
