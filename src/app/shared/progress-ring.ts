import { Component, computed, input } from '@angular/core';

/**
 * حلقة تقدّم دائريّة SVG بسيطة — value من ٠ إلى ١.
 * تُستخدم لعرض تقدّم حفظ الجزء الجاري (الجزء = ٢٠ صفحة).
 */
@Component({
  selector: 'app-progress-ring',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx="22"
        cy="22"
        [attr.r]="r"
        fill="none"
        stroke="var(--border)"
        [attr.stroke-width]="stroke()"
      />
      <circle
        cx="22"
        cy="22"
        [attr.r]="r"
        fill="none"
        stroke="var(--green)"
        [attr.stroke-width]="stroke()"
        stroke-linecap="round"
        [attr.stroke-dasharray]="circ"
        [attr.stroke-dashoffset]="offset()"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="22" text-anchor="middle" dominant-baseline="central" class="pr-text">
        {{ text() }}
      </text>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      .pr-text {
        font-size: 10px;
        font-weight: 800;
        fill: var(--text);
      }
    `,
  ],
})
export class ProgressRingComponent {
  readonly value = input(0);
  readonly text = input('');
  readonly size = input(44);

  readonly r = 18;
  readonly circ = 2 * Math.PI * this.r;
  readonly stroke = computed(() => (this.size() < 40 ? 4 : 4.5));
  readonly offset = computed(() => this.circ * (1 - Math.max(0, Math.min(1, this.value()))));
}
