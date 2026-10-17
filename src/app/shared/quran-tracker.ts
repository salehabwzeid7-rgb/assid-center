import { Component, computed, model, signal } from '@angular/core';
import { closeOnBack } from '../core/back-stack.service';
import { memorizedAyahs } from '../core/memorized';
import { juzProgress } from '../core/mushaf';
import { JUZ_SURAHS, surahName } from '../core/quran-data';

/**
 * متتبّع المقرّر القرآنيّ — شبكة الأجزاء الثلاثين مع تفصيل السور داخل كل جزء.
 * الربط ثنائيّ الاتجاه عبر [(value)] = مصفوفة أرقام السور المحفوظة كاملةً (1..114)، و[(juz)] =
 * أرقام الأجزاء المحفوظة كاملةً (1..30). «الجزء كاملًا» يُسجَّل جزءًا (بآياته) لا سورًا،
 * فجزء يمتدّ بين سورتين (كالأوّل) لا يستلزم حفظ سورة الحدّ كلّها. اكتمال الجزء بالآيات.
 */
@Component({
  selector: 'app-quran-tracker',
  template: `
    <button type="button" class="qt-trigger" (click)="open.set(true)">
      <span class="qt-label">المقرّر القرآنيّ — المحفوظ</span>
      <span class="qt-value" [class.empty]="isEmpty()">{{ summaryText() }}</span>
      <span class="qt-go">تحديد ›</span>
    </button>

    @if (open()) {
      <div class="modal-backdrop" (click)="close()">
        <div class="modal qt-modal" (click)="$event.stopPropagation()">
          @if (view() === 'grid') {
            <div class="qt-head">
              <h3>المقرّر القرآنيّ</h3>
              <button type="button" class="qt-icon" (click)="close()" aria-label="إغلاق">✕</button>
            </div>
            <p class="qt-summary">
              <b>{{ fullJuzCount() }}</b> جزءًا كاملًا · <b>{{ value().length }}</b> سورة محفوظة
              كاملةً
            </p>
            <div class="qt-body">
              <div class="qt-grid">
                @for (j of juzList; track j) {
                  <button
                    type="button"
                    class="qt-cell"
                    [class.partial]="stateOf(j) === 'partial'"
                    [class.full]="stateOf(j) === 'full'"
                    (click)="openJuz(j)"
                  >
                    <span class="qt-cell-n">{{ j }}</span>
                    <span class="qt-cell-f">{{ pagesOf(j) }}/20</span>
                  </button>
                }
              </div>
            </div>
            <div class="qt-legend">
              <span><i class="sw full"></i> جزء كامل</span>
              <span><i class="sw partial"></i> جزئيّ</span>
              <span><i class="sw"></i> لم يُحفظ</span>
              @if (!isEmpty()) {
                <button type="button" class="qt-clear" (click)="clearAll()">مسح الكلّ</button>
              }
            </div>
            <button type="button" class="btn btn-primary btn-block" (click)="close()">تمّ</button>
          } @else {
            <div class="qt-head">
              <button type="button" class="qt-icon" (click)="view.set('grid')" aria-label="رجوع">
                ›
              </button>
              <h3>الجزء {{ activeJuz() }}</h3>
              <button type="button" class="qt-icon" (click)="close()" aria-label="إغلاق">✕</button>
            </div>
            <p class="qt-summary">{{ juzRangeLabel() }}</p>
            <button type="button" class="btn btn-block qt-selall" (click)="toggleJuz()">
              {{ juzSelected() ? '✓ إلغاء تحديد الجزء كاملًا' : 'تحديد الجزء كاملًا (بآياته)' }}
            </button>
            <p class="qt-summary" style="margin-top:6px">أو حدّد السور الكاملة منه:</p>
            <div class="qt-body">
              <div class="qt-surahs">
                @for (n of surahsOfActiveJuz(); track n) {
                  <button
                    type="button"
                    class="qt-surah"
                    [class.on]="has(n)"
                    (click)="toggleSurah(n)"
                  >
                    <span class="qt-box">{{ has(n) ? '✓' : '' }}</span>
                    <span class="qt-sname">{{ surahName(n) }}</span>
                    <span class="qt-snum">{{ n }}</span>
                  </button>
                }
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-block" (click)="view.set('grid')">
              رجوع إلى الأجزاء
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .qt-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        text-align: start;
        cursor: pointer;
      }
      .qt-label {
        font-size: 0.8rem;
        color: var(--text-soft);
      }
      .qt-value {
        flex: 1;
        font-weight: 700;
        color: var(--green);
      }
      .qt-value.empty {
        font-weight: 400;
        color: var(--text-soft);
      }
      .qt-go {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--green);
      }

      .qt-modal {
        max-width: 430px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        padding: 16px;
      }
      .qt-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .qt-head h3 {
        flex: 1;
        margin: 0;
        font-size: 1.05rem;
      }
      .qt-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--surface-2);
        font-size: 1.1rem;
        line-height: 1;
        cursor: pointer;
        flex-shrink: 0;
      }
      .qt-summary {
        margin: 6px 2px 12px;
        font-size: 0.88rem;
        color: var(--text-soft);
      }
      .qt-summary b {
        color: var(--green);
      }
      .qt-body {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        margin: 0 -4px;
        padding: 0 4px;
      }

      .qt-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
      }
      .qt-cell {
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
        transition:
          transform 0.08s ease,
          background var(--ease);
      }
      .qt-cell:active {
        transform: scale(0.93);
      }
      .qt-cell-n {
        font-size: 1.15rem;
        font-weight: 800;
      }
      .qt-cell-f {
        font-size: 0.66rem;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
      }
      .qt-cell.partial {
        background: var(--gold-tint);
        border-color: var(--gold);
        color: var(--gold-deep);
      }
      .qt-cell.full {
        background: var(--green);
        border-color: var(--green-deep, var(--green));
        color: #fff;
      }

      .qt-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 12px 2px;
        font-size: 0.76rem;
        color: var(--text-soft);
      }
      .qt-legend span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .qt-legend .sw {
        width: 13px;
        height: 13px;
        border-radius: 4px;
        border: 1px solid var(--border);
        background: var(--surface);
      }
      .qt-legend .sw.partial {
        background: var(--gold-tint);
        border-color: var(--gold);
      }
      .qt-legend .sw.full {
        background: var(--green);
        border-color: var(--green);
      }
      .qt-clear {
        margin-inline-start: auto;
        font-weight: 700;
        color: var(--danger);
        cursor: pointer;
      }

      .qt-selall {
        margin-bottom: 10px;
      }
      .qt-surahs {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .qt-surah {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        cursor: pointer;
        text-align: start;
      }
      .qt-surah.on {
        background: var(--green-tint);
        border-color: var(--green);
      }
      .qt-box {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 6px;
        border: 1.5px solid var(--border);
        background: var(--bg);
        font-size: 0.8rem;
        font-weight: 800;
        color: var(--green);
      }
      .qt-surah.on .qt-box {
        background: var(--green);
        border-color: var(--green);
        color: #fff;
      }
      .qt-sname {
        flex: 1;
        font-weight: 700;
      }
      .qt-snum {
        font-size: 0.78rem;
        color: var(--text-soft);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class QuranTrackerComponent {
  /** أرقام السور المحفوظة (1..114) — مربوطة ثنائيًّا مع النموذج الأب. */
  readonly value = model<number[]>([]);
  /** أرقام الأجزاء المحفوظة كاملةً (1..30) — مربوطة ثنائيًّا مع النموذج الأب. */
  readonly juz = model<number[]>([]);

  readonly open = signal(false);
  /** زرّ الرجوع يُغلق النافذة أوّلًا بدل مغادرة الصفحة. */
  private readonly backClose = closeOnBack(
    () => this.open(),
    () => this.close(),
  );
  readonly view = signal<'grid' | 'juz'>('grid');
  readonly activeJuz = signal(1);

  readonly juzList = Array.from({ length: 30 }, (_, i) => i + 1);
  readonly surahName = surahName;

  private selected = computed(() => new Set(this.value()));
  /** كلّ الآيات المحفوظة من المدخلات الأوّليّة (سور + أجزاء) — أساس حالة كلّ جزء. */
  private readonly ayahs = computed(() =>
    memorizedAyahs({ memorizedSurahs: this.value(), memorizedJuz: this.juz() }),
  );

  has(n: number): boolean {
    return this.selected().has(n);
  }
  pagesOf(juz: number): number {
    return juzProgress(juz, this.ayahs()).pages;
  }
  stateOf(juz: number): 'none' | 'partial' | 'full' {
    const p = juzProgress(juz, this.ayahs());
    if (p.have === 0) return 'none';
    return p.have === p.total ? 'full' : 'partial';
  }
  readonly isEmpty = computed(() => this.value().length === 0 && this.juz().length === 0);

  readonly fullJuzCount = computed(
    () => this.juzList.filter((j) => this.stateOf(j) === 'full').length,
  );
  readonly summaryText = computed(() =>
    this.isEmpty() ? 'لم يُحدَّد بعد' : `${this.fullJuzCount()} جزءًا كاملًا`,
  );

  readonly surahsOfActiveJuz = computed(() => [...JUZ_SURAHS[this.activeJuz() - 1]]);
  /** هل الجزء المعروض مسجَّل «كاملًا» يدويًّا؟ */
  readonly juzSelected = computed(() => this.juz().includes(this.activeJuz()));
  readonly juzRangeLabel = computed(() => {
    const list = JUZ_SURAHS[this.activeJuz() - 1];
    return list.length === 1
      ? `سورة ${surahName(list[0])}`
      : `من سورة ${surahName(list[0])} إلى سورة ${surahName(list[list.length - 1])}`;
  });

  openJuz(juz: number): void {
    this.activeJuz.set(juz);
    this.view.set('juz');
  }
  close(): void {
    this.open.set(false);
    this.view.set('grid');
  }

  private commit(set: Set<number>): void {
    this.value.set([...set].sort((a, b) => a - b));
  }
  toggleSurah(n: number): void {
    const s = new Set(this.value());
    s.has(n) ? s.delete(n) : s.add(n);
    this.commit(s);
  }
  toggleJuz(): void {
    const j = this.activeJuz();
    const cur = this.juz();
    this.juz.set(cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j].sort((a, b) => a - b));
  }
  clearAll(): void {
    this.value.set([]);
    this.juz.set([]);
  }
}
