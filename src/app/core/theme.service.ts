import { Injectable, signal } from '@angular/core';

/* ==========================================================================
   سمتان بصريتان قابلتان للتبديل من «حساب المعلّم ← المظهر»:
   ── misk     : التصميم الجديد — خلفية كريميّة دافئة + أخضر غابيّ وأزرق إردوازيّ + خطّ Cairo.
   ── zumurrud : التصميم الكلاسيكيّ السابق — أبيض ناصع + أخضر زمرّديّ + خطّ Tajawal.
   الأسماء والمنطق بالإنجليزية، ونصوص المستخدم بالعربية.
   ========================================================================== */

export type AppTheme = 'misk' | 'zumurrud';

export const THEME_ORDER: readonly AppTheme[] = ['misk', 'zumurrud'];

/** التصميم الجديد هو الافتراضيّ؛ يمكن للمستخدم العودة إلى الكلاسيكيّ. */
export const DEFAULT_THEME: AppTheme = 'misk';

export const THEME_LABELS: Record<AppTheme, string> = {
  misk: 'مِسْك الدافئ (الجديد)',
  zumurrud: 'الزمرّد الكلاسيكيّ',
};

export const THEME_DESC: Record<AppTheme, string> = {
  misk: 'مطابِق لتصميم Figma — خلفية كريميّة #F5F1E8 + أزرار خضراء #3B6B4A + خطّ Cairo (فاتح دائمًا)',
  zumurrud: 'التصميم السابق — أبيض ناصع + أخضر زمرّديّ + خطّ Tajawal',
};

/** ألوان مصغّرة للعيّنة (أساسي · مميّز · خلفية) */
export const THEME_SWATCHES: Record<AppTheme, [string, string, string]> = {
  misk: ['#3b6b4a', '#3d5f72', '#f5f1e8'],
  zumurrud: ['#0b6b46', '#0f9d63', '#ffffff'],
};

const KEY = 'assid-center:theme';

/**
 * إدارة سمة الواجهة. تُطبَّق عبر السمة data-app-theme على عنصر <html>،
 * وتُحفَظ في localStorage، وتُطبَّق مبكرًا عبر سكربت في index.html لتفادي وميض الألوان.
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

  toggle(): void {
    this.set(this.theme() === 'misk' ? 'zumurrud' : 'misk');
  }

  private apply(t: AppTheme): void {
    document.documentElement.setAttribute('data-app-theme', t);
  }
}

function load(): AppTheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'misk' || v === 'zumurrud' ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
