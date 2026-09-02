import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { App as CapApp } from '@capacitor/app';
import { environment } from '../environments/environment';
import { DataService } from './core/data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <div class="app-shell">
      @if (preview) {
        <div class="preview-banner">
          <span>🧪 وضع المعاينة — بيانات تجريبية محلية بلا Firebase</span>
          <button type="button" (click)="resetData()">إعادة الضبط</button>
        </div>
      }
      <router-outlet />
    </div>
  `,
})
export class App {
  private location = inject(Location);
  private data = inject(DataService);
  readonly preview = environment.preview;

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

  resetData(): void {
    if (confirm('إعادة بيانات المعاينة إلى حالتها الأصلية؟')) {
      this.data.resetPreview();
      location.reload();
    }
  }
}
