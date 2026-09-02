import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { App as CapApp } from '@capacitor/app';
import { ThemeService } from './core/theme.service';
import { ToastHostComponent } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent],
  template: `
    <div class="app-shell">
      <router-outlet />
    </div>
    <app-toast-host />
  `,
})
export class App {
  private location = inject(Location);
  // تهيئة السمة مبكرًا (تُطبَّق على <html>)
  private theme = inject(ThemeService);

  constructor() {
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
