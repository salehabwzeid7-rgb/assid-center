/**
 * تشغيل Firebase Emulator Suite (مصادقة + Firestore) لالماهر.
 *
 *   node scripts/emulators.mjs
 *
 * - يجد JDK تلقائيًا (المحاكي يتطلب Java). يمكن تجاوزه بـ JAVA_HOME.
 * - يستخدم المشروع الوهمي demo-assid-center (لا يحتاج تسجيل دخول لـ Firebase).
 * - يحفظ البيانات في .emulator-data ويستوردها عند الإقلاع.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// ---- JDK ----
const adoptiumDir = 'C:/Program Files/Eclipse Adoptium';
const adoptiumJdks = existsSync(adoptiumDir)
  ? readdirSync(adoptiumDir)
      .filter((d) => /^jdk-(17|21|25)/.test(d))
      .map((d) => join(adoptiumDir, d))
      .sort()
      .reverse()
  : [];
const javaCandidates = [
  process.env.JAVA_HOME,
  ...adoptiumJdks,
  'C:/Program Files/Android/Android Studio/jbr',
  'C:/Program Files/Android/Android Studio1/jbr',
  '/usr/lib/jvm/default-java',
].filter(Boolean);
const javaHome = javaCandidates.find(
  (p) => existsSync(join(p, 'bin', 'java.exe')) || existsSync(join(p, 'bin', 'java')),
);

if (!javaHome) {
  console.error('لم يُعثر على JDK. المحاكي يتطلب Java. ثبّت JDK 21 وعيّن JAVA_HOME.');
  process.exit(1);
}

const dataDir = join(root, '.emulator-data');
mkdirSync(dataDir, { recursive: true });

const env = { ...process.env, JAVA_HOME: javaHome, PATH: `${join(javaHome, 'bin')};${process.env.PATH}` };

console.log('JAVA_HOME =', javaHome);
console.log('تشغيل محاكيات Firebase (auth:9099, firestore:8080, UI:4000)…\n');

const firebaseBin = join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const res = spawnSync(
  process.execPath,
  [
    firebaseBin,
    'emulators:start',
    '--project',
    'demo-assid-center',
    '--only',
    'auth,firestore',
    '--import',
    dataDir,
    '--export-on-exit',
    dataDir,
  ],
  { cwd: root, env, stdio: 'inherit' },
);

process.exit(res.status ?? 0);
