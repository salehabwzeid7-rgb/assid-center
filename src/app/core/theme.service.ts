import { Injectable, signal } from '@angular/core';

/* ==========================================================================
   خلفيتان بصريتان قابلتان للتبديل من «حساب المعلّم ← المظهر»:
   ── background1 (misk)     : خلفية فاتحة دافئة + زخرفة هندسيّة خفيفة.
   ── background2 (zumurrud) : الزمرّد الكلاسيكيّ — خلفية فاتحة + زخرفة خفيفة.
   المفاتيح إنجليزية لأسباب تقنيّة، والأسماء المعروضة أرقام بسيطة.
   ========================================================================== */

export type AppTheme = 'misk' | 'zumurrud';

export const THEME_ORDER: readonly AppTheme[] = ['misk', 'zumurrud'];

/** الخلفية الأولى هي الافتراضيّة. */
export const DEFAULT_THEME: AppTheme = 'misk';

export const THEME_LABELS: Record<AppTheme, string> = {
  misk: 'خلفية رقم واحد',
  zumurrud: 'خلفية رقم اثنين',
};

/** ألوان مصغّرة للعيّنة (أساسي · مميّز · خلفية) */
export const THEME_SWATCHES: Record<AppTheme, [string, string, string]> = {
  misk: ['#3b6b4a', '#3d5f72', '#f5f1e8'],
  zumurrud: ['#0b6b46', '#0f9d63', '#f4f7f4'],
};

const KEY = 'assid-center:theme';

/**
 * إدارة خلفية الواجهة. تُطبَّق عبر السمة data-app-theme على عنصر <html>،
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
