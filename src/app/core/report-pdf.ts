/* ==========================================================================
   توليد ملفّ PDF **نصّيّ** — لا صورة.

   الفرق عمليًّا: النصّ قابل للتحديد والبحث والنسخ، والجداول خطوط متجهيّة تُطبع
   حادّة على الورق مهما كبر المقاس، وحجم الملفّ أصغر بمراتب. الصورة كانت
   تُنتج ملفًّا ثقيلًا يتشوّه عند الطباعة ولا يُبحَث فيه — لا يصلح سجلًّا ورقيًّا
   رسميًّا.

   العقبة التي تجعل هذا غير بديهيّ: العربيّة تحتاج **تشكيل الحروف** (صورة أوّليّة
   ووسطى ونهائيّة ومعزولة) و**ترتيبًا ثنائيّ الاتّجاه**. تُعالَج هنا هكذا:

     ١) `jsPDF.processArabic` مسجَّل على حدث `preProcessText`، فيحوّل كلّ نصّ
        إلى صور الحروف العربيّة (U+FE70–FEFF) تلقائيًّا قبل الرسم.
     ٢) لذلك **يجب** أن يحوي الخطّ تلك الكتلة. أكثر الخطوط الحديثة لا تحويها
        لأنّها تعتمد تشكيل OpenType. خطّ أميري يحويها كاملة (تُحقّق من ذلك
        بفحص جدول cmap)، ولذلك اختير — وهو خطّ نسخ مناسب للوثائق المطبوعة.
     ٣) الترتيب ثنائيّ الاتّجاه **مكتوب هنا يدويًّا** (`toVisual`)، ولا يُستعمَل
        `setR2L` إطلاقًا: فهو يعكس السلسلة كلّها عكسًا بسيطًا، فتنعكس معها
        الأرقام — «09/2026» تصير «6202/90». القاعدة الصحيحة أنّ مقاطع الأرقام
        واللاتينيّة تبقى بترتيبها الداخليّ، ويُعكَس ترتيب المقاطع وحدها.
     ٤) ومع ذلك تبقى وحدات القياس (٪) في ترويسة العمود لا في الخلايا — أنظف
        في جدول مطبوع، ويُبقي الخلايا أرقامًا خالصة.

   الخطّ يُجلَب من أصول التطبيق عند أوّل توليد ويُخبَّأ في الذاكرة: لا يدخل حزمة
   الجافاسكربت، ويبقى متاحًا دون اتّصال لأنّه مضمَّن في التطبيق.
   ========================================================================== */

import { dmy } from './format';

/* --------------------------------------------------------------------------
   نموذج المستند — مستقلّ عن نوع التقرير
   -------------------------------------------------------------------------- */

export type CellDir = 'rtl' | 'ltr';
export type CellAlign = 'start' | 'center' | 'end';

export interface PdfCell {
  text: string;
  /** الأرقام والتواريخ تُرسَم `ltr` حتى لا ينقلب ترتيبها. */
  dir?: CellDir;
  bold?: boolean;
  /** يُلوَّن بالأحمر — رسوب أو فجوة. */
  danger?: boolean;
  /** يُلوَّن بالأخضر الداكن — إجماليّ أو قيمة بارزة. */
  strong?: boolean;
}

export interface PdfColumn {
  header: string;
  /** وزن نسبيّ من عرض المحتوى (تُطبَّع الأوزان تلقائيًّا). */
  weight: number;
  align?: CellAlign;
  dir?: CellDir;
}

export type PdfSection =
  | { kind: 'stats'; items: { label: string; value: string }[] }
  | { kind: 'table'; title?: string; columns: PdfColumn[]; rows: PdfCell[][] }
  | { kind: 'note'; text: string; danger?: boolean }
  | { kind: 'heading'; text: string }
  | { kind: 'pageBreak' };

export interface PdfDoc {
  /** عنوان المستند — يظهر في الترويسة وفي خصائص الملفّ. */
  title: string;
  /** سطر ثانٍ: المدى الزمنيّ عادةً. */
  subtitle: string;
  teacher: string;
  sections: PdfSection[];
}

/* --------------------------------------------------------------------------
   الترتيب ثنائيّ الاتّجاه
   -------------------------------------------------------------------------- */

/** محارف تُعكَس صورتها عند عكس مقطع عربيّ (الأقواس ونحوها). */
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

/** عربيّ؟ يشمل الكتلة الأساسيّة وصور الحروف التي يُنتجها `processArabic`. */
function isRtlChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x0600 && c <= 0x06ff) ||
    (c >= 0x0750 && c <= 0x077f) ||
    (c >= 0xfb50 && c <= 0xfdff) ||
    (c >= 0xfe70 && c <= 0xfeff)
  );
}

/** رقم أو حرف لاتينيّ — مقطع يبقى بترتيبه الداخليّ. */
function isLtrChar(ch: string): boolean {
  return /[0-9A-Za-z]/.test(ch);
}

/**
 * يحوّل نصًّا بترتيبه المنطقيّ إلى ترتيبه **البصريّ** (من اليسار لليمين كما
 * يرسمه PDF)، مع إبقاء مقاطع الأرقام واللاتينيّة بترتيبها الداخليّ.
 *
 * هذا ما يفصل «شهر 09/2026» الصحيحة عن «6202/90 رهش» التي ينتجها العكس
 * البسيط. المحارف المحايدة (فراغ، شرطة، مائلة، نقطتان) تتبع المقطع السابق
 * لها، وهو تبسيط كافٍ لنصوص التقارير: كلمات عربيّة وأرقام وتواريخ.
 */
export function toVisual(text: string): string {
  if (!text) return '';
  const chars = [...text];

  // تصنيف كلّ محرف. المحايد (فراغ، مائلة، شرطة، نقطتان) **لا يلتحق بالمقطع
  // السابق دائمًا**: يتبع جارَيه. فإن كان بين رقمين انضمّ إليهما («09/2026»
  // مقطع واحد)، وإلّا عُدّ عربيًّا فبقي فاصلًا بين المقطعين («تقرير 3 طلّاب»
  // يحتفظ بفراغَيه). الالتحاق الأعمى بالسابق كان يبتلع الفراغ قبل الرقم
  // ويُخرِج «بالط3 ريرقت».
  const cls: ('rtl' | 'ltr' | 'n')[] = chars.map((ch) =>
    isRtlChar(ch) ? 'rtl' : isLtrChar(ch) ? 'ltr' : 'n',
  );
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] !== 'n') continue;
    let prev: 'rtl' | 'ltr' | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (cls[j] !== 'n') {
        prev = cls[j] as 'rtl' | 'ltr';
        break;
      }
    }
    let next: 'rtl' | 'ltr' | null = null;
    for (let j = i + 1; j < cls.length; j++) {
      if (cls[j] !== 'n') {
        next = cls[j] as 'rtl' | 'ltr';
        break;
      }
    }
    cls[i] = prev === 'ltr' && next === 'ltr' ? 'ltr' : 'rtl';
  }

  type Run = { rtl: boolean; chars: string[] };
  const runs: Run[] = [];
  chars.forEach((ch, i) => {
    const rtl = cls[i] === 'rtl';
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.chars.push(ch);
    else runs.push({ rtl, chars: [ch] });
  });

  // ترتيب المقاطع يُعكَس (النصّ عربيّ في مجمله)، ومحتوى المقطع العربيّ يُعكَس
  // ويُعكَس معه اتّجاه الأقواس؛ أمّا مقاطع الأرقام فتبقى كما هي تمامًا.
  return runs
    .reverse()
    .map((r) =>
      r.rtl
        ? r.chars
            .slice()
            .reverse()
            .map((ch) => MIRROR[ch] ?? ch)
            .join('')
        : r.chars.join(''),
    )
    .join('');
}

/* --------------------------------------------------------------------------
   قياسات الصفحة — بالنقاط (pt)، ١ بوصة = ٧٢ نقطة
   -------------------------------------------------------------------------- */

const PAGE = { w: 595.28, h: 841.89 }; // A4 عموديّ
const MARGIN = { top: 46, bottom: 52, x: 38 };
const CONTENT_W = PAGE.w - MARGIN.x * 2;

const GREEN = [13, 92, 63] as const;
const GREEN_SOFT = [238, 246, 241] as const;
const BORDER = [205, 220, 212] as const;
const TEXT = [34, 49, 43] as const;
const MUTED = [122, 139, 130] as const;
const DANGER = [179, 38, 30] as const;

const FS = {
  title: 16,
  subtitle: 10.5,
  meta: 9,
  sectionHead: 10.5,
  th: 8.5,
  td: 9,
  note: 8.5,
  foot: 8,
};
const ROW_H = 19;
const HEAD_H = 21;

/* --------------------------------------------------------------------------
   تحميل الخطّ — مرّة واحدة لكلّ جلسة
   -------------------------------------------------------------------------- */

const FONT_FILES = {
  normal: { file: 'Amiri-Regular.ttf', path: 'fonts/Amiri-Regular.ttf' },
  bold: { file: 'Amiri-Bold.ttf', path: 'fonts/Amiri-Bold.ttf' },
};
const FONT_NAME = 'Amiri';

let fontCache: { normal: string; bold: string } | null = null;

async function toBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تعذّر تحميل الخطّ (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // تحويل على دفعات — سلسلة واحدة بطول الملفّ كلّه تتجاوز حدّ معاملات الدالّة.
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function loadFonts(): Promise<{ normal: string; bold: string }> {
  if (fontCache) return fontCache;
  const [normal, bold] = await Promise.all([
    toBase64(FONT_FILES.normal.path),
    toBase64(FONT_FILES.bold.path),
  ]);
  fontCache = { normal, bold };
  return fontCache;
}

/* --------------------------------------------------------------------------
   الرسم
   -------------------------------------------------------------------------- */

/** حالة الرسم الجارية — تُمرَّر بين الدوالّ بدل متغيّرات عامّة. */
interface Ctx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  y: number;
  page: number;
  docTitle: string;
  docSubtitle: string;
}

function setFont(c: Ctx, bold: boolean, size: number): void {
  c.doc.setFont(FONT_NAME, bold ? 'bold' : 'normal');
  c.doc.setFontSize(size);
}

function setColor(c: Ctx, rgb: readonly number[]): void {
  c.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/**
 * يرسم نصًّا. `dir: 'ltr'` يُعطّل ترتيب R2L مؤقّتًا — لازم للأرقام والتواريخ،
 * وإلّا انقلب ترتيب مثل «18 / 20».
 */
function drawText(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  align: CellAlign,
  dir: CellDir,
): void {
  if (!text) return;
  const jsAlign = align === 'start' ? 'right' : align === 'end' ? 'left' : 'center';
  c.doc.text(prepare(c, text, dir), x, y, { align: jsAlign, baseline: 'middle' });
}

/**
 * يُحضّر النصّ للرسم: تشكيل الحروف العربيّة ثمّ ترتيبها بصريًّا.
 *
 * الترتيب مهمّ: التشكيل يعتمد على جار الحرف في الترتيب **المنطقيّ**، فلو عُكِس
 * النصّ قبله لاختار صورًا خاطئة. ولهذا يُشكَّل أوّلًا ثمّ يُعكَس.
 * (`processArabic` يُعاد استدعاؤه تلقائيًّا داخل `text()` لكنّه لا يمسّ صور
 * الحروف الناتجة، فلا ضرر.)
 */
function prepare(c: Ctx, text: string, dir: CellDir): string {
  if (dir === 'ltr') return text;
  return toVisual(c.doc.processArabic(text));
}

/** يقصّ النصّ بما يسع عرض الخليّة ويُلحق «…». */
function fit(c: Ctx, text: string, maxW: number, dir: CellDir = 'rtl'): string {
  if (!text) return '';
  // القياس يجري على الشكل النهائيّ — عرض الحروف المُشكَّلة يختلف عن الخام.
  if (c.doc.getTextWidth(prepare(c, text, dir)) <= maxW) return text;
  let s = text;
  while (s.length > 1 && c.doc.getTextWidth(prepare(c, s + '…', dir)) > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawPageFrame(c: Ctx, first: boolean): void {
  if (first) {
    // ترويسة كاملة: شريط أخضر بالعنوان والمدى والمعلّم.
    c.doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    c.doc.rect(0, 0, PAGE.w, 74, 'F');
    c.doc.setTextColor(255, 255, 255);
    setFont(c, true, FS.title);
    drawText(c, c.docTitle, PAGE.w / 2, 30, 'center', 'rtl');
    setFont(c, false, FS.subtitle);
    drawText(c, c.docSubtitle, PAGE.w / 2, 52, 'center', 'rtl');
    c.y = 74 + 22;
  } else {
    // ترويسة جارية مختصرة — تُبقي هويّة المستند على كلّ ورقة.
    setFont(c, false, FS.meta);
    setColor(c, MUTED);
    drawText(
      c,
      `${c.docTitle} — ${c.docSubtitle}`,
      PAGE.w - MARGIN.x,
      MARGIN.top - 14,
      'start',
      'rtl',
    );
    c.doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    c.doc.setLineWidth(0.5);
    c.doc.line(MARGIN.x, MARGIN.top - 6, PAGE.w - MARGIN.x, MARGIN.top - 6);
    c.y = MARGIN.top + 8;
  }
}

function newPage(c: Ctx): void {
  c.doc.addPage();
  c.page++;
  drawPageFrame(c, false);
}

function ensureSpace(c: Ctx, needed: number): void {
  if (c.y + needed > PAGE.h - MARGIN.bottom) newPage(c);
}

/* ---- الأقسام ---- */

function drawHeading(c: Ctx, text: string): void {
  ensureSpace(c, 34);
  c.y += 6;
  c.doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
  c.doc.rect(MARGIN.x, c.y, CONTENT_W, 20, 'F');
  c.doc.setTextColor(255, 255, 255);
  setFont(c, true, FS.sectionHead);
  drawText(c, text, PAGE.w - MARGIN.x - 10, c.y + 10, 'start', 'rtl');
  c.y += 20;
}

function drawStats(c: Ctx, items: { label: string; value: string }[]): void {
  if (items.length === 0) return;
  ensureSpace(c, 54);
  const gap = 8;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const h = 44;
  items.forEach((it, i) => {
    // من اليمين لليسار — ترتيب القراءة العربيّ.
    const x = PAGE.w - MARGIN.x - w - i * (w + gap);
    c.doc.setFillColor(GREEN_SOFT[0], GREEN_SOFT[1], GREEN_SOFT[2]);
    c.doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    c.doc.setLineWidth(0.6);
    c.doc.roundedRect(x, c.y, w, h, 4, 4, 'FD');
    setColor(c, GREEN);
    setFont(c, true, 13);
    drawText(c, it.value, x + w / 2, c.y + 17, 'center', 'ltr');
    setColor(c, MUTED);
    setFont(c, false, 8);
    drawText(c, it.label, x + w / 2, c.y + 33, 'center', 'rtl');
  });
  c.y += h + 10;
}

function drawNote(c: Ctx, text: string, danger?: boolean): void {
  setFont(c, false, FS.note);
  // يُشكَّل أوّلًا ليكون قياس العرض دقيقًا، ثمّ يُقسَّم، ثمّ يُعكَس كلّ سطر.
  const lines: string[] = c.doc.splitTextToSize(c.doc.processArabic(text), CONTENT_W - 20);
  const h = lines.length * 13 + 14;
  ensureSpace(c, h + 8);
  c.doc.setFillColor(danger ? 253 : 247, danger ? 243 : 249, danger ? 242 : 248);
  c.doc.setDrawColor(danger ? 240 : BORDER[0], danger ? 212 : BORDER[1], danger ? 209 : BORDER[2]);
  c.doc.setLineWidth(0.6);
  c.doc.roundedRect(MARGIN.x, c.y, CONTENT_W, h, 4, 4, 'FD');
  setColor(c, danger ? DANGER : MUTED);
  lines.forEach((ln, i) => {
    c.doc.text(toVisual(ln), PAGE.w - MARGIN.x - 10, c.y + 13 + i * 13, {
      align: 'right',
      baseline: 'middle',
    });
  });
  c.y += h + 8;
}

function columnBoxes(columns: PdfColumn[]): { x: number; w: number }[] {
  const total = columns.reduce((a, col) => a + col.weight, 0) || 1;
  const boxes: { x: number; w: number }[] = [];
  let right = PAGE.w - MARGIN.x;
  for (const col of columns) {
    const w = (col.weight / total) * CONTENT_W;
    boxes.push({ x: right - w, w });
    right -= w;
  }
  return boxes;
}

function drawTableHeader(c: Ctx, columns: PdfColumn[], boxes: { x: number; w: number }[]): void {
  c.doc.setFillColor(GREEN_SOFT[0], GREEN_SOFT[1], GREEN_SOFT[2]);
  c.doc.rect(MARGIN.x, c.y, CONTENT_W, HEAD_H, 'F');
  setColor(c, GREEN);
  setFont(c, true, FS.th);
  columns.forEach((col, i) => {
    const b = boxes[i];
    const align = col.align ?? 'center';
    const x = align === 'start' ? b.x + b.w - 6 : align === 'end' ? b.x + 6 : b.x + b.w / 2;
    const hDir = col.dir ?? 'rtl';
    drawText(c, fit(c, col.header, b.w - 10, hDir), x, c.y + HEAD_H / 2, align, hDir);
  });
  c.doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]);
  c.doc.setLineWidth(1);
  c.doc.line(MARGIN.x, c.y + HEAD_H, PAGE.w - MARGIN.x, c.y + HEAD_H);
  c.y += HEAD_H;
}

function drawTable(c: Ctx, columns: PdfColumn[], rows: PdfCell[][]): void {
  const boxes = columnBoxes(columns);
  ensureSpace(c, HEAD_H + ROW_H * 2);
  drawTableHeader(c, columns, boxes);
  const tableLeft = MARGIN.x;

  for (const row of rows) {
    if (c.y + ROW_H > PAGE.h - MARGIN.bottom) {
      newPage(c);
      // تُعاد ترويسة الجدول على كلّ ورقة — الجدول المقطوع بلا ترويسة غير مقروء.
      drawTableHeader(c, columns, boxes);
    }
    setFont(c, false, FS.td);
    columns.forEach((col, i) => {
      const cell = row[i] ?? { text: '' };
      const b = boxes[i];
      const align = col.align ?? 'center';
      setFont(c, !!cell.bold, FS.td);
      setColor(c, cell.danger ? DANGER : cell.strong ? GREEN : TEXT);
      const x = align === 'start' ? b.x + b.w - 6 : align === 'end' ? b.x + 6 : b.x + b.w / 2;
      const cDir = cell.dir ?? col.dir ?? 'rtl';
      drawText(c, fit(c, cell.text, b.w - 10, cDir), x, c.y + ROW_H / 2, align, cDir);
    });
    c.doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    c.doc.setLineWidth(0.4);
    c.doc.line(tableLeft, c.y + ROW_H, PAGE.w - MARGIN.x, c.y + ROW_H);
    c.y += ROW_H;
  }
  c.y += 10;
}

function drawFooters(c: Ctx, teacher: string): void {
  const total = c.doc.getNumberOfPages();
  const stamp = dmy(new Date().toISOString().slice(0, 10));
  for (let p = 1; p <= total; p++) {
    c.doc.setPage(p);
    c.doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    c.doc.setLineWidth(0.5);
    c.doc.line(
      MARGIN.x,
      PAGE.h - MARGIN.bottom + 16,
      PAGE.w - MARGIN.x,
      PAGE.h - MARGIN.bottom + 16,
    );
    setFont(c, false, FS.foot);
    setColor(c, MUTED);
    const yF = PAGE.h - MARGIN.bottom + 30;
    if (teacher) drawText(c, `المعلّم: ${teacher}`, PAGE.w - MARGIN.x, yF, 'start', 'rtl');
    drawText(c, `صفحة ${p} من ${total}`, PAGE.w / 2, yF, 'center', 'rtl');
    drawText(c, stamp, MARGIN.x, yF, 'end', 'ltr');
  }
}

/* --------------------------------------------------------------------------
   نقطة الدخول
   -------------------------------------------------------------------------- */

/** يبني ملفّ PDF نصّيًّا من نموذج المستند. */
export async function renderPdf(model: PdfDoc): Promise<Blob> {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS(FONT_FILES.normal.file, fonts.normal);
  doc.addFont(FONT_FILES.normal.file, FONT_NAME, 'normal');
  doc.addFileToVFS(FONT_FILES.bold.file, fonts.bold);
  doc.addFont(FONT_FILES.bold.file, FONT_NAME, 'bold');
  doc.setFont(FONT_NAME, 'normal');
  doc.setProperties({ title: model.title, subject: model.subtitle, creator: 'الماهر' });

  /*
    تعطيل التشكيل التلقائيّ على هذه النسخة وحدها.

    `processArabic` مشترك على حدث `preProcessText`، فيُطبَّق على كلّ نصّ يُرسَم.
    ونحن نُشكّل بأنفسنا في `prepare()` **قبل** العكس البصريّ (والترتيب لا يقبل
    القلب: التشكيل يعتمد على الجار المنطقيّ). فلو بقي الحدث لعمل مرّة ثانية على
    النصّ المعكوس، فتلتقي لام وألف بعد العكس فيُدمجان في «ﻻ» — وهو ما حوّل
    «اسم الطالب» إلى «ﺐﻻﻄﻟﺍ». نُلغي النشر لهذا الحدث وحده ونُبقي البقيّة.
  */
  const events = doc.internal.events;
  const publish = events.publish.bind(events);
  events.publish = (topic: string, payload: unknown) =>
    topic === 'preProcessText' ? undefined : publish(topic, payload);

  const c: Ctx = {
    doc,
    y: 0,
    page: 1,
    docTitle: model.title,
    docSubtitle: model.subtitle,
  };
  drawPageFrame(c, true);

  if (model.teacher) {
    setFont(c, false, FS.meta);
    setColor(c, MUTED);
    drawText(c, `معلّم الحلقة: ${model.teacher}`, PAGE.w - MARGIN.x, c.y, 'start', 'rtl');
    c.y += 16;
  }

  for (const sec of model.sections) {
    switch (sec.kind) {
      case 'stats':
        drawStats(c, sec.items);
        break;
      case 'heading':
        drawHeading(c, sec.text);
        break;
      case 'table':
        if (sec.title) drawHeading(c, sec.title);
        drawTable(c, sec.columns, sec.rows);
        break;
      case 'note':
        drawNote(c, sec.text, sec.danger);
        break;
      case 'pageBreak':
        newPage(c);
        break;
    }
  }

  drawFooters(c, model.teacher);
  return doc.output('blob');
}
