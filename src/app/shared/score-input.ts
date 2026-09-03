import { Component, computed, input, model } from '@angular/core';
import { clampScore, passLabel } from '../core/models';

/**
 * مُدخِل الدرجة المئويّة (٠..١٠٠) — شريط تمرير + حقل رقميّ + مؤشّر نجاح/رسوب
 * فوريّ حسب العتبة الممرَّرة (٩٠ للسرد/التقييم، ٩٥ للتسميع).
 * لا يعتمد على ngModel لتفادي التعارض داخل عناصر <form>.
 */
@Component({
  selector: 'app-score-input',
  template: `
    <div class="field">
      @if (label()) {
        <label>{{ label() }}</label>
      }
      <div class="score-row">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          [value]="value()"
          (input)="set($any($event.target).value)"
          [attr.aria-label]="label() || 'الدرجة'"
        />
        <input
          class="score-num"
          type="number"
          inputmode="numeric"
          min="0"
          max="100"
          [value]="value()"
          (input)="set($any($event.target).value)"
        />
        <span class="score-verdict" [class.pass]="pass()" [class.fail]="!pass()">
          {{ pass() ? 'ناجح' : 'راسب' }}
        </span>
      </div>
      <div class="hint">عتبة النجاح {{ threshold() }}٪</div>
    </div>
  `,
  styles: [
    `
      .score-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .score-row input[type='range'] {
        flex: 1;
        accent-color: var(--green);
      }
      .score-num {
        width: 68px;
        flex-shrink: 0;
        text-align: center;
        font-weight: 800;
      }
      .score-verdict {
        flex-shrink: 0;
        min-width: 52px;
        text-align: center;
        font-weight: 800;
        font-size: 0.82rem;
        padding: 4px 8px;
        border-radius: 999px;
      }
      .score-verdict.pass {
        background: var(--ok-bg, #e7ede1);
        color: var(--ok, #3b6b4a);
      }
      .score-verdict.fail {
        background: var(--danger-bg, #f6e6e3);
        color: var(--danger);
      }
    `,
  ],
})
export class ScoreInputComponent {
  readonly label = input('');
  readonly threshold = input(90);
  readonly value = model(90);

  readonly pass = computed(() => passLabel(this.value(), this.threshold()) === 'ناجح');

  set(v: number | string): void {
    this.value.set(clampScore(v));
  }
}
