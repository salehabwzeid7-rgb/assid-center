import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { filter, take } from 'rxjs';
import { App as CapApp } from '@capacitor/app';
import { ThemeService } from './core/theme.service';
import { UpdateService } from './core/update.service';
import { BottomNavComponent } from './shared/bottom-nav';
import { ToastHostComponent } from './shared/toast-host';

declare global {
  interface Window {
    /** يُعرَّف داخل index.html — يُخفي شاشة البدء (تلاشٍ ثمّ إزالة من DOM). */
    __hideSplash?: () => void;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, BottomNavComponent],
  template: `
    <div class="app-shell">
      <router-outlet />
      <app-bottom-nav />
    </div>
    <app-toast-host />
  `,
})
export class App {
  private location = inject(Location);
  private router = inject(Router);
  // تهيئة السمة مبكرًا (تُطبَّق على <html>)
  private theme = inject(ThemeService);
  // فحص التحديثات المباشرة (OTA) على أندرويد
  private update = inject(UpdateService);

  constructor() {
    this.update.init();
    this.hideSplashWhenReady();

    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && history.length > 1) {
        this.location.back();
      } else {
        CapApp.exitApp();
      }
    }).catch(() => {
      /* لا شيء على الويب */
    });
  }

  /**
   * تُخفي شاشة بدء الويب (index.html #app-splash) بعد استقرار أوّل توجيه —
   * أي بعد أن يحسم authGuard/guestGuard وجهة الدخول أو الرئيسيّة وتُعرَض
   * فعليًّا، لا بعد مدّة مخمَّنة. إطاران متتاليان (rAF) لضمان اكتمال الرسم
   * قبل بدء التلاشي فلا يظهر أيّ وميض أو قفزة.
   */
  private hideSplashWhenReady(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.__hideSplash?.());
        });
      });
  }
}
