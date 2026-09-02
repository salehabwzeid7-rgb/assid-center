/**
 * حذف الكاش ومخرجات البناء المؤقتة — مركز أسيد.
 *   npm run clean
 * لا يمسّ الكود المصدري ولا node_modules ولا مشروع android نفسه.
 */
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const targets = ['.angular', 'dist', 'android/app/build', 'android/build'];

let freed = 0;
for (const t of targets) {
  const p = resolve(root, t);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log('🗑️  حُذف:', t);
    freed++;
  }
}
console.log(freed ? `\n✅ تم تنظيف ${freed} مجلدًا.` : 'لا شيء لحذفه — نظيف بالفعل.');
