import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { App as CapApp } from '@capacitor/app';
import { ThemeService } from './core/theme.service';
import { UpdateService } from './core/update.service';
import { BottomNavComponent } from './shared/bottom-nav';
import { ToastHostComponent } from './shared/toast-host';

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
  // تهيئة السمة مبكرًا (تُطبَّق على <html>)
  private theme = inject(ThemeService);
  // فحص التحديثات المباشرة (OTA) على أندرويد
  private update = inject(UpdateService);

  constructor() {
    this.update.init();

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
}
