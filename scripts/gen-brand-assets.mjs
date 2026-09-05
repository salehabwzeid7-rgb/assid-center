/**
 * يولّد كلّ أصول الهويّة البصريّة (أيقونة أندرويد + شاشة البدء + الفافيكون) من
 * ملفّ الشعار الحقيقيّ public/almaher-logo.jpg — بلا أيّ رسم أو تعديل لمحتوى
 * الصورة نفسها، فقط قصّ/تحجيم عبر Canvas (Puppeteer + Chrome المحلّي).
 *
 *   node scripts/gen-brand-assets.mjs
 *
 * يكتب (كلّ كثافة mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi):
 *   android/app/src/main/res/mipmap-<كثافة>/ic_launcher.png            (تقليديّة مربّعة)
 *   android/app/src/main/res/mipmap-<كثافة>/ic_launcher_round.png      (تقليديّة دائريّة، حواف شفّافة)
 *   android/app/src/main/res/mipmap-<كثافة>/ic_launcher_foreground.png (متكيّفة API26+، منطقة آمنة 66٪)
 *   android/app/src/main/res/values/ic_launcher_background.xml         (لون الخلفيّة = أخضر الشارة نفسه)
 *   android/app/src/main/res/drawable(-اتّجاه-كثافة)/splash.png        (شاشة البدء، بأبعادها الحاليّة كما هي)
 *   public/favicon.ico                                                 (16/32/48، PNG داخل حاوية ICO)
 *
 * BBOX أدناه: حدود مربّع الشارة الأخضر داخل الصورة التسويقيّة الأصليّة
 * (1408×768) — كُشفت أوّلًا بفحص سطوع البكسلات (أغمق من عتبة = جزء من
 * الشارة لا الخلفيّة الفاتحة المحيطة)، ثمّ أُدخل عليها هامش إضافيّ للداخل
 * حتى لا يظهر أيّ بكسل من خلفيّة الصورة الفاتحة عند الزوايا المستديرة للشارة
 * (تقاطع صندوق القصّ المربّع مع الحواف المستديرة يترك مثلّثات فاتحة صغيرة
 * في الزوايا لو كان القصّ مماسًّا تمامًا لحدّ الشارة). عدِّل BBOX يدويًّا إن
 * استُبدل ملفّ almaher-logo.jpg بشعار آخر مختلف الأبعاد/التخطيط.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const SRC = resolve(root, 'public/almaher-logo.jpg');
const RES = resolve(root, 'android/app/src/main/res');
const FAVICON = resolve(root, 'public/favicon.ico');

const BBOX = { x: 461, y: 138, w: 946 - 461, h: 628 - 138 };

const LEGACY_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SAFE_ZONE = 0.66; // نسبة المحتوى داخل قناع الأيقونة المتكيّفة (توصية أندرويد)
const FAVICON_SIZES = [16, 32, 48];

const SPLASH_BG = '#0f6b3f'; // = capacitor.config.ts backgroundColor
const SPLASH_LOGO_FRACTION = 0.34; // نسبة قطر الشارة إلى أقصر ضلع في الشاشة
const SPLASH_TARGETS = [
  ['drawable/splash.png', 480, 320],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
];

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  try {
    return execFileSync('where', ['chrome']).toString().split(/\r?\n/)[0].trim();
  } catch {
    throw new Error('تعذّر إيجاد Chrome — عدّل findChrome() في هذا السكربت.');
  }
}

if (!existsSync(SRC)) {
  console.error(`لم يُعثر على ${SRC} — ضع ملفّ الشعار هناك أوّلًا.`);
  process.exit(1);
}

const dataUri = 'data:image/jpeg;base64,' + readFileSync(SRC).toString('base64');
const b = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setContent(`<img id="i" src="${dataUri}">`);
await p.waitForSelector('#i');

// ---------- أيقونة أندرويد (تقليديّة + دائريّة + متكيّفة) ----------
const icons = await p.evaluate(
  ({ bbox, legacySizes, adaptiveSizes, safeZone }) => {
    const img = document.getElementById('i');
    const MASTER = 512;
    const master = document.createElement('canvas');
    master.width = MASTER;
    master.height = MASTER;
    const mctx = master.getContext('2d');
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, MASTER, MASTER);

    const sample = mctx.getImageData(
      Math.round(MASTER * 0.08),
      Math.round(MASTER * 0.86),
      1,
      1,
    ).data;
    const toHex = (n) => n.toString(16).padStart(2, '0');
    const bgHex = `#${toHex(sample[0])}${toHex(sample[1])}${toHex(sample[2])}`.toUpperCase();

    const out = { bgHex, legacy: {}, round: {}, adaptive: {} };
    for (const [dpi, size] of Object.entries(legacySizes)) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(master, 0, 0, size, size);
      out.legacy[dpi] = c.toDataURL('image/png');
    }
    for (const [dpi, size] of Object.entries(legacySizes)) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(master, 0, 0, size, size);
      ctx.restore();
      out.round[dpi] = c.toDataURL('image/png');
    }
    for (const [dpi, size] of Object.entries(adaptiveSizes)) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const contentSize = Math.round(size * safeZone);
      const offset = Math.round((size - contentSize) / 2);
      ctx.drawImage(master, offset, offset, contentSize, contentSize);
      out.adaptive[dpi] = c.toDataURL('image/png');
    }
    return out;
  },
  { bbox: BBOX, legacySizes: LEGACY_SIZES, adaptiveSizes: ADAPTIVE_SIZES, safeZone: SAFE_ZONE },
);

const savePng = (dataUrl, path) =>
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
for (const dpi of Object.keys(LEGACY_SIZES)) {
  savePng(icons.legacy[dpi], `${RES}/mipmap-${dpi}/ic_launcher.png`);
  savePng(icons.round[dpi], `${RES}/mipmap-${dpi}/ic_launcher_round.png`);
  savePng(icons.adaptive[dpi], `${RES}/mipmap-${dpi}/ic_launcher_foreground.png`);
}
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${icons.bgHex}</color>\n</resources>\n`,
);
console.error(
  `✔ أيقونات أندرويد (${Object.keys(LEGACY_SIZES).length * 3} ملفًّا) + لون الخلفيّة ${icons.bgHex}`,
);

// ---------- شاشة البدء (splash) ----------
const splashPngs = await p.evaluate(
  ({ bbox, bg, targets, fraction }) => {
    const img = document.getElementById('i');
    const master = document.createElement('canvas');
    master.width = 512;
    master.height = 512;
    const mctx = master.getContext('2d');
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, 512, 512);
    return targets.map(([name, w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const logoSize = Math.round(Math.min(w, h) * fraction);
      const lx = Math.round((w - logoSize) / 2);
      const ly = Math.round((h - logoSize) / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(master, lx, ly, logoSize, logoSize);
      return [name, c.toDataURL('image/png').split(',')[1]];
    });
  },
  { bbox: BBOX, bg: SPLASH_BG, targets: SPLASH_TARGETS, fraction: SPLASH_LOGO_FRACTION },
);
for (const [name, b64] of splashPngs) writeFileSync(`${RES}/${name}`, Buffer.from(b64, 'base64'));
console.error(`✔ شاشة البدء (${splashPngs.length} ملفًّا)`);

// ---------- الفافيكون (favicon.ico) ----------
const faviconPngsB64 = await p.evaluate(
  ({ bbox, sizes }) => {
    const img = document.getElementById('i');
    const master = document.createElement('canvas');
    master.width = 256;
    master.height = 256;
    const mctx = master.getContext('2d');
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, 256, 256);
    return sizes.map((s) => {
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(master, 0, 0, s, s);
      return c.toDataURL('image/png').split(',')[1];
    });
  },
  { bbox: BBOX, sizes: FAVICON_SIZES },
);
await b.close();

const pngs = faviconPngsB64.map((b64) => Buffer.from(b64, 'base64'));
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);
let offset = 6 + count * 16;
const dirEntries = [];
for (let i = 0; i < count; i++) {
  const size = FAVICON_SIZES[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngs[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  dirEntries.push(entry);
}
writeFileSync(FAVICON, Buffer.concat([header, ...dirEntries, ...pngs]));
console.error(`✔ favicon.ico (${FAVICON_SIZES.join('/')}px)`);

console.error('\nتذكير: نفّذ npx cap sync android ثمّ أعِد بناء الـ APK لتضمين الأيقونة الجديدة.');
