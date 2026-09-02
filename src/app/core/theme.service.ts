import { Injectable, signal } from '@angular/core';

/** السمات المتاحة */
export type AppTheme = 'default' | 'heritage';

export const THEME_LABELS: Record<AppTheme, string> = {
  default: 'الأساسية',
  heritage: 'سمة الشعار',
};

const KEY = 'assid-center:theme';

/**
 * إدارة سمة الواجهة والتبديل بينها.
 * تُطبَّق عبر السمة data-app-theme على عنصر <html>، وتُحفَظ في localStorage.
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
    this.set(this.theme() === 'default' ? 'heritage' : 'default');
  }

  private apply(t: AppTheme): void {
    document.documentElement.setAttribute('data-app-theme', t);
  }
}

function load(): AppTheme {
  try {
    return localStorage.getItem(KEY) === 'heritage' ? 'heritage' : 'default';
  } catch {
    return 'default';
  }
}
