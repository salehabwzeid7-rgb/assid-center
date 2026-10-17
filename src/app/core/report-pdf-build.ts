/* ==========================================================================
   بناء نموذج مستند PDF من كائنات التقارير المحسوبة — وهو نفسه ما تُرسَم منه صور التقرير.

   طبقة تحويل خالصة: تأخذ ما أنتجته `reports.ts` وتُخرِج `PdfDoc`. لا تحسب شيئًا بنفسها —
   فالأرقام في PDF هي نفسها التي في الشاشة والنصّ والصورة.

   **متكيّف بمفاتيح المحتوى** (`ActivityFlags`): كلّ عمود وبطاقة وجدول يظهر فقط إن اختاره
   المعلّم (الحضور · سجلّ التسميع · عدد الأوجه · السرد · الاختبارات)، فتتّسق كلّ التركيبات.

   قاعدة العرض هنا: **وحدات القياس في ترويسة العمود لا في الخلايا**. خليّة تحوي «٩٤٪» تخلط
   رقمًا لاتينيًّا برمز عربيّ فينقلب ترتيبها البصريّ حسب الاتّجاه؛ وخليّة تحوي «٩٤» وحدها آمنة
   تمامًا وأنظف في جدول مطبوع.
   ========================================================================== */

import { dmy, weekdayAr } from './format';
import {
  ATTENDANCE_LABELS,
  EXAM_PASS,
  EXAM_SCOPE_LABELS,
  SARD_PASS,
  SERD_SCOPE_LABELS,
  passLabel,
} from './models';
import { pagesText } from './mushaf';
import { ALL_ACTIVITY, type ActivityFlags } from './report-content';
import { periodLabel } from './report-period';
import type { PdfCell, PdfColumn, PdfDoc, PdfSection } from './report-pdf';
import type { ReportAudience } from './report-text';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  attFraction,
  fracText,
  isRecitationEntry,
  logDays,
  type CircleReport,
  type DayEntry,
  type HifzCircleReport,
  type OverviewReport,
  type StudentTimeline,
  type StudentsReport,
  type TajweedCircleReport,
  type TajweedExamCell,
  type TajweedStudentRow,
} from './reports';

export interface PdfMeta {
  teacherName: string;
  audience: ReportAudience;
  /** ما يدخل التقرير من النشاط — الافتراضيّ: كلّه. */
  flags?: ActivityFlags;
}

const num = (v: number | string): PdfCell => ({ text: String(v), dir: 'ltr' });
const pct = (v: number | null): PdfCell =>
  v === null ? { text: '—', dir: 'ltr' } : { text: String(v), dir: 'ltr' };
const name = (t: string): PdfCell => ({ text: t, bold: true, dir: 'rtl' });
/**
 * الأوجه «10 وربع» — بالكلمات لأنّ خطّ PDF لا يحوي رموز الكسور. اتّجاه الخليّة `ltr` عمدًا:
 * النصّ مختلط (رقم + كلمة عربيّة) ومحرّك Bidi في jsPDF يعكس ترتيبه في خليّة `rtl` فيظهر
 * «وربع 10» — جُرِّب فعليًّا على ملفّ مُصدَّر، و`ltr` يعطي الترتيب الصحيح.
 */
const pg = (p: number): PdfCell => ({ text: pagesText(p), dir: 'ltr' });
/** الحضور كسرًا «٤/٥» — يُرسَم `ltr` فلا ينقلب ترتيب الطرفين. */
const att = (text: string): PdfCell => ({ text, dir: 'ltr' });

const IDX: PdfColumn = { header: '#', weight: 0.5, dir: 'ltr' };
const NAME = (weight: number): PdfColumn => ({ header: 'اسم الطالب', weight, align: 'start' });

const flagsOf = (meta: PdfMeta): ActivityFlags => meta.flags ?? ALL_ACTIVITY;

const NO_DATA = 'لا بيانات للمحتوى المختار في هذه الفترة.';

/* --------------------------------------------------------------------------
   تقرير حلقة
   -------------------------------------------------------------------------- */

function hifzCircleSections(rep: HifzCircleReport, meta: PdfMeta, f: ActivityFlags): PdfSection[] {
  const sections: PdfSection[] = [];

  const stats: { label: string; value: string }[] = [];
  if (f.attendance) {
    stats.push(
      { label: 'جلسة', value: String(rep.heldCount) },
      { label: 'الحضور', value: fracText(rep.attFrac) },
    );
  }
  if (f.pages) stats.push({ label: 'أوجه الحفظ الجديد', value: pagesText(rep.totalPages) });
  if (f.recitation) {
    stats.push({
      label: 'متوسّط التسميع ٪',
      value: rep.avgScore === null ? '—' : String(rep.avgScore),
    });
  }
  if (f.serd) stats.push({ label: 'سرد', value: String(rep.sardCount) });
  if (f.exams) stats.push({ label: 'اختبار', value: String(rep.examCount) });
  if (stats.length > 0) sections.push({ kind: 'stats', items: stats });

  const columns: PdfColumn[] = [IDX, NAME(4)];
  if (f.attendance) columns.push({ header: 'الحضور', weight: 1.4 });
  if (f.pages) columns.push({ header: 'الأوجه', weight: 1.6 });
  if (f.recitation) columns.push({ header: 'المتوسّط ٪', weight: 1.4 });
  if (f.serd) columns.push({ header: 'سرد', weight: 1 });
  if (f.exams) columns.push({ header: 'اختبار', weight: 1.1 });

  if (columns.length > 2) {
    sections.push({
      kind: 'table',
      title: 'الطلّاب',
      columns,
      rows: rep.rows.map((r, i) => {
        const cells: PdfCell[] = [num(i + 1), name(r.name)];
        if (f.attendance) cells.push(att(attFraction(r.att, r.held)));
        if (f.pages) cells.push(pg(r.pages));
        if (f.recitation) cells.push(pct(r.avgScore));
        if (f.serd) cells.push(num(r.sardCount));
        if (f.exams) cells.push(num(r.examCount));
        return cells;
      }),
    });
  }

  if (meta.audience === 'reference' && (f.attendance || f.recitation)) {
    if (rep.studentsWithGaps > 0) {
      sections.push({
        kind: 'note',
        danger: true,
        text: `${rep.studentsWithGaps} من الطلّاب لهم أيّام حضور بلا إنجاز مسجَّل.`,
      });
    }
    if (rep.inactiveStudents.length > 0) {
      sections.push({
        kind: 'note',
        danger: true,
        text: `منقطعون (${INACTIVE_DAYS} يومًا فأكثر): ${rep.inactiveStudents
          .map((r) => r.name)
          .join('، ')}.`,
      });
    }
  }
  return sections;
}

function tajweedCircleSections(rep: TajweedCircleReport, f: ActivityFlags): PdfSection[] {
  const sections: PdfSection[] = [];

  if (!f.attendance && !f.exams) {
    sections.push({ kind: 'note', text: NO_DATA });
    return sections;
  }

  const stats: { label: string; value: string }[] = [];
  if (f.attendance) {
    stats.push(
      { label: 'جلسة', value: String(rep.heldCount) },
      { label: 'الحضور', value: fracText(rep.attFrac) },
    );
  }
  if (f.exams) {
    stats.push({ label: 'اختبار', value: String(rep.exams.length) });
    if (rep.maxScore > 0) {
      stats.push({ label: 'مجموع العلامات', value: `${rep.achieved} / ${rep.maxScore}` });
    }
  }
  sections.push({ kind: 'stats', items: stats });

  if (!f.exams || rep.exams.length === 0) {
    if (f.attendance) {
      sections.push({
        kind: 'table',
        title: 'الحضور',
        columns: [IDX, NAME(5), { header: 'الحضور', weight: 1.6 }],
        rows: rep.rows.map((r, i) => [num(i + 1), name(r.name), att(attFraction(r.att, r.held))]),
      });
    }
    if (f.exams) sections.push({ kind: 'note', text: 'لا اختبارات تجويد في هذه الفترة.' });
    return sections;
  }

  // جدول درجات: عمود لكلّ اختبار. عند كثرتها يُقسَّم على جداول متتالية
  // حتى تبقى الأعمدة مقروءة على الورق بدل أن تنضغط.
  const MAX_COLS = 5;
  const groups: (typeof rep.exams)[] = [];
  for (let i = 0; i < rep.exams.length; i += MAX_COLS) {
    groups.push(rep.exams.slice(i, i + MAX_COLS));
  }

  groups.forEach((group, gi) => {
    const last = gi === groups.length - 1;
    const columns: PdfColumn[] = [
      IDX,
      { header: 'اسم الطالب', weight: 3.4, align: 'start' },
      ...(f.attendance ? [{ header: 'الحضور', weight: 1.2 }] : []),
      // بلا أقواس عمدًا: القوس في نصّ عربيّ يحتاج انعكاس صورته، وتفاديه
      // أبسط وأسلم من معالجته في كلّ موضع.
      ...group.map((e) => ({ header: `${e.name} — من ${e.totalScore}`, weight: 1.6 })),
      ...(last ? [{ header: 'المجموع', weight: 1.6 }] : []),
    ];
    const rows = rep.rows.map((r, i) => {
      const cells: PdfCell[] = [num(i + 1), name(r.name)];
      if (f.attendance) cells.push(att(attFraction(r.att, r.held)));
      for (const e of group) {
        const cell = cellOf(r, e.id);
        cells.push(
          !cell
            ? { text: '·', dir: 'ltr' }
            : cell.score === null
              ? { text: '—', dir: 'ltr' }
              : { text: String(cell.score), dir: 'ltr', danger: !cell.passed },
        );
      }
      if (last) cells.push({ text: `${r.achieved} / ${r.maxScore}`, dir: 'ltr', strong: true });
      return cells;
    });
    sections.push({
      kind: 'table',
      title: gi === 0 ? 'نتائج الاختبارات' : 'تتمّة الاختبارات',
      columns,
      rows,
    });
  });

  sections.push({
    kind: 'note',
    text: '«·» يعني أنّ الطالب غير مستهدَف بهذا الاختبار، و«—» يعني أنّ نتيجته لم تُسجَّل.',
  });
  return sections;
}

/** أقسام تقرير حلقة واحدة (بلا ترويسة المستند) — يختار الفرع بحسب نوع الحلقة. */
export function circleSections(rep: CircleReport, meta: PdfMeta): PdfSection[] {
  const f = flagsOf(meta);
  return rep.kind === 'hifz' ? hifzCircleSections(rep, meta, f) : tajweedCircleSections(rep, f);
}

export function buildCirclePdf(rep: CircleReport, meta: PdfMeta): PdfDoc {
  return {
    title: rep.circleTitle,
    subtitle: periodLabel(rep.period),
    teacher: meta.teacherName,
    sections: circleSections(rep, meta),
  };
}

function cellOf(row: TajweedStudentRow, examId: string): TajweedExamCell | undefined {
  return row.cells.find((c) => c.examId === examId);
}

/* --------------------------------------------------------------------------
   تقرير طالب واحد
   -------------------------------------------------------------------------- */

function studentSections(tl: StudentTimeline, meta: PdfMeta, f: ActivityFlags): PdfSection[] {
  const sections: PdfSection[] = [];

  const stats: { label: string; value: string }[] = [];
  if (tl.hasHifz) {
    if (f.attendance) stats.push({ label: 'الحضور', value: attFraction(tl.att, tl.held) });
    if (f.pages) stats.push({ label: 'أوجه الحفظ الجديد', value: pagesText(tl.pages) });
    if (f.recitation) {
      stats.push({
        label: 'متوسّط التسميع ٪',
        value: tl.avgScore === null ? '—' : String(tl.avgScore),
      });
    }
  } else {
    if (f.attendance) {
      stats.push(
        { label: 'الحضور', value: attFraction(tl.att, tl.held) },
        { label: 'حصص حضرها', value: String(tl.att.present + tl.att.late) },
      );
    }
    if (f.exams) {
      const t = tajweedSum(tl);
      stats.push(
        { label: 'اختبارات التجويد', value: String(tl.tajweed.length) },
        { label: 'مجموع العلامات', value: t.max ? `${t.achieved} / ${t.max}` : '—' },
      );
    }
  }
  if (stats.length > 0) sections.push({ kind: 'stats', items: stats });

  // ---- السِجلّ اليوميّ ----
  const showRecitation = f.recitation && tl.hasHifz;
  if (f.attendance || showRecitation) {
    const rows: PdfCell[][] = [];
    for (const d of logDays(tl, meta.audience, f)) {
      const day: PdfCell = { text: `${weekdayAr(d.date)} ${dmy(d.date)}`, dir: 'rtl' };
      const status: PdfCell = {
        text: d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome],
        dir: 'rtl',
      };

      if (!showRecitation) {
        // الحضور وحده: اليوم والحالة وملاحظة الحضور إن وُجدت.
        rows.push([day, status, { text: d.note ?? '', dir: 'rtl' }]);
        continue;
      }

      // كلّ محاولة سطر مستقلّ بترتيبها الزمنيّ؛ تُرقَّم حين تتعدّد في اليوم نفسه.
      const entries = d.entries.filter(isRecitationEntry);
      const multi = entries.length > 1;
      const items = entries.map((e, i) => ({
        kind: multi ? `${i + 1}. ${e.label}` : e.label,
        detail: entryDetail(e),
        score: e.score === null ? '' : String(e.score),
        verdict: e.verdict,
        fail: e.fail,
      }));
      const lead = (first: boolean): PdfCell[] =>
        f.attendance
          ? first
            ? [day, status]
            : [{ text: '' }, { text: '' }]
          : first
            ? [day]
            : [{ text: '' }];

      if (items.length === 0) {
        if (!f.attendance) continue;
        const gap = d.outcome === 'no_record';
        const txt =
          d.outcome === 'absent' || d.outcome === 'excused'
            ? (d.note ?? '')
            : d.note || DAY_OUTCOME_LABELS[d.outcome];
        rows.push([
          ...lead(true),
          { text: '', dir: 'rtl' },
          { text: txt, dir: 'rtl', danger: gap },
          { text: '' },
          { text: '' },
        ]);
      } else {
        items.forEach((it, i) => {
          rows.push([
            ...lead(i === 0),
            // «لم يسمّع» بلا درجة تُلوَّن خليّة نوعها نفسها، وإلّا لم يبقَ أيّ أثر للتحذير.
            { text: it.kind, dir: 'rtl', bold: true, danger: it.fail && !it.score },
            { text: it.detail, dir: 'rtl' },
            { text: it.score, dir: 'ltr', danger: it.fail, strong: !it.fail },
            { text: it.verdict, dir: 'rtl', danger: it.fail },
          ]);
        });
      }
    }

    if (rows.length === 0) {
      sections.push({
        kind: 'note',
        text:
          meta.audience === 'parents'
            ? 'لا إنجاز مسجَّل في هذه الفترة.'
            : 'لا سجلّات في هذه الفترة.',
      });
    } else {
      const columns: PdfColumn[] = [{ header: 'اليوم', weight: 2.2, align: 'start' }];
      if (f.attendance) columns.push({ header: 'الحالة', weight: 1.3 });
      if (showRecitation) {
        columns.push(
          { header: 'النشاط', weight: 1.9 },
          { header: 'التفصيل', weight: 3.6, align: 'start' },
          { header: 'الدرجة ٪', weight: 1.2 },
          { header: 'التقدير', weight: 1.6 },
        );
      } else {
        columns.push({ header: 'التفصيل', weight: 4, align: 'start' });
      }
      sections.push({
        kind: 'table',
        title: showRecitation ? 'السِجلّ اليوميّ' : 'سجلّ الحضور',
        columns,
        rows,
      });
    }
  }

  if (f.serd && tl.serd.length > 0) {
    sections.push({
      kind: 'table',
      title: 'السرد',
      columns: [
        { header: 'التاريخ', weight: 1.8, dir: 'ltr' },
        { header: 'النوع', weight: 2.2 },
        { header: 'الجزء', weight: 1.4 },
        { header: 'الدورة', weight: 1.2 },
        { header: 'الدرجة ٪', weight: 1.3 },
        { header: 'الحالة', weight: 1.5 },
      ],
      rows: tl.serd.map((s) => [
        { text: dmy(s.date), dir: 'ltr' as const },
        { text: SERD_SCOPE_LABELS[s.scope] ?? 'سرد', dir: 'rtl' as const },
        num(s.scope === 'block' ? (s.juzList ?? [s.juz]).join('، ') : s.juz),
        num(s.cycle),
        {
          text: String(s.score),
          dir: 'ltr' as const,
          danger: s.score < SARD_PASS,
          strong: s.score >= SARD_PASS,
        },
        { text: passLabel(s.score, SARD_PASS), dir: 'rtl' as const, danger: s.score < SARD_PASS },
      ]),
    });
  }

  if (f.exams && tl.exams.length > 0) {
    sections.push({
      kind: 'table',
      title: 'اختبارات الأجزاء',
      columns: [
        { header: 'التاريخ', weight: 1.8, dir: 'ltr' },
        { header: 'النوع', weight: 2.2 },
        { header: 'الجزء', weight: 1.4 },
        { header: 'المحاولة', weight: 1.3 },
        { header: 'الدرجة ٪', weight: 1.3 },
        { header: 'الحالة', weight: 1.5 },
      ],
      rows: tl.exams.map((e) => [
        { text: dmy(e.date), dir: 'ltr' as const },
        { text: EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار', dir: 'rtl' as const },
        num(e.scope === 'block' ? (e.juzList ?? [e.juz]).join('، ') : e.juz),
        num(e.attempt),
        {
          text: String(e.score),
          dir: 'ltr' as const,
          danger: e.score < EXAM_PASS,
          strong: e.score >= EXAM_PASS,
        },
        { text: passLabel(e.score, EXAM_PASS), dir: 'rtl' as const, danger: e.score < EXAM_PASS },
      ]),
    });
  }

  if (f.exams && tl.tajweed.length > 0) {
    sections.push({
      kind: 'table',
      title: 'اختبارات التجويد',
      columns: [
        { header: 'التاريخ', weight: 1.8, dir: 'ltr' },
        { header: 'الاختبار', weight: 4, align: 'start' },
        { header: 'العلامة', weight: 1.8 },
        { header: 'التقدير', weight: 1.8 },
      ],
      rows: tl.tajweed.map((c) => [
        { text: dmy(c.date), dir: 'ltr' as const },
        { text: c.examName, dir: 'rtl' as const },
        {
          text: c.score === null ? `— / ${c.totalScore}` : `${c.score} / ${c.totalScore}`,
          dir: 'ltr' as const,
          strong: c.passed,
          danger: !c.passed,
        },
        { text: c.verdict, dir: 'rtl' as const, danger: !c.passed },
      ]),
    });
  }

  if (sections.length === 0) sections.push({ kind: 'note', text: NO_DATA });
  return sections;
}

/**
 * تفصيل المحاولة مع ملاحظتها القصيرة: «النبأ ١ إلى النبأ ٢٠ — تردّد كثير».
 * السهم «←» يُستبدَل بـ«إلى»: خطّ أميري لا يحوي رمز الأسهم فيختفي في PDF.
 */
function entryDetail(e: DayEntry): string {
  const detail = e.detail.replace(/\s*←\s*/g, ' إلى ');
  if (detail && e.note) return `${detail} — ${e.note}`;
  return detail || e.note;
}

function tajweedSum(tl: StudentTimeline): { achieved: number; max: number } {
  const sat = tl.tajweed.filter((c) => c.score !== null);
  return {
    achieved: sat.reduce((a, c) => a + (c.score ?? 0), 0),
    max: sat.reduce((a, c) => a + c.totalScore, 0),
  };
}

export function buildStudentPdf(tl: StudentTimeline, meta: PdfMeta): PdfDoc {
  return {
    title: tl.name,
    subtitle: periodLabel(tl.period),
    teacher: meta.teacherName,
    sections: studentSections(tl, meta, flagsOf(meta)),
  };
}

/* --------------------------------------------------------------------------
   تقرير عدّة طلّاب — ورقة مستقلّة لكلّ طالب
   -------------------------------------------------------------------------- */

export function buildStudentsPdf(rep: StudentsReport, meta: PdfMeta): PdfDoc {
  if (rep.students.length === 1) return buildStudentPdf(rep.students[0], meta);

  const f = flagsOf(meta);
  const t = rep.totals;
  const sections: PdfSection[] = [];

  const stats: { label: string; value: string }[] = [{ label: 'طالب', value: String(t.students) }];
  const columns: PdfColumn[] = [IDX, NAME(4)];
  if (t.hasHifz) {
    if (f.attendance) {
      stats.push({ label: 'الحضور', value: fracText(t.attFrac) });
      columns.push({ header: 'الحضور', weight: 1.4 });
    }
    if (f.pages) {
      stats.push({ label: 'أوجه الحفظ الجديد', value: pagesText(t.pages) });
      columns.push({ header: 'الأوجه', weight: 1.6 });
    }
    if (f.recitation) {
      stats.push({
        label: 'متوسّط التسميع ٪',
        value: t.avgScore === null ? '—' : String(t.avgScore),
      });
      columns.push({ header: 'المتوسّط ٪', weight: 1.4 });
    }
    if (f.serd) columns.push({ header: 'سرد', weight: 1 });
    if (f.exams) columns.push({ header: 'اختبار', weight: 1.1 });
  } else {
    if (f.attendance) {
      stats.push({ label: 'الحضور', value: fracText(t.attFrac) });
      columns.push({ header: 'الحضور', weight: 1.4 }, { header: 'حضر', weight: 1.1 });
    }
    if (f.exams) {
      stats.push(
        { label: 'اختبارات التجويد', value: String(t.tajweedCount) },
        {
          label: 'مجموع العلامات',
          value: t.tajweedMax ? `${t.tajweedAchieved} / ${t.tajweedMax}` : '—',
        },
      );
      columns.push({ header: 'اختبارات', weight: 1.3 }, { header: 'المجموع', weight: 1.6 });
    }
  }

  sections.push({ kind: 'stats', items: stats });
  if (columns.length > 2) {
    sections.push({
      kind: 'table',
      title: 'ملخّص الطلّاب',
      columns,
      rows: rep.students.map((s, i) => {
        const cells: PdfCell[] = [num(i + 1), name(s.name)];
        if (t.hasHifz) {
          if (f.attendance) cells.push(att(attFraction(s.att, s.held)));
          if (f.pages) cells.push(pg(s.pages));
          if (f.recitation) cells.push(pct(s.avgScore));
          if (f.serd) cells.push(num(s.serd.length));
          if (f.exams) cells.push(num(s.exams.length));
        } else {
          if (f.attendance) {
            cells.push(att(attFraction(s.att, s.held)), num(s.att.present + s.att.late));
          }
          if (f.exams) {
            const sum = tajweedSum(s);
            cells.push(num(s.tajweed.length), {
              text: sum.max ? `${sum.achieved} / ${sum.max}` : '—',
              dir: 'ltr' as const,
            });
          }
        }
        return cells;
      }),
    });
  }

  // كلّ طالب يبدأ على ورقة جديدة — الفصل ضروريّ في سجلّ يُحفَظ ورقيًّا.
  for (const tl of rep.students) {
    sections.push({ kind: 'pageBreak' });
    sections.push({ kind: 'heading', text: `الطالب: ${tl.name}` });
    sections.push(...studentSections(tl, meta, f));
  }

  return {
    title: `تقرير ${rep.students.length} طلّاب`,
    subtitle: periodLabel(rep.period),
    teacher: meta.teacherName,
    sections,
  };
}

/* --------------------------------------------------------------------------
   التقرير العامّ
   -------------------------------------------------------------------------- */

export function buildOverviewPdf(ov: OverviewReport, meta: PdfMeta): PdfDoc {
  const f = flagsOf(meta);
  const sections: PdfSection[] = [];

  if (ov.hifz.length > 0) {
    const t = ov.hifzTotals;
    const stats: { label: string; value: string }[] = [
      { label: 'حلقة', value: String(t.circles) },
      { label: 'طالب', value: String(t.students) },
    ];
    const columns: PdfColumn[] = [
      { header: 'الحلقة', weight: 3.4, align: 'start' },
      { header: 'طلّاب', weight: 1.1 },
    ];
    if (f.attendance) {
      stats.push({ label: 'الحضور', value: fracText(t.attFrac) });
      columns.push({ header: 'جلسات', weight: 1.2 }, { header: 'الحضور', weight: 1.5 });
    }
    if (f.pages) {
      stats.push({ label: 'أوجه الحفظ الجديد', value: pagesText(t.pages) });
      columns.push({ header: 'الأوجه', weight: 1.6 });
    }
    if (f.recitation) {
      stats.push({ label: 'المتوسّط ٪', value: t.avgScore === null ? '—' : String(t.avgScore) });
      columns.push({ header: 'المتوسّط ٪', weight: 1.4 });
    }
    if (f.serd) columns.push({ header: 'سرد', weight: 1 });
    if (f.exams) columns.push({ header: 'اختبار', weight: 1.1 });

    sections.push({ kind: 'heading', text: 'حلقات التحفيظ' });
    sections.push({ kind: 'stats', items: stats });
    sections.push({
      kind: 'table',
      columns,
      rows: ov.hifz.map((c) => {
        const cells: PdfCell[] = [name(c.circleName), num(c.studentCount)];
        if (f.attendance) cells.push(num(c.heldCount), att(fracText(c.attFrac)));
        if (f.pages) cells.push(pg(c.totalPages));
        if (f.recitation) cells.push(pct(c.avgScore));
        if (f.serd) cells.push(num(c.sardCount));
        if (f.exams) cells.push(num(c.examCount));
        return cells;
      }),
    });
  }

  // حلقات التجويد: حضور واختبارات فقط — لا تحضر في تقرير لا يضمّ أيًّا منهما.
  if (ov.tajweed.length > 0 && (f.attendance || f.exams)) {
    const t = ov.tajweedTotals;
    const stats: { label: string; value: string }[] = [
      { label: 'حلقة', value: String(t.circles) },
      { label: 'طالب', value: String(t.students) },
    ];
    const columns: PdfColumn[] = [
      { header: 'الحلقة', weight: 3.6, align: 'start' },
      { header: 'طلّاب', weight: 1.2 },
    ];
    if (f.attendance) {
      stats.push({ label: 'الحضور', value: fracText(t.attFrac) });
      columns.push({ header: 'جلسات', weight: 1.3 }, { header: 'الحضور', weight: 1.5 });
    }
    if (f.exams) {
      stats.push(
        { label: 'اختبار', value: String(t.exams) },
        { label: 'المجموع', value: t.maxScore > 0 ? `${t.achieved} / ${t.maxScore}` : '—' },
      );
      columns.push({ header: 'اختبارات', weight: 1.5 }, { header: 'المجموع', weight: 1.9 });
    }

    sections.push({ kind: 'heading', text: 'حلقات التجويد' });
    sections.push({ kind: 'stats', items: stats });
    sections.push({
      kind: 'table',
      columns,
      rows: ov.tajweed.map((c) => {
        const cells: PdfCell[] = [name(c.circleName), num(c.studentCount)];
        if (f.attendance) cells.push(num(c.heldCount), att(fracText(c.attFrac)));
        if (f.exams) {
          cells.push(num(c.exams.length), {
            text: c.maxScore > 0 ? `${c.achieved} / ${c.maxScore}` : '—',
            dir: 'ltr' as const,
            strong: true,
          });
        }
        return cells;
      }),
    });
  }

  if (sections.length === 0) {
    sections.push({
      kind: 'note',
      text: ov.hifz.length === 0 && ov.tajweed.length === 0 ? 'لم تُختَر أيّ حلقة.' : NO_DATA,
    });
  }

  return {
    title: 'تقرير عامّ',
    subtitle: periodLabel(ov.period),
    teacher: meta.teacherName,
    sections,
  };
}
