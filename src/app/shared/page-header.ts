import { Component, Input, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

/** الشريط العلوي الموحّد لكل الشاشات */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="app-header">
      @if (back) {
        <button class="icon-btn" type="button" (click)="goBack()" aria-label="رجوع">›</button>
      } @else {
        <button class="icon-btn" type="button" (click)="goHome()" aria-label="الرئيسية">☰</button>
      }
      <span class="title">{{ title }}</span>
      <ng-content select="[actions]"></ng-content>
    </header>
  `,
  styles: [
    `
      .icon-btn {
        font-size: 1.4rem;
        line-height: 1;
      }
    `,
  ],
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() back = true;

  private location = inject(Location);
  private router = inject(Router);

  goBack(): void {
    if (history.length > 1) this.location.back();
    else this.router.navigateByUrl('/');
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
