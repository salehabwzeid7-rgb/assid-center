import { Injectable, signal } from '@angular/core';

/* ==========================================================================
   سمات الواجهة — عشر ثيمات فاخرة «كاملة السطح» فقط.
   كلٌّ منها يحوّل خلفية التطبيق إلى تدرّج غنيّ، ويحيط البطاقات والأزرار
   والتواريخ بإطار معدنيّ (ذهبي/برونزي/فضّي) مع توهّج ناعم.
   الأسماء والمنطق بالإنجليزية، ونصوص المستخدم بالعربية.
   ========================================================================== */

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
  // توقيعية إضافية
  'desertgold',
  'emeraldroyal',
] as const;

export type AppTheme = (typeof LUXURY_THEMES)[number];

export const THEME_ORDER: readonly AppTheme[] = LUXURY_THEMES;
export const DEFAULT_THEME: AppTheme = 'ivorybronze';

/** عنوان قسم المظهر */
export const THEME_GROUP_LABELS = {
  luxury: 'الثيمات الفاخرة الاحترافية',
} as const;

/** تقسيم الثيمات إلى ثلاث فئات في شاشة الإعدادات */
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

export const THEME_DESC: Record<AppTheme, string> = {
  snowgold: 'خلفية ثلجية نقيّة + بطاقات بيضاء محاطة بإطار ذهبيّ متوهّج + نصّ فحميّ وأزرار مذهّبة',
  pearlobsidian: 'خلفية لؤلؤية + بطاقات سوداء أوبسيديان بحوافّ ذهبية رفيعة + تباين تنفيذيّ راقٍ',
  platinumtitan: 'سطح أبيض بلاتينيّ + بطاقات فضّية متدرّجة + ظلال ناعمة ونصّ إردوازيّ عميق',
  ivorybronze: 'خلفية عاجية كريمية دافئة + بطاقات بيج + إطارات برونزية غنيّة ونصّ بنّيّ',
  obsidianroyal:
    'أسود منتصف الليل + بطاقات فحمية محاطة بإطار ذهبيّ فاخر من كل الجهات + أزرار مذهّبة',
  charcoalsilver: 'فحميّ مطفأ + بطاقات بإطار تيتانيوم فضّيّ + نصّ أبيض ناصع وإبرازات فضّية متوهّجة',
  espressobronze: 'خلفية إسبريسو شبه سوداء + ألواح بنّية داكنة بإطارات برونزية معدنية أنيقة',
  cybergold:
    'واجهة داكنة عصرية + طبقات سوداء محاطة بحوافّ ذهبية رفيعة متوهّجة + عناصر عالية التباين',
  desertgold: 'خلفية رملية صحراوية + بطاقات سوداء مطفأة + تأطير ذهبيّ بلمسة تراث محليّ فاخرة',
  emeraldroyal: 'خضرة غابية شبه سوداء + ألواح أوبسيديان محاطة بإطار ذهبيّ + شارات زمرّدية متوهّجة',
};

/** تدرّج معاينة يُعرض في شاشة الإعدادات */
export const THEME_PREVIEW: Record<AppTheme, string> = {
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
 * تُطبَّق عبر data-app-theme + data-app-surface='full' + data-app-frame='luxury'
 * على عنصر <html>، وتُحفَظ في localStorage، وتُطبَّق مبكرًا عبر سكربت في index.html.
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

  /** ينتقل إلى السمة التالية */
  toggle(): void {
    const i = THEME_ORDER.indexOf(this.theme());
    this.set(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  }

  private apply(t: AppTheme): void {
    const root = document.documentElement;
    root.setAttribute('data-app-theme', t);
    root.setAttribute('data-app-surface', 'full');
    root.setAttribute('data-app-frame', 'luxury');
  }
}

function load(): AppTheme {
  try {
    const v = localStorage.getItem(KEY) as AppTheme | null;
    return v && (THEME_ORDER as readonly string[]).includes(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
