/* ==========================================================================
   صياغة التقارير نصًّا — نقيّة (بلا DOM ولا Angular).

   النصّ هو أكثر مخرَجات التقرير استعمالًا عمليًّا (يُلصَق مباشرةً في تطبيقات
   المراسلة)، ويُبنى من **نفس** كائن التقرير المحسوب الذي تستهلكه الصورة
   وملفّ PDF — فلا يمكن أن تختلف الأرقام بين نسخة وأخرى.

   الأسلوب مطابق لتقرير الجلسة القائم: ترويسة، فواصل `━`، نقاط `•` — وهي
   صيغة تُعرَض جيّدًا في واتساب تحديدًا، وهو المقصد الفعليّ للنصّ.

   فرعان بجمهورين مختلفين:
     • `parents`   — موجز ومشجّع: ما أنجزه الطالب وحضوره، بلا تفاصيل داخليّة.
     • `reference` — كامل للأرشفة: كلّ يوم وكلّ رقم، بما فيه ثغرات التسجيل.

   **متكيّف بمفاتيح المحتوى** (`ActivityFlags` في meta): لا يظهر سطر ولا قسم إلّا إن اختاره
   المعلّم — الحضور · سجلّ التسميع · عدد الأوجه · السرد · الاختبارات.
   ========================================================================== */

import { dmy, weekdayAr } from './format';
import { ATTENDANCE_LABELS, EXAM_SCOPE_LABELS, SERD_SCOPE_LABELS } from './models';
import { pagesText } from './mushaf';
import { ALL_ACTIVITY, type ActivityFlags } from './report-content';
import { periodLabel } from './report-period';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  attFraction,
  fracText,
  isRecitationEntry,
  logDays,
  tallyLabel,
  type AttendanceTally,
  type CircleReport,
  type HifzCircleReport,
  type HifzStudentRow,
  type OverviewReport,
  type StudentTimeline,
  type StudentsReport,
  type TajweedCircleReport,
  type TajweedStudentRow,
} from './reports';

/** جمهور التقرير — يغيّر ما يُبرَز وما يُطوى، لا الأرقام نفسها. */
export type ReportAudience = 'parents' | 'reference';

export interface ReportTextMeta {
  teacherName: string;
  /** ترويسة المعلّم (من إعداداته) — لتقارير الأهالي فقط. */
  intro?: string;
  /** خاتمة المعلّم — لتقارير الأهالي فقط. */
  outro?: string;
  /**
   * كتلة المقرر/الإنذار (من `marksTextLines`) — تُدرَج بعد الترويسة مباشرةً
   * وقبل أرقام النشاط ليراها وليّ الأمر أوّلًا. غائبة = لا شيء يُدرَج.
   */
  marksLines?: string[];
  /** ما يدخل التقرير من النشاط — الافتراضيّ: كلّه. */
  flags?: ActivityFlags;
}

const RULE = '━━━━━━━━━━━━';

const flagsOf = (meta: ReportTextMeta): ActivityFlags => meta.flags ?? ALL_ACTIVITY;

const NO_DATA = 'لا بيانات للمحتوى المختار في هذه الفترة.';

/** يُدرِج كتلة المقرر/الإنذار (إن وُجدت) بعد الترويسة، مفصولةً بخطّ فاصل. */
function pushMarks(lines: string[], meta: ReportTextMeta): void {
  if (meta.marksLines?.length) lines.push(...meta.marksLines, RULE);
}

/** يحذف الأسطر الفارغة المتتالية الزائدة الناتجة عن أقسام مطويّة. */
function join(lines: readonly string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** سطر الحضور: «٤/٥ (٣ حاضر · ١ متأخّر · ١ غائب)» — الكسر أوّلًا ثمّ التفصيل. */
function attLine(att: AttendanceTally, held: number): string {
  const frac = attFraction(att, held);
  if (frac === '—') return 'الحضور: لا سجلّ حضور';
  // طالب بلا أيّ سجلّ في جلسات منعقدة: «٠/٥» وحدها تكفي، بلا تفصيل فارغ.
  return att.recorded === 0 ? `الحضور: ${frac}` : `الحضور: ${frac} (${tallyLabel(att)})`;
}

/** «١٨ / ٢٠» — العلامة الفعليّة لاختبار التجويد، بلا نسبة مئويّة. */
function rawScore(score: number | null, total: number): string {
  return score === null ? `— / ${total}` : `${score} / ${total}`;
}

/** «الأوجه: ١٠ أوجه وربع» — أوجه الحفظ الجديد الناجح بلا تكرار. */
const pagesLine = (pages: number): string => `الأوجه: ${pagesText(pages, true)}`;

/* --------------------------------------------------------------------------
   تقرير الحلقة
   -------------------------------------------------------------------------- */

function hifzStudentLines(
  row: HifzStudentRow,
  audience: ReportAudience,
  f: ActivityFlags,
): string[] {
  const out: string[] = [`• ${row.name}`];
  if (f.attendance) out.push(`  ${attLine(row.att, row.held)}`);
  if (f.pages) out.push(`  ${pagesLine(row.pages)}`);
  if (f.recitation) {
    out.push(
      row.recitationCount > 0
        ? `  التسميع: ${row.recitationCount} · متوسّط ${row.avgScore ?? '—'}٪`
        : '  التسميع: لا تسميع في هذه الفترة',
    );
  }
  if (f.serd && row.sardCount > 0) out.push(`  السرد: ${row.sardCount} (ناجح ${row.sardPassed})`);
  if (f.exams && row.examCount > 0) {
    out.push(`  الاختبارات: ${row.examCount} (ناجح ${row.examPassed})`);
  }

  if (audience === 'reference' && (f.attendance || f.recitation)) {
    if (row.idleDays > 0) {
      const unlogged = row.unloggedDays > 0 ? ` (منها ${row.unloggedDays} بلا تسجيل)` : '';
      out.push(`  أيّام حضور بلا إنجاز: ${row.idleDays}${unlogged}`);
    }
    if (row.daysSinceActivity === null) out.push('  ⚠ لا نشاط مسجَّل إطلاقًا');
    else if (row.daysSinceActivity >= INACTIVE_DAYS)
      out.push(`  ⚠ آخر نشاط منذ ${row.daysSinceActivity} يومًا`);
  }
  return out;
}

function tajweedStudentLines(
  row: TajweedStudentRow,
  audience: ReportAudience,
  f: ActivityFlags,
): string[] {
  const out: string[] = [`• ${row.name}`];
  if (f.attendance) out.push(`  ${attLine(row.att, row.held)}`);
  if (!f.exams) return out;

  if (row.cells.length === 0) {
    out.push('  لا اختبارات في هذه الفترة');
    return out;
  }
  for (const c of row.cells) {
    const mark =
      c.score === null ? 'لم يُختبَر' : `${rawScore(c.score, c.totalScore)} — ${c.verdict}`;
    out.push(`  ${c.examName} (${dmy(c.date)}): ${mark}`);
    if (audience === 'reference' && c.notes) out.push(`    ملاحظة: ${c.notes}`);
  }
  if (row.sat > 1) out.push(`  المجموع: ${row.achieved} / ${row.maxScore}`);
  if (audience === 'reference' && row.missed > 0)
    out.push(`  ⚠ لم تُسجَّل نتيجته في ${row.missed} اختبار`);
  return out;
}

function hifzHeaderLines(
  rep: HifzCircleReport,
  audience: ReportAudience,
  f: ActivityFlags,
): string[] {
  const out: string[] = [];
  if (f.attendance) {
    out.push(
      `الجلسات: ${rep.heldCount}${rep.sessionCount > rep.heldCount ? ` من ${rep.sessionCount}` : ''}`,
      `الحضور العامّ: ${fracText(rep.attFrac)}`,
    );
  }
  if (f.pages) out.push(`أوجه الحفظ الجديد: ${pagesText(rep.totalPages, true)}`);
  if (f.recitation && rep.avgScore !== null) out.push(`متوسّط التسميع: ${rep.avgScore}٪`);
  if (f.serd && rep.sardCount) out.push(`السرد: ${rep.sardCount}`);
  if (f.exams && rep.examCount) out.push(`الاختبارات: ${rep.examCount}`);
  if (audience === 'reference' && (f.attendance || f.recitation) && rep.studentsWithGaps > 0) {
    out.push(`طلّاب لهم أيّام حضور بلا إنجاز: ${rep.studentsWithGaps}`);
  }
  return out;
}

function tajweedHeaderLines(rep: TajweedCircleReport, f: ActivityFlags): string[] {
  const out: string[] = [];
  if (f.attendance) {
    out.push(
      `الجلسات: ${rep.heldCount}${rep.sessionCount > rep.heldCount ? ` من ${rep.sessionCount}` : ''}`,
      `الحضور العامّ: ${fracText(rep.attFrac)}`,
    );
  }
  if (f.exams) {
    out.push(`الاختبارات: ${rep.exams.length}`);
    if (rep.maxScore > 0) out.push(`مجموع علامات الحلقة: ${rep.achieved} / ${rep.maxScore}`);
  }
  return out;
}

/** تقرير حلقة كاملة نصًّا — يختار الفرع تلقائيًّا بحسب نوع الحلقة. */
export function circleReportText(
  rep: CircleReport,
  meta: ReportTextMeta,
  audience: ReportAudience = 'parents',
): string {
  const parents = audience === 'parents';
  const f = flagsOf(meta);
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 ${rep.circleTitle}`, periodLabel(rep.period));
  if (meta.teacherName) lines.push(`معلّم الحلقة: ${meta.teacherName}`);
  lines.push(RULE);
  pushMarks(lines, meta);

  const header =
    rep.kind === 'hifz' ? hifzHeaderLines(rep, audience, f) : tajweedHeaderLines(rep, f);
  if (header.length > 0) lines.push(...header, RULE);
  lines.push('');

  const tajweedHasContent = f.attendance || f.exams;
  if (rep.kind === 'tajweed' && !tajweedHasContent) {
    lines.push(NO_DATA);
  } else if (rep.rows.length === 0) {
    lines.push('لا طلّاب مسجَّلون في هذه الفترة.');
  } else if (rep.kind === 'hifz') {
    lines.push(rep.rows.map((r) => hifzStudentLines(r, audience, f).join('\n')).join('\n\n'));
  } else {
    lines.push(rep.rows.map((r) => tajweedStudentLines(r, audience, f).join('\n')).join('\n\n'));
  }

  if (
    audience === 'reference' &&
    rep.kind === 'hifz' &&
    (f.attendance || f.recitation) &&
    rep.inactiveStudents.length > 0
  ) {
    lines.push('', RULE, `⚠ منقطعون (${INACTIVE_DAYS} يومًا فأكثر):`);
    for (const r of rep.inactiveStudents) {
      const since =
        r.daysSinceActivity === null ? 'لا نشاط إطلاقًا' : `منذ ${r.daysSinceActivity} يومًا`;
      lines.push(`• ${r.name} — ${since}`);
    }
  }

  if (parents && meta.outro?.trim()) lines.push('', RULE, meta.outro.trim());
  return join(lines);
}

/* --------------------------------------------------------------------------
   سِجلّ الطالب
   -------------------------------------------------------------------------- */

/**
 * سطور يوم واحد. مع «سجلّ التسميع» تُعرَض محاولاته؛ مع «الحضور» تُعرَض حالة اليوم؛
 * ومع الاثنين معًا الحالة ثمّ محاولاتها — فلا يظهر سطر لم يختره المعلّم.
 */
function dayLines(
  d: StudentTimeline['days'][number],
  audience: ReportAudience,
  f: ActivityFlags,
  showRecitation: boolean,
): string[] {
  const head = f.attendance
    ? `${weekdayAr(d.date)} ${dmy(d.date)} — ${
        d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome]
      }`
    : `${weekdayAr(d.date)} ${dmy(d.date)}`;
  const out = [head];

  if (!showRecitation) {
    if (d.note) out.push(`  ملاحظة: ${d.note}`);
    return out;
  }

  // كلّ محاولة سطر بترتيبها الزمنيّ؛ تُرقَّم حين تتعدّد في اليوم نفسه.
  const entries = d.entries.filter(isRecitationEntry);
  const multi = entries.length > 1;
  entries.forEach((e, i) => {
    const n = multi ? `${i + 1}. ` : '';
    const note = e.note ? ` — ${e.note}` : '';
    if (e.kind === 'recitation' && e.rec) {
      const r = e.rec;
      out.push(`  ${n}${e.label}: ${e.score}٪ (${e.verdict}) [${e.detail}]${note}`);
      if (audience === 'reference' && (r.hifzErrors || r.tajweedErrors || r.promptCount)) {
        out.push(`    خطأ ${r.hifzErrors} · تجويد ${r.tajweedErrors} · تردّد ${r.promptCount}`);
      }
    } else {
      out.push(`  ${n}${e.label}${note}`);
    }
  });
  if (entries.length === 0) {
    // لا نكتب «لم يسمّع» لغائب — الغياب وحده يكفي، وإلّا بدا كأنّه تقصير إضافيّ.
    if (f.attendance && d.outcome !== 'absent' && d.outcome !== 'excused') {
      out.push(`  ${d.note || DAY_OUTCOME_LABELS[d.outcome]}`);
    }
  } else if (d.note) {
    out.push(`  ملاحظة: ${d.note}`);
  }
  return out;
}

/** سِجلّ طالب واحد نصًّا — موجز للأهالي، أو يوميّ كامل للأرشيف المرجعيّ. */
export function studentTimelineText(
  tl: StudentTimeline,
  meta: ReportTextMeta,
  audience: ReportAudience = 'parents',
): string {
  const parents = audience === 'parents';
  const f = flagsOf(meta);
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 تقرير الطالب: ${tl.name}`, periodLabel(tl.period));
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE);
  pushMarks(lines, meta);

  const summary: string[] = [];
  if (f.attendance) summary.push(attLine(tl.att, tl.held));
  if (tl.hasHifz) {
    if (f.pages) summary.push(`أوجه الحفظ الجديد: ${pagesText(tl.pages, true)}`);
    if (f.recitation && tl.avgScore !== null) summary.push(`متوسّط التسميع: ${tl.avgScore}٪`);
  }
  if (f.serd && tl.serd.length) summary.push(`السرد: ${tl.serd.length}`);
  if (f.exams && tl.exams.length) summary.push(`اختبارات الأجزاء: ${tl.exams.length}`);
  if (f.exams && tl.tajweed.length) {
    const achieved = tl.tajweed.reduce((a, c) => a + (c.score ?? 0), 0);
    const max = tl.tajweed.reduce((a, c) => a + c.totalScore, 0);
    summary.push(`اختبارات التجويد: ${tl.tajweed.length} — ${achieved} / ${max}`);
  }
  if (summary.length > 0) lines.push(...summary, RULE);
  lines.push('');

  // ---- السِجلّ اليوميّ ----
  const showRecitation = f.recitation && tl.hasHifz;
  let body = 0;
  if (f.attendance || showRecitation) {
    const days = logDays(tl, audience, f);
    if (days.length === 0) {
      lines.push(
        tl.days.length === 0 || !parents
          ? 'لا سجلّات في هذه الفترة.'
          : 'لا إنجاز مسجَّل في هذه الفترة.',
      );
    } else {
      lines.push(days.map((d) => dayLines(d, audience, f, showRecitation).join('\n')).join('\n\n'));
    }
    body++;
  }

  if (f.serd && tl.serd.length) {
    lines.push('', RULE, 'السرد:');
    for (const s of tl.serd) {
      const juz = s.scope === 'block' ? (s.juzList ?? [s.juz]).join('، ') : s.juz;
      lines.push(`• ${dmy(s.date)} — ${SERD_SCOPE_LABELS[s.scope] ?? 'سرد'} (${juz}): ${s.score}٪`);
    }
    body++;
  }
  if (f.exams && tl.exams.length) {
    lines.push('', RULE, 'اختبارات الأجزاء:');
    for (const e of tl.exams) {
      const juz = e.scope === 'block' ? (e.juzList ?? [e.juz]).join('، ') : e.juz;
      lines.push(
        `• ${dmy(e.date)} — ${EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار'} (${juz}): ${e.score}٪`,
      );
    }
    body++;
  }
  if (f.exams && tl.tajweed.length) {
    lines.push('', RULE, 'اختبارات التجويد:');
    for (const c of tl.tajweed) {
      lines.push(
        `• ${c.examName} (${dmy(c.date)}): ${rawScore(c.score, c.totalScore)} — ${c.verdict}`,
      );
    }
    body++;
  }
  if (body === 0 && summary.length === 0) lines.push(NO_DATA);

  if (parents && meta.outro?.trim()) lines.push('', RULE, meta.outro.trim());
  return join(lines);
}

/* --------------------------------------------------------------------------
   التقرير العامّ (عدّة حلقات)
   -------------------------------------------------------------------------- */

/** ملخّص عدّة حلقات نصًّا — مع فصل صارم بين إجماليّ التحفيظ وإجماليّ التجويد. */
export function overviewReportText(ov: OverviewReport, meta: ReportTextMeta): string {
  const f = flagsOf(meta);
  const lines: string[] = [`📋 تقرير عامّ`, periodLabel(ov.period)];
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE);
  pushMarks(lines, meta);
  lines.push('');

  let body = 0;
  if (ov.hifz.length > 0) {
    const t = ov.hifzTotals;
    lines.push(`◈ حلقات التحفيظ (${t.circles})`);
    lines.push(
      f.attendance
        ? `  الطلّاب: ${t.students} · الجلسات: ${t.heldSessions}`
        : `  الطلّاب: ${t.students}`,
    );
    if (f.attendance) lines.push(`  الحضور: ${fracText(t.attFrac)}`);
    if (f.pages) lines.push(`  أوجه الحفظ الجديد: ${pagesText(t.pages, true)}`);
    if (f.recitation && t.avgScore !== null) lines.push(`  متوسّط التسميع: ${t.avgScore}٪`);
    const sx: string[] = [];
    if (f.serd) sx.push(`السرد: ${t.sardCount}`);
    if (f.exams) sx.push(`الاختبارات: ${t.examCount}`);
    if (sx.length > 0) lines.push(`  ${sx.join(' · ')}`);
    lines.push('');
    for (const c of ov.hifz) {
      const parts: string[] = [`${c.studentCount} طالب`];
      if (f.attendance) parts.push(`حضور ${fracText(c.attFrac)}`);
      if (f.pages) parts.push(pagesText(c.totalPages, true));
      if (f.recitation && c.avgScore !== null) parts.push(`متوسّط ${c.avgScore}٪`);
      lines.push(`  • ${c.circleName}: ${parts.join(' · ')}`);
    }
    lines.push('');
    body++;
  }

  if (ov.tajweed.length > 0 && (f.attendance || f.exams)) {
    const t = ov.tajweedTotals;
    lines.push(RULE, `◈ حلقات التجويد (${t.circles})`);
    lines.push(
      f.attendance
        ? `  الطلّاب: ${t.students} · الجلسات: ${t.heldSessions}`
        : `  الطلّاب: ${t.students}`,
    );
    if (f.attendance) lines.push(`  الحضور: ${fracText(t.attFrac)}`);
    if (f.exams) {
      lines.push(`  الاختبارات: ${t.exams}`);
      if (t.maxScore > 0) lines.push(`  مجموع العلامات: ${t.achieved} / ${t.maxScore}`);
    }
    lines.push('');
    for (const c of ov.tajweed) {
      const parts: string[] = [`${c.studentCount} طالب`];
      if (f.attendance) parts.push(`حضور ${fracText(c.attFrac)}`);
      if (f.exams) {
        parts.push(`${c.exams.length} اختبار`);
        if (c.maxScore > 0) parts.push(`${c.achieved} / ${c.maxScore}`);
      }
      lines.push(`  • ${c.circleName}: ${parts.join(' · ')}`);
    }
    body++;
  }

  if (ov.hifz.length === 0 && ov.tajweed.length === 0) lines.push('لم تُختَر أيّ حلقة.');
  else if (body === 0) lines.push(NO_DATA);
  return join(lines);
}

/* --------------------------------------------------------------------------
   تقرير عدّة طلّاب
   -------------------------------------------------------------------------- */

/**
 * تقرير مجموعة طلّاب نصًّا — ملخّص جماعيّ ثمّ سِجلّ كلّ طالب.
 * لطالب واحد يُختصَر إلى `studentTimelineText` مباشرةً بلا ترويسة جماعيّة
 * زائدة، فالملخّص الجماعيّ لشخص واحد تكرار بلا فائدة.
 */
export function studentsReportText(
  rep: StudentsReport,
  meta: ReportTextMeta,
  audience: ReportAudience = 'parents',
): string {
  if (rep.students.length === 1) return studentTimelineText(rep.students[0], meta, audience);

  const parents = audience === 'parents';
  const f = flagsOf(meta);
  const t = rep.totals;
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 تقرير ${t.students} طلّاب`, periodLabel(rep.period));
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE);
  pushMarks(lines, meta);

  const summary: string[] = [];
  if (f.attendance) summary.push(`الحضور العامّ: ${fracText(t.attFrac)}`);
  if (t.hasHifz) {
    if (f.pages) summary.push(`أوجه الحفظ الجديد: ${pagesText(t.pages, true)}`);
    if (f.recitation && t.avgScore !== null) summary.push(`متوسّط التسميع: ${t.avgScore}٪`);
  }
  if (f.serd && t.sardCount) summary.push(`السرد: ${t.sardCount}`);
  if (f.exams && t.examCount) summary.push(`اختبارات الأجزاء: ${t.examCount}`);
  if (f.exams && t.tajweedCount) {
    summary.push(`اختبارات التجويد: ${t.tajweedCount} — ${t.tajweedAchieved} / ${t.tajweedMax}`);
  }
  if (summary.length > 0) lines.push(...summary, RULE);
  lines.push('');

  for (const tl of rep.students) {
    // ترويسة المعلّم وخاتمته مرّة واحدة في الأعلى/الأسفل، لا مع كلّ طالب.
    lines.push(studentTimelineText(tl, { teacherName: '', flags: f }, audience), '', RULE, '');
  }

  if (parents && meta.outro?.trim()) lines.push(meta.outro.trim());
  return join(lines);
}
