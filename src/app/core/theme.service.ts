import { Injectable, signal } from '@angular/core';

/** السمات المتاحة — مصمَّمة لمراكز تحفيظ القرآن والمراكز التعليمية والخدمية */
export type AppTheme =
  | 'default'
  | 'heritage'
  | 'sakina'
  | 'mihrab'
  | 'rawda'
  | 'noor'
  | 'azraq'
  | 'idara'
  | 'fayrouz'
  | 'layl'
  | 'kahraman'
  | 'zumurrud';

export const THEME_ORDER: AppTheme[] = [
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
};

/** وصف موجز لكل سمة (يظهر تحت الاسم في شاشة الإعدادات) */
export const THEME_DESC: Record<AppTheme, string> = {
  default: 'أخضر قرآني + ذهبي + خلفية هادئة',
  heritage: 'قوس ذهبي بأشعّة + شريط أخضر + أرضية عاجية',
  sakina: 'أزرق ليلي هادئ مع لمسة فيروزية',
  mihrab: 'عنّابي تراثي + ذهبي على أرضية عاجية',
  rawda: 'أخضر زيتوني + رملي دافئ',
  noor: 'أحادي احترافي عالي التباين + لمسة ذهبية',
  azraq: 'رمادي فاتح ناعم + أزرق هادئ + لمسات خضراء — إحساس خدمات محلّية منعش',
  idara: 'أبيض مائل + بطاقات رمادية + كحلي غامق ومؤشّرات حالة خضراء/كهرمانية',
  fayrouz: 'خلفية كريمية + نصّ فحمي عالي التباين + فيروزي هادئ وبطاقات واسعة',
  layl: 'فحمي عميق + نيلي هادئ + نصّ أبيض ولمسات نيون — وضع ليلي عصريّ',
  kahraman: 'بيج دافئ + بنّي عميق + كهرماني برتقالي — أجواء متجر ودود',
  zumurrud: 'أبيض ناصع + حدود رمادية خفيفة + أخضر غابيّ وشارات زمرّدية',
};

/** ألوان مصغّرة لبطاقة الاختيار (أساسي · مميّز · خلفية) */
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
};

const KEY = 'assid-center:theme';

/**
 * إدارة سمة الواجهة والتبديل بينها.
 * تُطبَّق عبر السمة data-app-theme على عنصر <html>، وتُحفَظ في localStorage،
 * وتُطبَّق مبكرًا عبر سكربت صغير في index.html لتفادي وميض الألوان.
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
    document.documentElement.setAttribute('data-app-theme', t);
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
