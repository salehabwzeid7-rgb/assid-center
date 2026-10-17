/* ==========================================================================
   محتوى التقرير — ما يختاره المعلّم ليدخل التقرير. طبقة نقيّة.

   سبعة مفاتيح مستقلّة، تُركَّب بأيّ تركيبة (واحد على الأقلّ):
     الحضور · سجلّ التسميع · عدد الأوجه · السرد · الاختبارات · المقرر · الإنذارات

   الخمسة الأولى «نشاط» تبنيه `reports.ts` وتعرضه مخرَجات النصّ وPDF والصورة بحسب
   المفاتيح؛ والأخيران علامات مؤقّتة (راجع report-marks.ts). المخرَجات الثلاثة تُبنى من
   المفاتيح نفسها فيتّسق ما يظهر في كلٍّ منها مهما كانت التركيبة.
   ========================================================================== */

/** مفاتيح النشاط — ما تحسبه طبقة التقارير من السجلّات. */
export interface ActivityFlags {
  /** الحضور (كسرًا «٨/١٠») وجلسات الحلقة. */
  attendance: boolean;
  /** سجلّ التسميع: متوسّط الدرجات والسِجلّ اليوميّ للمحاولات. */
  recitation: boolean;
  /** عدد أوجه الحفظ الجديد الناجح بلا تكرار (مصحف المدينة). */
  pages: boolean;
  /** سجلّ السرد. */
  serd: boolean;
  /** الاختبارات: اختبارات الأجزاء واختبارات التجويد. */
  exams: boolean;
}

/** المحتوى الكامل: النشاط + العلامات المؤقّتة. */
export interface ReportContent extends ActivityFlags {
  course: boolean;
  warnings: boolean;
}

/** كلّ النشاط — الافتراض عند غياب اختيار صريح (أمثلة الاختبار وتوافق الاستدعاءات). */
export const ALL_ACTIVITY: ActivityFlags = {
  attendance: true,
  recitation: true,
  pages: true,
  serd: true,
  exams: true,
};

/** ما يُفعَّل ابتداءً: الحضور والتسميع والأوجه. السرد والاختبارات يضيفها المعلّم بنفسه. */
export const DEFAULT_ACTIVITY: ActivityFlags = {
  attendance: true,
  recitation: true,
  pages: true,
  serd: false,
  exams: false,
};

export const ACTIVITY_LABELS: Record<keyof ActivityFlags, string> = {
  attendance: 'الحضور',
  recitation: 'سجلّ التسميع',
  pages: 'عدد الأوجه',
  serd: 'السرد',
  exams: 'الاختبارات',
};

export const hasActivity = (c: ActivityFlags): boolean =>
  c.attendance || c.recitation || c.pages || c.serd || c.exams;

export const hasMarksContent = (c: Pick<ReportContent, 'course' | 'warnings'>): boolean =>
  c.course || c.warnings;

export const activityOf = (c: ReportContent): ActivityFlags => ({
  attendance: c.attendance,
  recitation: c.recitation,
  pages: c.pages,
  serd: c.serd,
  exams: c.exams,
});
