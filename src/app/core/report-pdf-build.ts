/* ==========================================================================
   بناء نموذج مستند PDF من كائنات التقارير المحسوبة.

   طبقة تحويل خالصة: تأخذ ما أنتجته `reports.ts` وتُخرِج `PdfDoc`. لا تحسب
   شيئًا بنفسها — فالأرقام في PDF هي نفسها التي في الشاشة والنصّ والصورة.

   قاعدة العرض هنا: **وحدات القياس في ترويسة العمود لا في الخلايا**. خليّة
   تحوي «٩٤٪» تخلط رقمًا لاتينيًّا برمز عربيّ فينقلب ترتيبها البصريّ حسب
   الاتّجاه؛ وخليّة تحوي «٩٤» وحدها آمنة تمامًا وأنظف في جدول مطبوع.
   ========================================================================== */

import { dmy, weekdayAr } from './format';
import {
  ATTENDANCE_LABELS,
  EXAM_PASS,
  EXAM_SCOPE_LABELS,
  RECITATION_KIND_LABELS,
  SARD_PASS,
  SERD_SCOPE_LABELS,
  passLabel,
  ratingLabel,
  scoreOf,
} from './models';
import { surahName } from './quran-data';
import { periodLabel } from './report-period';
import type { PdfCell, PdfDoc, PdfSection } from './report-pdf';
import type { ReportAudience } from './report-text';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  type CircleReport,
  type OverviewReport,
  type StudentTimeline,
  type StudentsReport,
  type TajweedExamCell,
  type TajweedStudentRow,
} from './reports';

export interface PdfMeta {
  teacherName: string;
  audience: ReportAudience;
}

const num = (v: number | string): PdfCell => ({ text: String(v), dir: 'ltr' });
const pct = (v: number | null): PdfCell =>
  v === null ? { text: '—', dir: 'ltr' } : { text: String(v), dir: 'ltr' };
const name = (t: string): PdfCell => ({ text: t, bold: true, dir: 'rtl' });

/* --------------------------------------------------------------------------
   تقرير حلقة
   -------------------------------------------------------------------------- */

export function buildCirclePdf(rep: CircleReport, meta: PdfMeta): PdfDoc {
  const sections: PdfSection[] = [];

  if (rep.kind === 'hifz') {
    sections.push({
      kind: 'stats',
      items: [
        { label: 'جلسة', value: String(rep.heldCount) },
        { label: 'الحضور ٪', value: rep.att.rate === null ? '—' : String(rep.att.rate) },
        { label: 'وجه', value: String(rep.totalPages) },
        { label: 'متوسّط التسميع ٪', value: rep.avgScore === null ? '—' : String(rep.avgScore) },
      ],
    });

    sections.push({
      kind: 'table',
      title: 'الطلّاب',
      columns: [
        { header: '#', weight: 0.5, dir: 'ltr' },
        { header: 'اسم الطالب', weight: 4, align: 'start' },
        { header: 'الحضور ٪', weight: 1.4 },
        { header: 'الأوجه', weight: 1.2 },
        { header: 'حفظ جديد', weight: 1.4 },
        { header: 'المتوسّط ٪', weight: 1.4 },
        { header: 'سرد', weight: 1 },
        { header: 'اختبار', weight: 1.1 },
      ],
      rows: rep.rows.map((r, i) => [
        num(i + 1),
        name(r.name),
        pct(r.att.rate),
        num(r.pages),
        num(r.newPages),
        pct(r.avgScore),
        num(r.sardCount),
        num(r.examCount),
      ]),
    });

    if (meta.audience === 'reference') {
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
  } else {
    const stats = [
      { label: 'جلسة', value: String(rep.heldCount) },
      { label: 'الحضور ٪', value: rep.att.rate === null ? '—' : String(rep.att.rate) },
      { label: 'اختبار', value: String(rep.exams.length) },
    ];
    if (rep.maxScore > 0) {
      stats.push({ label: 'مجموع العلامات', value: `${rep.achieved} / ${rep.maxScore}` });
    }
    sections.push({ kind: 'stats', items: stats });

    if (rep.exams.length === 0) {
      sections.push({
        kind: 'table',
        title: 'الحضور',
        columns: [
          { header: '#', weight: 0.5, dir: 'ltr' },
          { header: 'اسم الطالب', weight: 5, align: 'start' },
          { header: 'الحضور ٪', weight: 1.6 },
        ],
        rows: rep.rows.map((r, i) => [num(i + 1), name(r.name), pct(r.att.rate)]),
      });
      sections.push({ kind: 'note', text: 'لا اختبارات تجويد في هذه الفترة.' });
    } else {
      // جدول درجات: عمود لكلّ اختبار. عند كثرتها يُقسَّم على جداول متتالية
      // حتى تبقى الأعمدة مقروءة على الورق بدل أن تنضغط.
      const MAX_COLS = 5;
      const groups: (typeof rep.exams)[] = [];
      for (let i = 0; i < rep.exams.length; i += MAX_COLS) {
        groups.push(rep.exams.slice(i, i + MAX_COLS));
      }

      groups.forEach((group, gi) => {
        const last = gi === groups.length - 1;
        const columns = [
          { header: '#', weight: 0.5, dir: 'ltr' as const },
          { header: 'اسم الطالب', weight: 3.4, align: 'start' as const },
          { header: 'الحضور ٪', weight: 1.2 },
          // بلا أقواس عمدًا: القوس في نصّ عربيّ يحتاج انعكاس صورته، وتفاديه
          // أبسط وأسلم من معالجته في كلّ موضع.
          ...group.map((e) => ({ header: `${e.name} — من ${e.totalScore}`, weight: 1.6 })),
          ...(last ? [{ header: 'المجموع', weight: 1.6 }] : []),
        ];
        const rows = rep.rows.map((r, i) => {
          const cells: PdfCell[] = [num(i + 1), name(r.name), pct(r.att.rate)];
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
    }
  }

  return {
    title: rep.circleTitle,
    subtitle: periodLabel(rep.period),
    teacher: meta.teacherName,
    sections,
  };
}

function cellOf(row: TajweedStudentRow, examId: string): TajweedExamCell | undefined {
  return row.cells.find((c) => c.examId === examId);
}

/* --------------------------------------------------------------------------
   تقرير طالب واحد
   -------------------------------------------------------------------------- */

function studentSections(tl: StudentTimeline, meta: PdfMeta): PdfSection[] {
  const sections: PdfSection[] = [];

  sections.push({
    kind: 'stats',
    items: [
      { label: 'الحضور ٪', value: tl.att.rate === null ? '—' : String(tl.att.rate) },
      { label: 'وجه', value: String(tl.pages) },
      { label: 'حفظ جديد', value: String(tl.newPages) },
      { label: 'متوسّط التسميع ٪', value: tl.avgScore === null ? '—' : String(tl.avgScore) },
    ],
  });

  const days =
    meta.audience === 'parents'
      ? tl.days.filter((d) => d.recitations.length || d.serd.length || d.exams.length)
      : tl.days;

  const rows: PdfCell[][] = [];
  for (const d of days) {
    const head: PdfCell[] = [
      { text: `${weekdayAr(d.date)} ${dmy(d.date)}`, dir: 'rtl' },
      { text: d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome], dir: 'rtl' },
    ];
    const items: { kind: string; detail: string; score: string; verdict: string; fail: boolean }[] =
      [];

    for (const r of d.recitations) {
      const s = scoreOf(r);
      items.push({
        kind: RECITATION_KIND_LABELS[r.kind],
        detail: `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`,
        score: String(s),
        verdict: ratingLabel(s, r.rating),
        fail: s < 90,
      });
    }
    for (const s of d.serd) {
      items.push({
        kind: SERD_SCOPE_LABELS[s.scope] ?? 'سرد',
        detail: `الجزء ${s.juz}`,
        score: String(s.score),
        verdict: passLabel(s.score, SARD_PASS),
        fail: s.score < SARD_PASS,
      });
    }
    for (const e of d.exams) {
      items.push({
        kind: EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار',
        detail: `الجزء ${e.juz}`,
        score: String(e.score),
        verdict: passLabel(e.score, EXAM_PASS),
        fail: e.score < EXAM_PASS,
      });
    }

    if (items.length === 0) {
      const gap = d.outcome === 'not_recited' || d.outcome === 'no_record';
      const txt =
        d.outcome === 'absent' || d.outcome === 'excused'
          ? (d.note ?? '')
          : d.note || DAY_OUTCOME_LABELS[d.outcome];
      rows.push([
        ...head,
        { text: '', dir: 'rtl' },
        { text: txt, dir: 'rtl', danger: gap },
        { text: '' },
        { text: '' },
      ]);
    } else {
      items.forEach((it, i) => {
        rows.push([
          i === 0 ? head[0] : { text: '' },
          i === 0 ? head[1] : { text: '' },
          { text: it.kind, dir: 'rtl', bold: true },
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
        meta.audience === 'parents' ? 'لا إنجاز مسجَّل في هذه الفترة.' : 'لا سجلّات في هذه الفترة.',
    });
  } else {
    sections.push({
      kind: 'table',
      title: 'السِجلّ اليوميّ',
      columns: [
        { header: 'اليوم', weight: 2.2, align: 'start' },
        { header: 'الحالة', weight: 1.3 },
        { header: 'النشاط', weight: 1.9 },
        { header: 'التفصيل', weight: 3.6, align: 'start' },
        { header: 'الدرجة ٪', weight: 1.2 },
        { header: 'التقدير', weight: 1.6 },
      ],
      rows,
    });
  }

  if (tl.serd.length > 0) {
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

  if (tl.exams.length > 0) {
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

  if (tl.tajweed.length > 0) {
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

  return sections;
}

export function buildStudentPdf(tl: StudentTimeline, meta: PdfMeta): PdfDoc {
  return {
    title: tl.name,
    subtitle: periodLabel(tl.period),
    teacher: meta.teacherName,
    sections: studentSections(tl, meta),
  };
}

/* --------------------------------------------------------------------------
   تقرير عدّة طلّاب — ورقة مستقلّة لكلّ طالب
   -------------------------------------------------------------------------- */

export function buildStudentsPdf(rep: StudentsReport, meta: PdfMeta): PdfDoc {
  if (rep.students.length === 1) return buildStudentPdf(rep.students[0], meta);

  const t = rep.totals;
  const sections: PdfSection[] = [
    {
      kind: 'stats',
      items: [
        { label: 'طالب', value: String(t.students) },
        { label: 'الحضور ٪', value: t.att.rate === null ? '—' : String(t.att.rate) },
        { label: 'وجه', value: String(t.pages) },
        { label: 'متوسّط التسميع ٪', value: t.avgScore === null ? '—' : String(t.avgScore) },
      ],
    },
    {
      kind: 'table',
      title: 'ملخّص الطلّاب',
      columns: [
        { header: '#', weight: 0.5, dir: 'ltr' },
        { header: 'اسم الطالب', weight: 4, align: 'start' },
        { header: 'الحضور ٪', weight: 1.4 },
        { header: 'الأوجه', weight: 1.2 },
        { header: 'المتوسّط ٪', weight: 1.4 },
        { header: 'سرد', weight: 1 },
        { header: 'اختبار', weight: 1.1 },
      ],
      rows: rep.students.map((s, i) => [
        num(i + 1),
        name(s.name),
        pct(s.att.rate),
        num(s.pages),
        pct(s.avgScore),
        num(s.serd.length),
        num(s.exams.length),
      ]),
    },
  ];

  // كلّ طالب يبدأ على ورقة جديدة — الفصل ضروريّ في سجلّ يُحفَظ ورقيًّا.
  for (const tl of rep.students) {
    sections.push({ kind: 'pageBreak' });
    sections.push({ kind: 'heading', text: `الطالب: ${tl.name}` });
    sections.push(...studentSections(tl, meta));
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
  const sections: PdfSection[] = [];

  if (ov.hifz.length > 0) {
    const t = ov.hifzTotals;
    sections.push({ kind: 'heading', text: 'حلقات التحفيظ' });
    sections.push({
      kind: 'stats',
      items: [
        { label: 'حلقة', value: String(t.circles) },
        { label: 'طالب', value: String(t.students) },
        { label: 'الحضور ٪', value: t.att.rate === null ? '—' : String(t.att.rate) },
        { label: 'وجه', value: String(t.pages) },
        { label: 'المتوسّط ٪', value: t.avgScore === null ? '—' : String(t.avgScore) },
      ],
    });
    sections.push({
      kind: 'table',
      columns: [
        { header: 'الحلقة', weight: 3.4, align: 'start' },
        { header: 'طلّاب', weight: 1.1 },
        { header: 'جلسات', weight: 1.2 },
        { header: 'الحضور ٪', weight: 1.4 },
        { header: 'الأوجه', weight: 1.2 },
        { header: 'المتوسّط ٪', weight: 1.4 },
        { header: 'سرد', weight: 1 },
        { header: 'اختبار', weight: 1.1 },
      ],
      rows: ov.hifz.map((c) => [
        name(c.circleName),
        num(c.studentCount),
        num(c.heldCount),
        pct(c.att.rate),
        num(c.totalPages),
        pct(c.avgScore),
        num(c.sardCount),
        num(c.examCount),
      ]),
    });
  }

  if (ov.tajweed.length > 0) {
    const t = ov.tajweedTotals;
    sections.push({ kind: 'heading', text: 'حلقات التجويد' });
    sections.push({
      kind: 'stats',
      items: [
        { label: 'حلقة', value: String(t.circles) },
        { label: 'طالب', value: String(t.students) },
        { label: 'الحضور ٪', value: t.att.rate === null ? '—' : String(t.att.rate) },
        { label: 'اختبار', value: String(t.exams) },
        { label: 'المجموع', value: t.maxScore > 0 ? `${t.achieved} / ${t.maxScore}` : '—' },
      ],
    });
    sections.push({
      kind: 'table',
      columns: [
        { header: 'الحلقة', weight: 3.6, align: 'start' },
        { header: 'طلّاب', weight: 1.2 },
        { header: 'جلسات', weight: 1.3 },
        { header: 'الحضور ٪', weight: 1.5 },
        { header: 'اختبارات', weight: 1.5 },
        { header: 'المجموع', weight: 1.9 },
      ],
      rows: ov.tajweed.map((c) => [
        name(c.circleName),
        num(c.studentCount),
        num(c.heldCount),
        pct(c.att.rate),
        num(c.exams.length),
        {
          text: c.maxScore > 0 ? `${c.achieved} / ${c.maxScore}` : '—',
          dir: 'ltr' as const,
          strong: true,
        },
      ]),
    });
  }

  if (sections.length === 0) sections.push({ kind: 'note', text: 'لم تُختَر أيّ حلقة.' });

  return {
    title: 'تقرير عامّ',
    subtitle: periodLabel(ov.period),
    teacher: meta.teacherName,
    sections,
  };
}
