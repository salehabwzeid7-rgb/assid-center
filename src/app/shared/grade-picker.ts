import { Component, Input, model } from '@angular/core';
import { GRADE_LABELS, GRADE_ORDER, type Grade } from '../core/models';

/** منتقي التقدير (ممتاز → ضعيف) على شكل شرائح */
@Component({
  selector: 'app-grade-picker',
  template: `
    <div class="field">
      @if (label) {
        <label>{{ label }}</label>
      }
      <div class="chips">
        @for (g of order; track g) {
          <button
            type="button"
            class="chip"
            [class.active]="value() === g"
            (click)="value.set(g)"
          >
            {{ labels[g] }}
          </button>
        }
      </div>
    </div>
  `,
})
export class GradePickerComponent {
  @Input() label = '';
  readonly value = model<Grade>('very_good');
  readonly order = GRADE_ORDER;
  readonly labels = GRADE_LABELS;
}
