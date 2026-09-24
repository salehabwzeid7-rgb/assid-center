/**
 * فحوص منصّة ويب صغيرة مشتركة — سُحبت من `IosInstallBannerComponent` بدل
 * تكرارها هناك وفي مكوّنات تصدير التقارير (كانت كلّ نسخة ستُعيد نفس منطق
 * فحص user agent بصيغة مختلفة قليلًا، وهو بالضبط ما يُصعّب صيانته لاحقًا).
 */

/**
 * iOS/iPadOS حقيقيّ (لا أندرويد، ولا سطح مكتب). iPadOS 13+ يُعرِّف نفسه
 * كـ macOS في userAgent، فيُميَّز بدعم اللمس بدل ذلك.
 */
export function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIPhoneOrIPad || isIPadOS13Plus;
}

/** مثبَّت أصلًا على الشاشة الرئيسية (PWA) — لا داخل تبويب سفاري عاديّ. */
export function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * سفاري على آيفون/آيباد داخل تبويب متصفّح عاديّ (لا مثبَّت، ولا داخل غلاف
 * Capacitor أصليّ — ذاك له مساراته الخاصّة عبر `@capacitor/share`/`Filesystem`
 * المنفصلة تمامًا عن هذا الفحص). يُستخدَم لتفضيل زرّ «مشاركة» على «تنزيل»:
 * سفاري لا يحترم دومًا خاصّية `download` مع روابط `data:`/`blob:` كما يفعل
 * كروم — أحيانًا يفتح الملفّ في تبويب جديد بدل حفظه مباشرةً، بينما واجهة
 * المشاركة الأصليّة (`navigator.share`) تعمل بثبات وتتيح الحفظ المباشر أيضًا.
 */
export function isIosSafariTab(): boolean {
  return isIosDevice() && !isStandalonePwa();
}
