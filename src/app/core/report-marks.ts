/* ==========================================================================
   المقرر والإنذارات — علامات مؤقّتة على الطلّاب تُطبَع في التقرير.

   **لا تُحفَظ في قاعدة البيانات عمدًا**: المعلّم يعلّم الطلّاب ثمّ يُنشئ التقرير،
   وبعد إنشائه تزول العلامات ليبدأ تقريرًا جديدًا نظيفًا. فهذه الطبقة نقيّة
   بالكامل (بلا Angular ولا Firestore): تستقبل العلامات من الواجهة وتُخرِج
   كائنًا واحدًا تستهلكه المخرَجات الثلاثة (نصّ · PDF · صورة)، فلا تتباين.

   تُبنى المخرَجات من مفاتيح مستقلّة (`ReportContent`، راجع report-content.ts): النشاط (الحضور
   والتسميع والسجلّ)، المقرر، الإنذارات — بأيّ تركيبة. حين يُختار النشاط معهما
   تتقدّم كتلة المقرر/الإنذار على كتلة النشاط ليراها وليّ الأمر أوّلًا.
   ========================================================================== */

import { NOTE_MAX, studentCircleIds } from './models';
import { periodLabel, type Period } from './report-period';
import type { PdfCell, PdfDoc, PdfSection } from './report-pdf';
import type { ReportAudience } from './report-text';
import type { ReportContent } from './report-content';
import { circleTitleOf, type ReportSource } from './reports';

/** حالة المقرر — من الأعلى إلى الأدنى: اجتاز (زاد على المطلوب) · أنهى (أدّى المطلوب) · لم ينهِ. */
export type CourseStatus = 'passed' | 'completed' | 'incomplete';

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  passed: 'اجتاز المقرر',
  completed: 'أنهى المقرر',
  incomplete: 'لم ينهِ المقرر',
};

export const COURSE_STATUS_ORDER: CourseStatus[] = ['passed', 'completed', 'incomplete'];

/** أقصى طول لسبب الإنذار — كلمتان أو ثلاث، كملاحظة المحاولة. */
export const WARNING_NOTE_MAX = NOTE_MAX;

/** العلامات الحاليّة. المقرر مفتاحه «الحلقة|الطالب»، والإنذار مفتاحه الطالب (السبب ملاحظته). */
export interface ReportMarks {
  course: Record<string, CourseStatus>;
  warnings: Record<string, string>;
}

export const EMPTY_MARKS: ReportMarks = { course: {}, warnings: {} };

export const courseKey = (circleId: string, studentId: string): string =>
  `${circleId}|${studentId}`;

/* --------------------------------------------------------------------------
   البناء
   -------------------------------------------------------------------------- */

export interface MarkRow {
  studentId: string;
  name: string;
  course: CourseStatus | null;
  /** `null` = لا إنذار. نصّ فارغ = إنذار بلا سبب. */
  warning: string | null;
}

export interface MarksCircleSection {
  circleId: string;
  circleTitle: string;
  rows: MarkRow[];
}

export interface MarksReport {
  sections: MarksCircleSection[];
  showCourse: boolean;
  showWarnings: boolean;
  /** عدد الطلّاب المنذَرين (مرّة واحدة لكلّ طالب ولو ظهر في حلقتين). */
  warnedCount: number;
  courseCounts: Record<CourseStatus, number>;
}

/**
 * يبني كتلة المقرر/الإنذار للحلقات المختارة. `studentIds = null` يعني كلّ
 * طلّاب الحلقات، وإلّا يُقصَر على المحدَّدين.
 *
 * يظهر في الكتلة من عُلِّمت له حالة (أو إنذار) فقط — فتقرير الإنذارات يعرض
 * المنذَرين وحدهم لا قائمة الحلقة كلّها. والإنذار خاصّ بالطالب لا بالحلقة، فيُطبَع
 * مرّة واحدة عند أوّل حلقة يظهر فيها.
 */
export function buildMarksReport(
  src: ReportSource,
  circleIds: readonly string[],
  studentIds: readonly string[] | null,
  marks: ReportMarks,
  content: Pick<ReportContent, 'course' | 'warnings'>,
): MarksReport {
  const wanted = new Set(circleIds);
  const only = studentIds ? new Set(studentIds) : null;
  const warnShown = new Set<string>();
  const courseCounts: Record<CourseStatus, number> = { passed: 0, completed: 0, incomplete: 0 };
  const sections: MarksCircleSection[] = [];

  for (const c of src.circles) {
    if (!wanted.has(c.id)) continue;
    const rows: MarkRow[] = [];
    const students = src.students
      .filter((s) => s.active && studentCircleIds(s).includes(c.id) && (!only || only.has(s.id)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    for (const s of students) {
      const course = content.course ? (marks.course[courseKey(c.id, s.id)] ?? null) : null;
      let warning: string | null = null;
      if (content.warnings && s.id in marks.warnings && !warnShown.has(s.id)) {
        warning = marks.warnings[s.id].trim();
        warnShown.add(s.id);
      }
      if (course === null && warning === null) continue;
      if (course) courseCounts[course]++;
      rows.push({ studentId: s.id, name: s.name, course, warning });
    }
    if (rows.length > 0) sections.push({ circleId: c.id, circleTitle: circleTitleOf(c), rows });
  }

  return {
    sections,
    showCourse: content.course,
    showWarnings: content.warnings,
    warnedCount: warnShown.size,
    courseCounts,
  };
}

/** عنوان التقرير بحسب الأجزاء المختارة: «المقرر والإنذارات» / «المقرر» / «الإنذارات». */
export function marksTitle(rep: Pick<MarksReport, 'showCourse' | 'showWarnings'>): string {
  if (rep.showCourse && rep.showWarnings) return 'المقرر والإنذارات';
  return rep.showCourse ? 'المقرر' : 'الإنذارات';
}

export const isMarksEmpty = (rep: MarksReport): boolean => rep.sections.length === 0;

/** نصّ التنبيه المعروض للإنذار: «إنذار» أو «إنذار: سبب». */
export function warningText(note: string): string {
  return note ? `إنذار: ${note}` : 'إنذار';
}

/* --------------------------------------------------------------------------
   النصّ
   -------------------------------------------------------------------------- */

const RULE = '━━━━━━━━━━━━';

/** كتلة نصّية للمقرر/الإنذار — تُدمَج داخل أيّ تقرير أو تقوم وحدها. */
export function marksTextLines(rep: MarksReport): string[] {
  const out: string[] = [`📌 ${marksTitle(rep)}`];
  if (isMarksEmpty(rep)) {
    out.push('لا طلّاب معلَّمون.');
    return out;
  }
  for (const sec of rep.sections) {
    out.push('', `◈ ${sec.circleTitle}`);
    for (const r of sec.rows) {
      out.push(`• ${r.name}`);
      if (r.course) out.push(`  المقرر: ${COURSE_STATUS_LABELS[r.course]}`);
      if (r.warning !== null) out.push(`  ⚠ ${warningText(r.warning)}`);
    }
  }
  return out;
}

/** تقرير المقرر/الإنذار وحده نصًّا، بترويسة الأهالي وخاتمتهم إن كان للأهالي. */
export function marksReportText(
  rep: MarksReport,
  period: Period,
  meta: { teacherName: string; intro?: string; outro?: string },
  audience: ReportAudience,
): string {
  const parents = audience === 'parents';
  const lines: string[] = [];
  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 تقرير ${marksTitle(rep)}`, periodLabel(period));
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE, ...marksTextLines(rep));
  if (parents && meta.outro?.trim()) lines.push('', RULE, meta.outro.trim());
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* --------------------------------------------------------------------------
   PDF
   -------------------------------------------------------------------------- */

const num = (v: number | string): PdfCell => ({ text: String(v), dir: 'ltr' });

function courseCell(c: CourseStatus | null): PdfCell {
  if (!c) return { text: '—', dir: 'rtl' };
  return {
    text: COURSE_STATUS_LABELS[c],
    dir: 'rtl',
    bold: true,
    danger: c === 'incomplete',
    strong: c === 'passed',
  };
}

/** أقسام PDF لكتلة المقرر/الإنذار — تُلصَق في مقدّمة أيّ مستند أو تقوم وحدها. */
export function marksPdfSections(rep: MarksReport): PdfSection[] {
  const sections: PdfSection[] = [{ kind: 'heading', text: marksTitle(rep) }];
  if (isMarksEmpty(rep)) {
    sections.push({ kind: 'note', text: 'لا طلّاب معلَّمون.' });
    return sections;
  }

  const stats: { label: string; value: string }[] = [];
  if (rep.showCourse) {
    stats.push(
      { label: 'اجتاز المقرر', value: String(rep.courseCounts.passed) },
      { label: 'أنهى المقرر', value: String(rep.courseCounts.completed) },
      { label: 'لم ينهِ المقرر', value: String(rep.courseCounts.incomplete) },
    );
  }
  if (rep.showWarnings) stats.push({ label: 'إنذار', value: String(rep.warnedCount) });
  sections.push({ kind: 'stats', items: stats });

  for (const sec of rep.sections) {
    sections.push({
      kind: 'table',
      title: sec.circleTitle,
      columns: [
        { header: '#', weight: 0.5, dir: 'ltr' },
        { header: 'اسم الطالب', weight: 3.4, align: 'start' },
        ...(rep.showCourse ? [{ header: 'المقرر', weight: 2 }] : []),
        ...(rep.showWarnings ? [{ header: 'الإنذار', weight: 3, align: 'start' as const }] : []),
      ],
      rows: sec.rows.map((r, i) => [
        num(i + 1),
        { text: r.name, bold: true, dir: 'rtl' as const },
        ...(rep.showCourse ? [courseCell(r.course)] : []),
        ...(rep.showWarnings
          ? [
              r.warning === null
                ? { text: '', dir: 'rtl' as const }
                : { text: warningText(r.warning), dir: 'rtl' as const, bold: true, danger: true },
            ]
          : []),
      ]),
    });
  }
  return sections;
}

/** مستند PDF للمقرر/الإنذار وحده. */
export function marksPdf(rep: MarksReport, period: Period, teacherName: string): PdfDoc {
  return {
    title: `تقرير ${marksTitle(rep)}`,
    subtitle: periodLabel(period),
    teacher: teacherName,
    sections: marksPdfSections(rep),
  };
}
