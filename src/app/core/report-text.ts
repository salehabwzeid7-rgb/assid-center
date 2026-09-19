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
   ========================================================================== */

import { dmy, weekdayAr } from './format';
import {
  ATTENDANCE_LABELS,
  EXAM_SCOPE_LABELS,
  RECITATION_KIND_LABELS,
  SARD_PASS,
  EXAM_PASS,
  SERD_SCOPE_LABELS,
  passLabel,
  ratingLabel,
  scoreOf,
} from './models';
import { surahName } from './quran-data';
import { periodLabel } from './report-period';
import {
  DAY_OUTCOME_LABELS,
  INACTIVE_DAYS,
  tallyLabel,
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
}

const RULE = '━━━━━━━━━━━━';

/** يحذف الأسطر الفارغة المتتالية الزائدة الناتجة عن أقسام مطويّة. */
function join(lines: readonly string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** «٥ أوجه» / «وجه واحد» / «وجهان» — صياغة عربيّة سليمة للعدد. */
function pagesLabel(n: number): string {
  if (n === 0) return 'لا أوجه';
  if (n === 1) return 'وجه واحد';
  if (n === 2) return 'وجهان';
  return `${n} أوجه`;
}

/** «١٨ / ٢٠» — العلامة الفعليّة لاختبار التجويد، بلا نسبة مئويّة. */
function rawScore(score: number | null, total: number): string {
  return score === null ? `— / ${total}` : `${score} / ${total}`;
}

/* --------------------------------------------------------------------------
   تقرير الحلقة
   -------------------------------------------------------------------------- */

function hifzStudentLines(row: HifzStudentRow, audience: ReportAudience): string[] {
  const out: string[] = [`• ${row.name}`];
  out.push(`  الحضور: ${tallyLabel(row.att)}${row.att.rate === null ? '' : ` (${row.att.rate}٪)`}`);

  if (row.recitationCount > 0) {
    const score = row.avgScore === null ? '' : ` — متوسّط ${row.avgScore}٪`;
    out.push(`  التسميع: ${pagesLabel(row.pages)}${score}`);
    if (row.newPages > 0) out.push(`  منها حفظ جديد: ${pagesLabel(row.newPages)}`);
  } else {
    out.push('  التسميع: لا تسميع في هذه الفترة');
  }

  if (row.sardCount > 0) out.push(`  السرد: ${row.sardCount} (ناجح ${row.sardPassed})`);
  if (row.examCount > 0) out.push(`  الاختبارات: ${row.examCount} (ناجح ${row.examPassed})`);

  if (audience === 'reference') {
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

function tajweedStudentLines(row: TajweedStudentRow, audience: ReportAudience): string[] {
  const out: string[] = [`• ${row.name}`];
  out.push(`  الحضور: ${tallyLabel(row.att)}${row.att.rate === null ? '' : ` (${row.att.rate}٪)`}`);

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

function hifzHeaderLines(rep: HifzCircleReport, audience: ReportAudience): string[] {
  const out = [
    `الجلسات: ${rep.heldCount}${rep.sessionCount > rep.heldCount ? ` من ${rep.sessionCount}` : ''}`,
    `الحضور العامّ: ${rep.att.rate === null ? '—' : rep.att.rate + '٪'}`,
    `مجموع الأوجه: ${rep.totalPages}${rep.totalNewPages ? ` (حفظ جديد ${rep.totalNewPages})` : ''}`,
  ];
  if (rep.avgScore !== null) out.push(`متوسّط التسميع: ${rep.avgScore}٪`);
  if (rep.sardCount) out.push(`السرد: ${rep.sardCount}`);
  if (rep.examCount) out.push(`الاختبارات: ${rep.examCount}`);
  if (audience === 'reference' && rep.studentsWithGaps > 0)
    out.push(`طلّاب لهم أيّام حضور بلا إنجاز: ${rep.studentsWithGaps}`);
  return out;
}

function tajweedHeaderLines(rep: TajweedCircleReport): string[] {
  const out = [
    `الجلسات: ${rep.heldCount}${rep.sessionCount > rep.heldCount ? ` من ${rep.sessionCount}` : ''}`,
    `الحضور العامّ: ${rep.att.rate === null ? '—' : rep.att.rate + '٪'}`,
    `الاختبارات: ${rep.exams.length}`,
  ];
  if (rep.maxScore > 0) out.push(`مجموع علامات الحلقة: ${rep.achieved} / ${rep.maxScore}`);
  return out;
}

/** تقرير حلقة كاملة نصًّا — يختار الفرع تلقائيًّا بحسب نوع الحلقة. */
export function circleReportText(
  rep: CircleReport,
  meta: ReportTextMeta,
  audience: ReportAudience = 'parents',
): string {
  const parents = audience === 'parents';
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 ${rep.circleTitle}`, periodLabel(rep.period));
  if (meta.teacherName) lines.push(`معلّم الحلقة: ${meta.teacherName}`);
  lines.push(RULE);

  lines.push(...(rep.kind === 'hifz' ? hifzHeaderLines(rep, audience) : tajweedHeaderLines(rep)));
  lines.push(RULE, '');

  if (rep.rows.length === 0) {
    lines.push('لا طلّاب مسجَّلون في هذه الفترة.');
  } else if (rep.kind === 'hifz') {
    lines.push(rep.rows.map((r) => hifzStudentLines(r, audience).join('\n')).join('\n\n'));
  } else {
    lines.push(rep.rows.map((r) => tajweedStudentLines(r, audience).join('\n')).join('\n\n'));
  }

  if (audience === 'reference' && rep.kind === 'hifz' && rep.inactiveStudents.length > 0) {
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

function dayLines(d: StudentTimeline['days'][number], audience: ReportAudience): string[] {
  const head = `${weekdayAr(d.date)} ${dmy(d.date)} — ${
    d.status ? ATTENDANCE_LABELS[d.status] : DAY_OUTCOME_LABELS[d.outcome]
  }`;
  const out = [head];

  for (const r of d.recitations) {
    const range = `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`;
    const score = scoreOf(r);
    out.push(
      `  ${RECITATION_KIND_LABELS[r.kind]}: ${pagesLabel(r.pages)} — ${score}٪ (${ratingLabel(score, r.rating)}) [${range}]`,
    );
    if (audience === 'reference' && (r.hifzErrors || r.tajweedErrors || r.promptCount)) {
      out.push(`    خطأ ${r.hifzErrors} · تجويد ${r.tajweedErrors} · تردّد ${r.promptCount}`);
    }
  }
  for (const s of d.serd) {
    const scope = SERD_SCOPE_LABELS[s.scope] ?? 'سرد';
    out.push(`  ${scope} — الجزء ${s.juz}: ${s.score}٪ (${passLabel(s.score, SARD_PASS)})`);
  }
  for (const e of d.exams) {
    const scope = EXAM_SCOPE_LABELS[e.scope ?? 'juz'] ?? 'اختبار';
    out.push(`  ${scope} — الجزء ${e.juz}: ${e.score}٪ (${passLabel(e.score, EXAM_PASS)})`);
  }
  if (d.recitations.length === 0 && d.serd.length === 0 && d.exams.length === 0) {
    // لا نكتب «لم يسمّع» لغائب — الغياب وحده يكفي، وإلّا بدا كأنّه تقصير إضافيّ.
    if (d.outcome !== 'absent' && d.outcome !== 'excused') {
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
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 تقرير الطالب: ${tl.name}`, periodLabel(tl.period));
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE);

  lines.push(`الحضور: ${tallyLabel(tl.att)}${tl.att.rate === null ? '' : ` (${tl.att.rate}٪)`}`);
  lines.push(`مجموع الأوجه: ${tl.pages}${tl.newPages ? ` (حفظ جديد ${tl.newPages})` : ''}`);
  if (tl.avgScore !== null) lines.push(`متوسّط التسميع: ${tl.avgScore}٪`);
  if (tl.serd.length) lines.push(`السرد: ${tl.serd.length}`);
  if (tl.exams.length) lines.push(`اختبارات الأجزاء: ${tl.exams.length}`);
  if (tl.tajweed.length) {
    const achieved = tl.tajweed.reduce((a, c) => a + (c.score ?? 0), 0);
    const max = tl.tajweed.reduce((a, c) => a + c.totalScore, 0);
    lines.push(`اختبارات التجويد: ${tl.tajweed.length} — ${achieved} / ${max}`);
  }
  lines.push(RULE, '');

  if (tl.days.length === 0) {
    lines.push('لا سجلّات في هذه الفترة.');
  } else {
    // الأهالي: الأيّام المُنجَزة فقط — قائمة غياب طويلة ليست تقريرًا للأهل.
    const days = parents
      ? tl.days.filter((d) => d.recitations.length || d.serd.length || d.exams.length)
      : tl.days;
    if (days.length === 0) lines.push('لا إنجاز مسجَّل في هذه الفترة.');
    else lines.push(days.map((d) => dayLines(d, audience).join('\n')).join('\n\n'));
  }

  if (tl.tajweed.length) {
    lines.push('', RULE, 'اختبارات التجويد:');
    for (const c of tl.tajweed) {
      lines.push(
        `• ${c.examName} (${dmy(c.date)}): ${rawScore(c.score, c.totalScore)} — ${c.verdict}`,
      );
    }
  }

  if (parents && meta.outro?.trim()) lines.push('', RULE, meta.outro.trim());
  return join(lines);
}

/* --------------------------------------------------------------------------
   التقرير العامّ (عدّة حلقات)
   -------------------------------------------------------------------------- */

/** ملخّص عدّة حلقات نصًّا — مع فصل صارم بين إجماليّ التحفيظ وإجماليّ التجويد. */
export function overviewReportText(ov: OverviewReport, meta: ReportTextMeta): string {
  const lines: string[] = [`📋 تقرير عامّ`, periodLabel(ov.period)];
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE, '');

  if (ov.hifz.length > 0) {
    const t = ov.hifzTotals;
    lines.push(`◈ حلقات التحفيظ (${t.circles})`);
    lines.push(`  الطلّاب: ${t.students} · الجلسات: ${t.heldSessions}`);
    lines.push(`  الحضور: ${t.att.rate === null ? '—' : t.att.rate + '٪'}`);
    lines.push(`  الأوجه: ${t.pages}${t.newPages ? ` (حفظ جديد ${t.newPages})` : ''}`);
    if (t.avgScore !== null) lines.push(`  متوسّط التسميع: ${t.avgScore}٪`);
    if (t.sardCount || t.examCount)
      lines.push(`  السرد: ${t.sardCount} · الاختبارات: ${t.examCount}`);
    lines.push('');
    for (const c of ov.hifz) {
      const avgTxt = c.avgScore === null ? '' : ` · متوسّط ${c.avgScore}٪`;
      lines.push(
        `  • ${c.circleName}: ${c.studentCount} طالب · حضور ${c.att.rate ?? '—'}٪ · ${c.totalPages} وجه${avgTxt}`,
      );
    }
    lines.push('');
  }

  if (ov.tajweed.length > 0) {
    const t = ov.tajweedTotals;
    lines.push(RULE, `◈ حلقات التجويد (${t.circles})`);
    lines.push(`  الطلّاب: ${t.students} · الجلسات: ${t.heldSessions}`);
    lines.push(`  الحضور: ${t.att.rate === null ? '—' : t.att.rate + '٪'}`);
    lines.push(`  الاختبارات: ${t.exams}`);
    if (t.maxScore > 0) lines.push(`  مجموع العلامات: ${t.achieved} / ${t.maxScore}`);
    lines.push('');
    for (const c of ov.tajweed) {
      const marks = c.maxScore > 0 ? ` · ${c.achieved} / ${c.maxScore}` : '';
      lines.push(
        `  • ${c.circleName}: ${c.studentCount} طالب · حضور ${c.att.rate ?? '—'}٪ · ${c.exams.length} اختبار${marks}`,
      );
    }
  }

  if (ov.hifz.length === 0 && ov.tajweed.length === 0) lines.push('لم تُختَر أيّ حلقة.');
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
  const t = rep.totals;
  const lines: string[] = [];

  if (parents && meta.intro?.trim()) lines.push(meta.intro.trim(), '');
  lines.push(`📋 تقرير ${t.students} طلّاب`, periodLabel(rep.period));
  if (meta.teacherName) lines.push(`المعلّم: ${meta.teacherName}`);
  lines.push(RULE);

  lines.push(`الحضور العامّ: ${t.att.rate === null ? '—' : t.att.rate + '٪'}`);
  if (t.pages > 0 || t.avgScore !== null) {
    lines.push(`مجموع الأوجه: ${t.pages}${t.newPages ? ` (حفظ جديد ${t.newPages})` : ''}`);
    if (t.avgScore !== null) lines.push(`متوسّط التسميع: ${t.avgScore}٪`);
  }
  if (t.sardCount) lines.push(`السرد: ${t.sardCount}`);
  if (t.examCount) lines.push(`اختبارات الأجزاء: ${t.examCount}`);
  if (t.tajweedCount) {
    lines.push(`اختبارات التجويد: ${t.tajweedCount} — ${t.tajweedAchieved} / ${t.tajweedMax}`);
  }
  lines.push(RULE, '');

  for (const tl of rep.students) {
    // ترويسة المعلّم وخاتمته مرّة واحدة في الأعلى/الأسفل، لا مع كلّ طالب.
    lines.push(studentTimelineText(tl, { teacherName: '' }, audience), '', RULE, '');
  }

  if (parents && meta.outro?.trim()) lines.push(meta.outro.trim());
  return join(lines);
}
