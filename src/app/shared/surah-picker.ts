import { Component, computed, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SURAHS } from '../core/quran-data';

/** أرقام هندية عربية (٠-٩) → أرقام إنجليزية، حتى يعمل البحث بأيّ من الرقمين. */
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * منتقي سورة قابل للبحث — يستبدل قائمة `<select>` المنسدلة التقليديّة (١١٤
 * خيارًا يصعب تصفّحها بسرعة أثناء الجلسة). زرّ يفتح نافذة فيها حقل بحث فوريّ
 * (بالاسم أو الرقم، عربيًّا أو إنجليزيًّا) + قائمة نتائج قابلة للّمس، بنفس
 * مكوّنات النافذة المنبثقة (`.modal-backdrop`/`.modal`) المستخدمة في بقيّة
 * التطبيق للتناسق البصريّ.
 */
@Component({
  selector: 'app-surah-picker',
  imports: [FormsModule],
  template: `
    <button type="button" class="sp-trigger" (click)="open()">
      <span>{{ selectedLabel() }}</span>
      <span class="sp-caret" aria-hidden="true">▾</span>
    </button>

    @if (opened()) {
      <div class="modal-backdrop" (click)="close()">
        <div class="modal sp-modal" (click)="$event.stopPropagation()">
          <div class="row-between" style="margin-bottom:10px">
            <h3 style="margin:0">{{ label() || 'اختر السورة' }}</h3>
            <button class="sp-close" type="button" (click)="close()" aria-label="إغلاق">✕</button>
          </div>
          <input
            #searchInput
            class="sp-search"
            type="text"
            inputmode="search"
            placeholder="ابحث باسم السورة أو رقمها…"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            [ngModelOptions]="{ standalone: true }"
          />
          <div class="sp-list">
            @for (su of filtered(); track su.n) {
              <button
                type="button"
                class="sp-item"
                [class.active]="su.n === value()"
                (click)="pick(su.n)"
              >
                <span class="sp-num">{{ su.n }}</span>
                <span class="sp-name">{{ su.name }}</span>
              </button>
            } @empty {
              <p class="muted" style="text-align: center; padding: 18px 0">لا نتائج مطابقة</p>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .sp-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        color: var(--text);
        font-family: inherit;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        text-align: start;
      }
      .sp-trigger:active {
        background: var(--surface-2);
      }
      .sp-caret {
        color: var(--text-soft);
        flex-shrink: 0;
      }
      .sp-modal {
        display: flex;
        flex-direction: column;
        max-height: 82vh;
      }
      .sp-close {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border: none;
        background: var(--surface-2);
        border-radius: 999px;
        font-size: 1rem;
        color: var(--text-soft);
        cursor: pointer;
      }
      .sp-close:active {
        background: var(--border);
      }
      .sp-search {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        font-size: 1rem;
        margin-bottom: 8px;
        flex-shrink: 0;
      }
      .sp-list {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .sp-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: var(--radius-xs);
        background: none;
        color: var(--text);
        font-family: inherit;
        cursor: pointer;
        text-align: start;
      }
      .sp-item:active {
        background: var(--surface-2);
      }
      .sp-item.active {
        background: var(--green-tint);
        border-color: var(--green);
        font-weight: 700;
      }
      .sp-num {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--surface-2);
        font-size: 0.76rem;
        font-weight: 800;
        color: var(--text-soft);
      }
      .sp-item.active .sp-num {
        background: var(--green);
        color: #fff;
      }
    `,
  ],
})
export class SurahPickerComponent {
  readonly value = model.required<number>();
  readonly label = input('');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly opened = signal(false);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = normalizeDigits(this.query().trim());
    if (!q) return SURAHS;
    const asNum = Number(q);
    return SURAHS.filter(
      (su) => su.name.includes(q) || (Number.isFinite(asNum) && asNum > 0 && su.n === asNum),
    );
  });

  readonly selectedLabel = computed(() => {
    const su = SURAHS.find((s) => s.n === this.value());
    return su ? `${su.n}. ${su.name}` : 'اختر السورة';
  });

  open(): void {
    this.query.set('');
    this.opened.set(true);
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 0);
  }

  close(): void {
    this.opened.set(false);
  }

  pick(n: number): void {
    this.value.set(n);
    this.close();
  }
}
