import { Injectable, signal } from '@angular/core';

/** السمات المتاحة — مصمَّمة لمراكز تحفيظ القرآن والمراكز التعليمية */
export type AppTheme = 'default' | 'heritage' | 'sakina' | 'mihrab' | 'rawda' | 'noor';

export const THEME_ORDER: AppTheme[] = [
  'default',
  'heritage',
  'sakina',
  'mihrab',
  'rawda',
  'noor',
];

export const THEME_LABELS: Record<AppTheme, string> = {
  default: 'الأساسية',
  heritage: 'سمة الشعار',
  sakina: 'سكينة',
  mihrab: 'مِحراب',
  rawda: 'الرَّوضة',
  noor: 'نور',
};

/** ألوان مصغّرة لبطاقة الاختيار (3 لكل سمة) */
export const THEME_SWATCHES: Record<AppTheme, [string, string, string]> = {
  default: ['#0d6b3f', '#c9a14a', '#f6f4ec'],
  heritage: ['#e0980f', '#1f7a3a', '#faf5e8'],
  sakina: ['#1e4d6b', '#2a9d8f', '#f1f6f8'],
  mihrab: ['#7b2d3b', '#c9a227', '#faf4e6'],
  rawda: ['#5a7247', '#b98f57', '#f6f1e6'],
  noor: ['#2b2b2b', '#b8952e', '#faf8f4'],
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
