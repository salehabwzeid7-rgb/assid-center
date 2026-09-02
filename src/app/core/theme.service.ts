import { Injectable, signal } from '@angular/core';

/* ==========================================================================
   إدارة سمات الواجهة — أسماء ومنطق بالإنجليزية، ونصوص المستخدم بالعربية.
   ── القسم الأول: ثيمات قياسية (تغيّر الألوان فقط).
   ── القسم الثاني: ثيمات احترافية «كاملة السطح» (تغيّر خلفية التطبيق بالكامل
      بتدرّجات غنيّة + أسطح زجاجية).
   ========================================================================== */

/** ثيمات قياسية */
export const STANDARD_THEMES = [
  'default',
  'heritage',
  'sakina',
  'mihrab',
  'rawda',
  'noor',
  'azraq',
  'idara',
  'fayrouz',
  'layl',
  'kahraman',
  'zumurrud',
] as const;

/** ثيمات احترافية كاملة السطح */
export const FULL_SURFACE_THEMES = [
  'obsidian',
  'charcoal',
  'gunmetal',
  'icenavy',
  'espresso',
  'emerald',
  'titanium',
  'ember',
] as const;

/**
 * ثيمات فاخرة «كاملة السطح» مع تأطير غنيّ:
 * تغيّر خلفية التطبيق كليًّا وتحيط البطاقات والأزرار والتواريخ بإطارات ذهبية/برونزية/فضّية.
 */
export const LUXURY_THEMES = [
  // بيضاء فاخرة
  'snowgold',
  'pearlobsidian',
  'platinumtitan',
  'ivorybronze',
  // سوداء فاخرة
  'obsidianroyal',
  'charcoalsilver',
  'espressobronze',
  'cybergold',
  // إضافية فاخرة
  'desertgold',
  'emeraldroyal',
] as const;

export type AppTheme =
  | (typeof STANDARD_THEMES)[number]
  | (typeof FULL_SURFACE_THEMES)[number]
  | (typeof LUXURY_THEMES)[number];

/** ترتيب التدوير الكامل (زر 🎨) */
export const THEME_ORDER: AppTheme[] = [
  ...STANDARD_THEMES,
  ...FULL_SURFACE_THEMES,
  ...LUXURY_THEMES,
];

const FULL_SURFACE_SET = new Set<string>([...FULL_SURFACE_THEMES, ...LUXURY_THEMES]);
const LUXURY_SET = new Set<string>(LUXURY_THEMES);

/** هل السمة تحوّل خلفية التطبيق بالكامل؟ (كاملة السطح أو فاخرة) */
export function isFullSurface(t: AppTheme): boolean {
  return FULL_SURFACE_SET.has(t);
}

/** هل السمة من المجموعة الفاخرة (إطارات + تأطير)؟ */
export function isLuxury(t: AppTheme): boolean {
  return LUXURY_SET.has(t);
}

/** عناوين الأقسام في شاشة الإعدادات */
export const THEME_GROUP_LABELS = {
  standard: 'الثيمات القياسية',
  full: 'الثيمات الاحترافية المتقدّمة',
  luxury: 'الثيمات الفاخرة الاحترافية',
} as const;

/** تقسيم الثيمات الفاخرة إلى ثلاث فئات داخل قسمها */
export const LUXURY_THEME_GROUPS: readonly {
  key: string;
  label: string;
  themes: readonly AppTheme[];
}[] = [
  {
    key: 'white',
    label: 'الثيمات البيضاء الفاخرة',
    themes: ['snowgold', 'pearlobsidian', 'platinumtitan', 'ivorybronze'],
  },
  {
    key: 'dark',
    label: 'الثيمات السوداء الفاخرة',
    themes: ['obsidianroyal', 'charcoalsilver', 'espressobronze', 'cybergold'],
  },
  {
    key: 'signature',
    label: 'ثيمات إضافية فاخرة',
    themes: ['desertgold', 'emeraldroyal'],
  },
];

export const THEME_LABELS: Record<AppTheme, string> = {
  default: 'الأساسية',
  heritage: 'سمة الشعار',
  sakina: 'سكينة',
  mihrab: 'مِحراب',
  rawda: 'الرَّوضة',
  noor: 'نور',
  azraq: 'أزرق صافٍ',
  idara: 'لوحة الإدارة',
  fayrouz: 'فيروز دافئ',
  layl: 'ليل حديث',
  kahraman: 'كهرمان',
  zumurrud: 'زُمُرّد',
  obsidian: 'سَبَج أزرق',
  charcoal: 'فحميّ ملكيّ',
  gunmetal: 'فولاذ فيروزيّ',
  icenavy: 'كحليّ جليديّ',
  espresso: 'بُنّ إسبريسو',
  emerald: 'زمرّد الغابة',
  titanium: 'تيتانيوم فاتح',
  ember: 'جمر الغروب',
  snowgold: 'أبيض ثلجيّ بإطار ذهبيّ',
  pearlobsidian: 'لؤلؤيّ بأسود وذهبيّ',
  platinumtitan: 'أبيض فضّيّ تيتانيوم',
  ivorybronze: 'عاجيّ دافئ ببرونز',
  obsidianroyal: 'أوبسيديان بذهبيّ متوهّج',
  charcoalsilver: 'فحميّ بفضّة وأبيض',
  espressobronze: 'إسبريسو ملكيّ ببرونز',
  cybergold: 'أسود سيبرانيّ بذهبيّ',
  desertgold: 'صحراويّ فخم بذهبيّ',
  emeraldroyal: 'زمرّديّ ملكيّ داكن',
};

/** وصف موجز لكل سمة (يظهر تحت الاسم في شاشة الإعدادات) */
export const THEME_DESC: Record<AppTheme, string> = {
  default: 'أخضر قرآني + ذهبي + خلفية هادئة',
  heritage: 'قوس ذهبي بأشعّة + شريط أخضر + أرضية عاجية',
  sakina: 'أزرق ليلي هادئ مع لمسة فيروزية',
  mihrab: 'عنّابي تراثي + ذهبي على أرضية عاجية',
  rawda: 'أخضر زيتوني + رملي دافئ',
  noor: 'أحادي احترافي عالي التباين + لمسة ذهبية',
  azraq: 'رمادي فاتح ناعم + أزرق هادئ + لمسات خضراء',
  idara: 'أبيض مائل + بطاقات رمادية + كحلي ومؤشّرات حالة خضراء/كهرمانية',
  fayrouz: 'خلفية كريمية + نصّ فحمي عالي التباين + فيروزي وبطاقات واسعة',
  layl: 'فحمي عميق + نيلي هادئ + نصّ أبيض ولمسات نيون',
  kahraman: 'بيج دافئ + بنّي عميق + كهرماني برتقالي',
  zumurrud: 'أبيض ناصع + حدود رمادية خفيفة + أخضر غابيّ وشارات زمرّدية',
  obsidian: 'تدرّج أسود مزرقّ عميق مع أسطح زجاجية وإبراز أزرق',
  charcoal: 'فحميّ داكن غنيّ بلمسة ملكيّة بنفسجية وأسطح شفّافة',
  gunmetal: 'رماديّ فولاذيّ متدرّج بلمحة فيروزية',
  icenavy: 'كحليّ عميق متدرّج مع إبرازات زرقاء جليدية',
  espresso: 'بنّيّ قهوة دافئ متدرّج بأسطح داكنة ولمسة فستقية',
  emerald: 'أخضر غابيّ عميق متدرّج مع توهّج زمرّديّ',
  titanium: 'رماديّ فضّيّ فاتح متدرّج بإحساس معدنيّ ناعم',
  ember: 'تدرّج غروب دافئ من الأرجوانيّ إلى الجمر البرتقاليّ',
  snowgold: 'خلفية ثلجية نقيّة + بطاقات بيضاء محاطة بإطار ذهبيّ متوهّج + نصّ فحميّ وأزرار مذهّبة',
  pearlobsidian: 'خلفية لؤلؤية + بطاقات سوداء أوبسيديان بحوافّ ذهبية رفيعة + تباين تنفيذيّ راقٍ',
  platinumtitan: 'سطح أبيض بلاتينيّ + بطاقات فضّية متدرّجة + ظلال ناعمة ونصّ إردوازيّ عميق',
  ivorybronze: 'خلفية عاجية كريمية دافئة + بطاقات بيج + إطارات برونزية غنيّة ونصّ بنّيّ',
  obsidianroyal: 'أسود منتصف الليل + بطاقات فحمية محاطة بإطار ذهبيّ فاخر من كل الجهات + أزرار مذهّبة',
  charcoalsilver: 'فحميّ مطفأ + بطاقات بإطار تيتانيوم فضّيّ + نصّ أبيض ناصع وإبرازات فضّية متوهّجة',
  espressobronze: 'خلفية إسبريسو شبه سوداء + ألواح بنّية داكنة بإطارات برونزية معدنية أنيقة',
  cybergold: 'واجهة داكنة عصرية + طبقات سوداء محاطة بحوافّ ذهبية رفيعة متوهّجة + عناصر عالية التباين',
  desertgold: 'خلفية رملية صحراوية + بطاقات سوداء مطفأة + تأطير ذهبيّ بلمسة تراث محليّ فاخرة',
  emeraldroyal: 'خضرة غابية شبه سوداء + ألواح أوبسيديان محاطة بإطار ذهبيّ + شارات زمرّدية متوهّجة',
};

/** ألوان مصغّرة لعيّنة الاختيار (أساسي · مميّز · خلفية) */
export const THEME_SWATCHES: Record<AppTheme, [string, string, string]> = {
  default: ['#0d6b3f', '#c9a14a', '#f6f4ec'],
  heritage: ['#e0980f', '#1f7a3a', '#faf5e8'],
  sakina: ['#1e4d6b', '#2a9d8f', '#f1f6f8'],
  mihrab: ['#7b2d3b', '#c9a227', '#faf4e6'],
  rawda: ['#5a7247', '#b98f57', '#f6f1e6'],
  noor: ['#2b2b2b', '#b8952e', '#faf8f4'],
  azraq: ['#3b82c4', '#3fa27a', '#f4f6f9'],
  idara: ['#31507e', '#d99a2b', '#f7f8fa'],
  fayrouz: ['#0f8a8a', '#c98a34', '#f5f3ee'],
  layl: ['#5b57c9', '#22d3ee', '#141922'],
  kahraman: ['#c67a1e', '#8a5a20', '#f7f1e6'],
  zumurrud: ['#0b6b46', '#0f9d63', '#ffffff'],
  obsidian: ['#5b8def', '#d9b25a', '#0d1426'],
  charcoal: ['#8163cf', '#c9a24a', '#1b191e'],
  gunmetal: ['#26a89b', '#c7b06a', '#182022'],
  icenavy: ['#4fb0e8', '#5fd0d8', '#102a47'],
  espresso: ['#c98a4e', '#9aa878', '#221610'],
  emerald: ['#2bb673', '#d8c06a', '#0d2418'],
  titanium: ['#5c7186', '#a9772e', '#eaeef2'],
  ember: ['#e8813f', '#c96fa0', '#3a1f2e'],
  snowgold: ['#c9a14a', '#e8ddc0', '#ffffff'],
  pearlobsidian: ['#cba64e', '#16161a', '#f4f0e7'],
  platinumtitan: ['#8a94a0', '#d7dde3', '#f5f7f9'],
  ivorybronze: ['#a9772e', '#8a6a3e', '#f8f2e4'],
  obsidianroyal: ['#e0b95f', '#1a1a20', '#0a0a0e'],
  charcoalsilver: ['#c6cdd6', '#8b93a0', '#16171a'],
  espressobronze: ['#c08a4d', '#3a271b', '#150e08'],
  cybergold: ['#f2cb4f', '#0e0e12', '#060608'],
  desertgold: ['#d9b667', '#14120f', '#cebc94'],
  emeraldroyal: ['#2fb877', '#dcb75f', '#071a11'],
};

/** تدرّج معاينة لعيّنة الثيمات كاملة السطح */
export const THEME_PREVIEW: Partial<Record<AppTheme, string>> = {
  obsidian: 'linear-gradient(135deg, #0a0f1e 0%, #16224a 60%, #0c1428 100%)',
  charcoal: 'linear-gradient(135deg, #17161a 0%, #2a2333 55%, #17151b 100%)',
  gunmetal: 'linear-gradient(135deg, #14191b 0%, #1d3033 55%, #131b1d 100%)',
  icenavy: 'linear-gradient(135deg, #0b1c33 0%, #164a75 55%, #0c2138 100%)',
  espresso: 'linear-gradient(135deg, #1a120d 0%, #3a271b 55%, #170f0a 100%)',
  emerald: 'linear-gradient(135deg, #08160f 0%, #0f3a26 55%, #091d13 100%)',
  titanium: 'linear-gradient(135deg, #eef1f4 0%, #d8dee4 55%, #f4f6f8 100%)',
  ember: 'linear-gradient(135deg, #1e1220 0%, #6b2f34 55%, #944a2c 100%)',
  snowgold: 'linear-gradient(135deg, #ffffff 0%, #f7f2e3 58%, #efe3c6 100%)',
  pearlobsidian: 'linear-gradient(135deg, #f6f3ec 0%, #e9e3d5 42%, #16161a 100%)',
  platinumtitan: 'linear-gradient(135deg, #f6f8fa 0%, #dfe4ea 52%, #c5cdd7 100%)',
  ivorybronze: 'linear-gradient(135deg, #f8f2e4 0%, #e9dcc2 52%, #a9772e 100%)',
  obsidianroyal: 'linear-gradient(135deg, #0a0a0e 0%, #1b1710 52%, #8a6a2e 100%)',
  charcoalsilver: 'linear-gradient(135deg, #0f1012 0%, #26292e 52%, #aeb6c1 100%)',
  espressobronze: 'linear-gradient(135deg, #140d08 0%, #3a271b 52%, #b07d45 100%)',
  cybergold: 'linear-gradient(135deg, #050507 0%, #12120a 48%, #e8c24a 100%)',
  desertgold: 'linear-gradient(135deg, #cebc94 0%, #7a6a4d 45%, #14120f 100%)',
  emeraldroyal: 'linear-gradient(135deg, #07130d 0%, #0f3a26 50%, #8a6a2e 100%)',
};

const KEY = 'assid-center:theme';

/**
 * إدارة سمة الواجهة والتبديل بينها.
 * تُطبَّق عبر السمتين data-app-theme و data-app-surface على عنصر <html>،
 * وتُحفَظ في localStorage، وتُطبَّق مبكرًا عبر سكربت صغير في index.html
 * لتفادي وميض الألوان.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>(load());

  constructor() {
    this.apply(this.theme());
  }

  set(t: AppTheme): void {
    this.theme.set(t);
    this.apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* التخزين محجوب — نتجاهل */
    }
  }

  /** ينتقل إلى السمة التالية في القائمة */
  toggle(): void {
    const i = THEME_ORDER.indexOf(this.theme());
    this.set(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  }

  private apply(t: AppTheme): void {
    const root = document.documentElement;
    root.setAttribute('data-app-theme', t);
    root.setAttribute('data-app-surface', isFullSurface(t) ? 'full' : 'flat');
    if (isLuxury(t)) root.setAttribute('data-app-frame', 'luxury');
    else root.removeAttribute('data-app-frame');
  }
}

function load(): AppTheme {
  try {
    const v = localStorage.getItem(KEY) as AppTheme | null;
    return v && THEME_ORDER.includes(v) ? v : 'default';
  } catch {
    return 'default';
  }
}
