import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../core/data.service';
import { NotifyService } from '../core/notify.service';
import {
  RECITATION_KIND_LABELS,
  TASMIE_PASS,
  expectedRecitationSec,
  isActualRecitation,
  scoreOf,
  type RecitationKind,
  type RecitationRecord,
} from '../core/models';
import { surah, surahName, surahsBetween } from '../core/quran-data';
import { ScoreInputComponent } from './score-input';
import { SurahPickerComponent } from './surah-picker';

/** «دد:ثث» — أو «س:دد:ثث» إن تجاوزت الساعة. */
function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/**
 * الآية التالية مباشرةً بعد نهاية مقطع — تنتقل لبداية السورة التالية عند
 * نهاية السورة. تُعيد null عند نهاية سورة الناس (١١٤) — أي أنّ الطالب أكمل
 * حفظ القرآن كاملًا، فلا معنى لاقتراح «المتابعة» من سورة جديدة.
 */
function nextAyahAfter(toSurah: number, toAyah: number): { surah: number; ayah: number } | null {
  const maxAyah = surah(toSurah)?.ayahs ?? toAyah;
  if (toAyah < maxAyah) return { surah: toSurah, ayah: toAyah + 1 };
  if (toSurah >= 114) return null;
  return { surah: toSurah + 1, ayah: 1 };
}

/**
 * لوحة تسميع مدمجة داخل بطاقة الطالب في الجلسة — تظهر عند تعليمه «حاضر/متأخر».
 *
 * تتضمّن:
 *  · مؤقّت دائريّ عدّاد تنازليّ مبنيّ على المعيار «٤ دقائق لكلّ وجه»
 *    (وجه = ٤ د · وجهان = ٨ د · نصف وجه = ٢ د · ٢٫٥ وجه = ١٠ د …).
 *  · «بدء التسميع» / «إنهاء التسميع» — وعند تجاوز المتوقّع يتحوّل المؤشّر للأحمر.
 *  · نموذج الملخّص المعتاد: نوع التسميع، مدى السورة/الآية، عدد الأوجه، النسبة
 *    المئويّة، أخطاء الحفظ والتجويد، مرّات التلقين، والملاحظات.
 *
 * تُحفَظ المدّة الفعليّة مع السجلّ (`durationSec`) وتُزامَن فورًا مع Firebase
 * والتخزين المحلّيّ.
 */
@Component({
  selector: 'app-recitation-panel',
  imports: [FormsModule, RouterLink, ScoreInputComponent, SurahPickerComponent],
  template: `
    <div class="rp">
      <!-- المؤقّت الدائريّ -->
      <div class="rp-timer">
        <svg viewBox="0 0 120 120" class="rp-ring" [class.over]="overtime()">
          <circle cx="60" cy="60" r="52" class="rp-track" />
          <circle
            cx="60"
            cy="60"
            r="52"
            class="rp-fill"
            [attr.stroke-dasharray]="circ"
            [attr.stroke-dashoffset]="circ * (1 - fraction())"
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="55" class="rp-time" [class.over]="overtime()">{{ centerLabel() }}</text>
          <text x="60" y="76" class="rp-sub">{{ subLabel() }}</text>
        </svg>

        <div class="rp-timer-side">
          <!-- عدد الأوجه — كلّما زاد زاد زمن المؤقّت (٤ د/وجه) -->
          <div class="rp-pages">
            <span class="rp-pages-lbl">الأوجه</span>
            <button
              type="button"
              class="rp-step"
              (click)="bumpPages(-0.5)"
              [disabled]="plannedPages() <= 0"
              aria-label="إنقاص وجه"
            >
              −
            </button>
            <input
              class="rp-pages-in"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.5"
              [ngModel]="pages()"
              (ngModelChange)="pages.set(clampPages($event))"
              [ngModelOptions]="{ standalone: true }"
              aria-label="عدد الأوجه"
            />
            <button type="button" class="rp-step" (click)="bumpPages(0.5)" aria-label="زيادة وجه">
              +
            </button>
          </div>

          <p class="rp-expect" [class.over]="overtime()">
            المتوقّع: <b>{{ fmtClock(expectedSec()) }}</b>
            <span class="rp-perpage">= {{ plannedPages() || 0 }} وجه × ٤ د</span>
          </p>
          @if (elapsedSec() > 0) {
            <p class="rp-actual" [class.over]="overtime()">
              الفعليّ: {{ fmtClock(elapsedSec()) }}
              @if (overtime()) {
                · تجاوز المعيار بـ {{ fmtClock(elapsedSec() - expectedSec()) }} ⏱
              }
            </p>
          }
          <div class="rp-timer-btns">
            @if (!running()) {
              <button class="btn btn-primary" type="button" (click)="start()">
                {{ elapsedSec() > 0 ? 'متابعة' : '▶ بدء التسميع' }}
              </button>
            } @else {
              <button class="btn btn-danger" type="button" (click)="stop()">■ إنهاء التسميع</button>
            }
            @if (elapsedSec() > 0 && !running()) {
              <button class="btn btn-ghost" type="button" (click)="resetTimer()">تصفير</button>
            }
          </div>
        </div>
      </div>

      <!-- نموذج الملخّص -->
      <div class="rp-field">
        <label>نوع التسميع</label>
        <div class="chips">
          @for (k of kinds; track k) {
            <button
              type="button"
              class="chip"
              [class.active]="m.kind === k"
              [class.has-entry]="!!entryForKind(k)"
              (click)="selectKind(k)"
            >
              {{ kindLabels[k] }}
              @if (entryForKind(k)) {
                <span class="rp-kind-dot">●</span>
              }
            </button>
          }
        </div>
      </div>

      @if (smartHint(); as hint) {
        <p class="rp-hint">💡 {{ hint }}</p>
      }

      <div class="rp-row">
        <div class="rp-field">
          <label>من سورة</label>
          <app-surah-picker [(value)]="m.fromSurah" label="من سورة" />
        </div>
        <div class="rp-field rp-ayah">
          <label>آية</label>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            [max]="maxAyah(m.fromSurah)"
            [(ngModel)]="m.fromAyah"
            [ngModelOptions]="{ standalone: true }"
          />
        </div>
      </div>
      <div class="rp-row">
        <div class="rp-field">
          <label>إلى سورة</label>
          <app-surah-picker [(value)]="m.toSurah" label="إلى سورة" />
        </div>
        <div class="rp-field rp-ayah">
          <label>آية</label>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            [max]="maxAyah(m.toSurah)"
            [(ngModel)]="m.toAyah"
            [ngModelOptions]="{ standalone: true }"
          />
        </div>
      </div>

      <app-score-input
        label="نسبة التسميع (٪)"
        [threshold]="tasmiePass"
        [value]="score()"
        (valueChange)="score.set($event)"
      />

      <div class="rp-field">
        <label>أخطاء الحفظ</label>
        <div class="err-tally">
          <button
            type="button"
            class="rp-step"
            (click)="bumpHifz(-1)"
            [disabled]="m.hifzErrors <= 0"
            aria-label="إنقاص خطأ حفظ"
          >
            −
          </button>
          <input
            class="err-count-in"
            type="number"
            inputmode="numeric"
            min="0"
            [(ngModel)]="m.hifzErrors"
            [ngModelOptions]="{ standalone: true }"
            aria-label="عدد أخطاء الحفظ"
          />
          <button
            type="button"
            class="rp-step err-tap"
            (click)="bumpHifz(1)"
            aria-label="تسجيل خطأ حفظ"
          >
            +1
          </button>
        </div>
      </div>
      <div class="rp-field">
        <label>أخطاء التجويد</label>
        <div class="err-tally">
          <button
            type="button"
            class="rp-step"
            (click)="bumpTajweed(-1)"
            [disabled]="m.tajweedErrors <= 0"
            aria-label="إنقاص خطأ تجويد"
          >
            −
          </button>
          <input
            class="err-count-in"
            type="number"
            inputmode="numeric"
            min="0"
            [(ngModel)]="m.tajweedErrors"
            [ngModelOptions]="{ standalone: true }"
            aria-label="عدد أخطاء التجويد"
          />
          <button
            type="button"
            class="rp-step err-tap"
            (click)="bumpTajweed(1)"
            aria-label="تسجيل خطأ تجويد"
          >
            +1
          </button>
        </div>
      </div>

      <div class="rp-field">
        <label>التردّد (التلقين على الطالب)</label>
        <div class="err-tally">
          <button
            type="button"
            class="rp-step"
            (click)="bumpPrompt(-1)"
            [disabled]="m.promptCount <= 0"
            aria-label="إنقاص تردّد"
          >
            −
          </button>
          <input
            class="err-count-in"
            type="number"
            inputmode="numeric"
            min="0"
            [(ngModel)]="m.promptCount"
            [ngModelOptions]="{ standalone: true }"
            aria-label="عدد مرّات التردّد"
          />
          <button
            type="button"
            class="rp-step err-tap"
            (click)="bumpPrompt(1)"
            aria-label="تسجيل تردّد"
          >
            +1
          </button>
        </div>
      </div>

      @if (showRatingChoice()) {
        <div class="rp-field">
          <label>التقييم</label>
          <div class="rating-choice">
            <button
              type="button"
              class="rating-opt"
              [class.active]="(m.rating ?? 'very_good') === 'very_good'"
              (click)="setRating('very_good')"
            >
              جيد جدًّا
            </button>
            <button
              type="button"
              class="rating-opt"
              [class.active]="m.rating === 'excellent'"
              (click)="setRating('excellent')"
            >
              ممتاز
            </button>
          </div>
        </div>
      }

      <div class="rp-field">
        <label>ملاحظات المعلّم</label>
        <textarea
          rows="2"
          [(ngModel)]="m.notes"
          [ngModelOptions]="{ standalone: true }"
          placeholder="ملاحظات حول الأداء والتجويد…"
        ></textarea>
      </div>

      <div class="rp-actions">
        <a class="btn btn-ghost" [routerLink]="['/session', sessionId(), 'evaluate', studentId()]">
          ✦ تقييم يوميّ
        </a>
        <button class="btn btn-primary" type="button" [disabled]="saving()" (click)="save()">
          {{
            saving() ? 'جارٍ الحفظ…' : entryForKind(m.kind) ? 'حفظ تعديل التسميع' : 'حفظ التسميع'
          }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .rp {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed var(--border);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rp-timer {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .rp-ring {
        width: 104px;
        height: 104px;
        flex-shrink: 0;
      }
      .rp-track {
        fill: none;
        stroke: var(--surface-2);
        stroke-width: 9;
      }
      .rp-fill {
        fill: none;
        stroke: var(--green);
        stroke-width: 9;
        stroke-linecap: round;
        transition:
          stroke-dashoffset 0.4s linear,
          stroke 0.3s;
      }
      .rp-ring.over .rp-fill {
        stroke: var(--danger);
      }
      .rp-time {
        font-size: 21px;
        font-weight: 800;
        fill: var(--text);
        text-anchor: middle;
        dominant-baseline: middle;
        font-variant-numeric: tabular-nums;
      }
      .rp-time.over {
        fill: var(--danger);
      }
      .rp-sub {
        font-size: 9px;
        fill: var(--text-soft);
        text-anchor: middle;
        dominant-baseline: middle;
      }
      .rp-timer-side {
        flex: 1;
        min-width: 170px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rp-pages {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rp-pages-lbl {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-soft);
        margin-inline-end: 2px;
      }
      .rp-step {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border: 1px solid var(--green);
        background: var(--surface);
        color: var(--green);
        border-radius: 9px;
        font-size: 1.15rem;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
      }
      .rp-step:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .rp-step:active:not(:disabled) {
        background: var(--green-tint);
      }
      .rp-pages-in {
        width: 58px;
        flex-shrink: 0;
        text-align: center;
        font-weight: 800;
        padding: 6px 4px;
      }
      .rp-expect,
      .rp-actual {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .rp-actual.over,
      .rp-expect.over {
        color: var(--danger);
      }
      .rp-perpage {
        font-weight: 500;
      }
      .rp-kind-dot {
        font-size: 6px;
        margin-inline-start: 4px;
        color: var(--green);
        vertical-align: middle;
      }
      .rp-hint {
        margin: 0;
        padding: 8px 10px;
        border-radius: var(--radius-xs);
        background: var(--gold-tint2, #faf4e4);
        color: var(--gold-deep);
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.5;
      }
      .err-tally {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      /* خصوصيّة أعلى من ‎.rp-field input‎ العامّة (100% عرض) — نحتاج عرضًا ثابتًا هنا */
      .err-tally .err-count-in {
        width: 52px;
        flex-shrink: 0;
        text-align: center;
        font-weight: 800;
        padding: 6px 4px;
      }
      .err-tap {
        flex: 1;
        width: auto;
        max-width: 120px;
        background: var(--green-tint);
        font-size: 0.9rem;
        font-weight: 800;
      }
      .rating-choice {
        display: flex;
        gap: 8px;
      }
      .rating-opt {
        flex: 1;
        padding: 9px 6px;
        border: 1px solid var(--green);
        background: var(--surface);
        color: var(--green);
        border-radius: 9px;
        font-size: 0.88rem;
        font-weight: 800;
        cursor: pointer;
      }
      .rating-opt.active {
        background: var(--green);
        color: #fff;
      }
      .rp-timer-btns {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 2px;
      }
      .rp-timer-btns .btn {
        padding: 8px 14px;
        font-size: 0.85rem;
      }
      .rp-row {
        display: flex;
        gap: 10px;
      }
      .rp-row .rp-field {
        flex: 1;
      }
      .rp-row .rp-ayah {
        max-width: 92px;
      }
      .rp-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .rp-field label {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .rp-field input,
      .rp-field select,
      .rp-field textarea {
        width: 100%;
      }
      .rp-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      .rp-actions .btn {
        flex: 1;
        padding: 11px;
      }
    `,
  ],
})
export class RecitationPanelComponent implements OnInit {
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<string>();
  readonly studentId = input.required<string>();
  readonly circleId = input.required<string>();
  readonly date = input.required<string>();
  /**
   * كلّ سجلّات تسميع هذا الطالب في هذه الجلسة (v1.22.0) — سجلّ واحد ممكن لكلّ
   * نوع (حفظ جديد/مراجعة قريبة/مراجعة بعيدة)، فقد يحمل حتى ثلاثة عناصر.
   * تبديل «نوع التسميع» داخل اللوحة يُحمِّل حقول النموذج من العنصر المطابق
   * (إن وُجد) بدل استبدال سجلّ واحد ثابت كما كان سابقًا.
   */
  readonly existingEntries = input<RecitationRecord[]>([]);

  readonly kinds: RecitationKind[] = ['new', 'near_review', 'far_review'];
  readonly kindLabels = RECITATION_KIND_LABELS;
  readonly tasmiePass = TASMIE_PASS;
  readonly fmtClock = fmtClock;
  readonly circ = 2 * Math.PI * 52;

  readonly score = signal(TASMIE_PASS);
  readonly saving = signal(false);

  m = {
    kind: 'new' as RecitationKind,
    fromSurah: 78,
    fromAyah: 1,
    toSurah: 78,
    toAyah: 40,
    hifzErrors: 0,
    tajweedErrors: 0,
    promptCount: 0,
    rating: undefined as 'very_good' | 'excellent' | undefined,
    notes: '',
  };

  /** يظهر اختيار التقييم اليدويّ فقط عند بلوغ الدرجة عتبة النجاح فأعلى. */
  readonly showRatingChoice = computed(() => this.score() >= TASMIE_PASS);
  /** عدد الأوجه — إشارة مستقلّة لأنّ المؤقّت يتفاعل معها لحظيًّا. */
  readonly pages = signal(1);

  // ---- الاقتراح الذكيّ لبداية المقطع (من آخر تسميع «حفظ جديد» للطالب) ----
  /** ملاحظة توضيحيّة صغيرة تظهر عند تفعيل الاقتراح — null إن لم يُفعَّل. */
  readonly smartHint = signal<string | null>(null);
  private recitationHistorySig: ReturnType<DataService['studentRecitations']> | null = null;
  private smartPrefillDone = false;

  // ---- المؤقّت ----
  readonly running = signal(false);
  readonly elapsedSec = signal(0);
  private startTs = 0;
  private handle: ReturnType<typeof setInterval> | undefined;

  readonly plannedPages = computed(() => Math.max(0, Number(this.pages()) || 0));
  readonly expectedSec = computed(() => expectedRecitationSec(this.plannedPages()));
  readonly overtime = computed(
    () => this.expectedSec() > 0 && this.elapsedSec() > this.expectedSec(),
  );
  readonly fraction = computed(() =>
    this.expectedSec() > 0 ? Math.min(1, this.elapsedSec() / this.expectedSec()) : 0,
  );
  readonly centerLabel = computed(() => {
    const exp = this.expectedSec();
    if (exp === 0) return fmtClock(this.elapsedSec());
    const rem = exp - this.elapsedSec();
    return rem >= 0 ? fmtClock(rem) : '+' + fmtClock(-rem);
  });
  readonly subLabel = computed(() => {
    if (this.running()) return this.overtime() ? 'تجاوز المعيار' : 'متبقٍّ';
    if (this.elapsedSec() === 0) return 'جاهز للبدء';
    return 'انتهى';
  });

  constructor() {
    // اقتراح ذكيّ لبداية المقطع — مرّة واحدة فقط، وفقط عند إدخال جديد تمامًا
    // (لا يوجد أيّ تسميع مسجَّل بعد لهذا الطالب في هذه الجلسة أيًّا كان نوعه)،
    // وفقط إن كانت الحقول لا تزال بقيمها الافتراضيّة (لم يبدأ المعلّم الكتابة
    // يدويًّا بعد).
    effect(() => {
      if (this.smartPrefillDone || this.existingEntries().length > 0) {
        this.smartPrefillDone = true;
        return;
      }
      if (!this.recitationHistorySig) {
        this.recitationHistorySig = this.data.studentRecitations(this.studentId(), this.destroyRef);
      }
      const history = this.recitationHistorySig();
      if (history === undefined) return; // لم تصل البيانات بعد — يُعاد التشغيل تلقائيًّا عند وصولها
      this.smartPrefillDone = true;
      this.applySmartDefaults(history);
    });
  }

  /**
   * يقترح بداية المقطع التالي بناءً على آخر تسميع «حفظ جديد» مسجَّل للطالب:
   *  · نجح (≥ عتبة النجاح) ← يبدأ المقطع التالي من الآية التي تلي مباشرةً.
   *  · لم ينجح ← يُعاد ملء نفس المقطع (بحاجة إلى «إعادة»).
   * لا يفعل شيئًا إن كان المعلّم قد عدّل حقول السورة/الآية يدويًّا بالفعل.
   */
  private applySmartDefaults(history: readonly RecitationRecord[]): void {
    const untouched =
      this.m.fromSurah === 78 &&
      this.m.fromAyah === 1 &&
      this.m.toSurah === 78 &&
      this.m.toAyah === 40;
    if (!untouched) return;
    const last = history.find((r) => r.kind === 'new' && isActualRecitation(r));
    if (!last) return;

    if (scoreOf(last) >= TASMIE_PASS) {
      const next = nextAyahAfter(last.toSurah, last.toAyah);
      if (!next) {
        // آخر تسميع ناجح انتهى عند نهاية سورة الناس — أكمل الطالب حفظ القرآن كاملًا.
        this.smartHint.set('🎉 أكمل الطالب حفظ القرآن الكريم كاملًا في آخر تسميع ناجح مسجَّل له!');
        return;
      }
      this.m.fromSurah = next.surah;
      this.m.fromAyah = next.ayah;
      this.m.toSurah = next.surah;
      this.m.toAyah = next.ayah;
      this.smartHint.set(
        `يتابع تلقائيًّا من حيث انتهى آخر تسميع ناجح — ${surahName(next.surah)} ${next.ayah}. عدّل «إلى» حسب المقطع المطلوب.`,
      );
    } else {
      this.m.fromSurah = last.fromSurah;
      this.m.fromAyah = last.fromAyah;
      this.m.toSurah = last.toSurah;
      this.m.toAyah = last.toAyah;
      this.pages.set(last.pages);
      this.smartHint.set(
        `أُعيد نفس مقطع آخر تسميع (${surahName(last.fromSurah)} ${last.fromAyah} ← ${surahName(last.toSurah)} ${last.toAyah}) لأنّه لم يبلغ نسبة النجاح.`,
      );
    }
  }

  ngOnInit(): void {
    // عند فتح اللوحة نعرض أوّل ما هو مسجَّل فعلًا (يُفضَّل «حفظ جديد» إن
    // وُجد، وإلا أوّل نوع مسجَّل)، أو نموذجًا فارغًا بنوع «حفظ جديد» افتراضيًّا
    // إن لم يُسجَّل للطالب أيّ تسميع بعد في هذه الجلسة.
    const entries = this.existingEntries();
    const first = entries.find((r) => r.kind === 'new') ?? entries[0] ?? null;
    this.m.kind = first?.kind ?? 'new';
    this.hydrateFrom(first);
    // استعادة مؤقّت جارٍ بعد قفل الشاشة/إعادة التحميل
    try {
      const raw = sessionStorage.getItem(this.key());
      if (raw) {
        const { startTs } = JSON.parse(raw) as { startTs: number };
        const el = Math.round((Date.now() - startTs) / 1000);
        if (el >= 0 && el < 4 * 3600) {
          this.startTs = startTs;
          this.elapsedSec.set(el);
          this.running.set(true);
          this.tick();
        } else {
          sessionStorage.removeItem(this.key());
        }
      }
    } catch {
      /* التخزين محجوب */
    }
    this.destroyRef.onDestroy(() => this.clearTick());
  }

  /** سجلّ الطالب المسجَّل لهذا النوع في هذه الجلسة إن وُجد، وإلا null. */
  entryForKind(kind: RecitationKind): RecitationRecord | null {
    return this.existingEntries().find((r) => r.kind === kind) ?? null;
  }

  /**
   * يملأ حقول النموذج من سجلّ موجود، أو يعيدها لقيمها الافتراضيّة إن كان
   * null (نوع لم يُسجَّل له تسميع بعد بهذه الجلسة). لا يمسّ المؤقّت (يبقى
   * الوقت الجاري مستقلًّا عن نوع التسميع المعروض).
   */
  private hydrateFrom(r: RecitationRecord | null): void {
    if (!r || !isActualRecitation(r)) {
      this.m.fromSurah = 78;
      this.m.fromAyah = 1;
      this.m.toSurah = 78;
      this.m.toAyah = 40;
      this.m.hifzErrors = 0;
      this.m.tajweedErrors = 0;
      this.m.promptCount = 0;
      this.m.rating = undefined;
      this.m.notes = '';
      this.pages.set(1);
      this.score.set(TASMIE_PASS);
      return;
    }
    this.m.fromSurah = r.fromSurah;
    this.m.fromAyah = r.fromAyah;
    this.m.toSurah = r.toSurah;
    this.m.toAyah = r.toAyah;
    this.m.hifzErrors = r.hifzErrors;
    this.m.tajweedErrors = r.tajweedErrors;
    this.m.promptCount = r.promptCount;
    this.m.rating = r.rating;
    this.m.notes = r.notes ?? '';
    this.pages.set(r.pages);
    this.score.set(scoreOf(r));
    if (r.durationSec) this.elapsedSec.set(r.durationSec);
  }

  /** تبديل نوع التسميع المعروض داخل اللوحة — يحمّل سجلّ هذا النوع إن وُجد، وإلا نموذجًا فارغًا. */
  selectKind(kind: RecitationKind): void {
    this.m.kind = kind;
    this.hydrateFrom(this.entryForKind(kind));
  }

  maxAyah(n: number | string): number {
    return surah(Number(n))?.ayahs ?? 286;
  }

  /** يقرّب عدد الأوجه إلى أقرب نصف وجه ولا يسمح بالسالب. */
  clampPages(v: number | string): number {
    return Math.max(0, Math.round((Number(v) || 0) * 2) / 2);
  }
  /**
   * يمنع حفظ عدد أخطاء سالب أو غير رقميّ عند الضغط على «حفظ» — الأزرار
   * ‎−/+1‎ محميّة أصلًا (bumpHifz/bumpTajweed)، لكنّ الكتابة المباشرة بالحقل
   * غير مقيَّدة. عمدًا لا نُقيِّدها لحظيًّا أثناء الكتابة (ngModelChange)
   * لأنّ `m` كائن عاديّ لا إشارة (signal) في تطبيق zoneless، فتحديثه من هناك
   * لا يُعيد رسم قيمة الحقل المعروضة — القيمة المكتوبة تبقى كما هي في
   * الواجهة حتى الحفظ، حيث تُصحَّح فعليًّا قبل إرسالها لقاعدة البيانات.
   */
  clampErrorCount(v: number | string): number {
    return Math.max(0, Math.round(Number(v) || 0));
  }
  /** ＋/－ نصف وجه — يزيد زمن المؤقّت المتوقّع بـ ٢ دقيقة لكلّ خطوة. */
  bumpPages(delta: number): void {
    this.pages.set(this.clampPages(this.pages() + delta));
  }

  /** تسجيل خطأ حفظ بلمسة واحدة (＋١) أو التراجع عنه (－١) — يبقى الحقل قابلًا للتعديل اليدويّ. */
  bumpHifz(delta: number): void {
    this.m.hifzErrors = Math.max(0, (Number(this.m.hifzErrors) || 0) + delta);
  }
  /** تسجيل خطأ تجويد بلمسة واحدة — نفس فكرة bumpHifz. */
  bumpTajweed(delta: number): void {
    this.m.tajweedErrors = Math.max(0, (Number(this.m.tajweedErrors) || 0) + delta);
  }
  /** تسجيل تردّد (تلقين) بلمسة واحدة — نفس فكرة bumpHifz. */
  bumpPrompt(delta: number): void {
    this.m.promptCount = Math.max(0, (Number(this.m.promptCount) || 0) + delta);
  }

  /** اختيار التقييم اليدويّ (جيد جدًّا/ممتاز) — متاح فقط عند بلوغ عتبة النجاح. */
  setRating(rating: 'very_good' | 'excellent'): void {
    this.m.rating = rating;
  }

  start(): void {
    if (this.running()) return;
    this.startTs = Date.now() - this.elapsedSec() * 1000;
    this.running.set(true);
    this.persist();
    this.tick();
  }

  /** «إنهاء التسميع» — يوقف العدّ ويثبّت المدّة الفعليّة. */
  stop(): void {
    this.running.set(false);
    this.clearTick();
    this.forget();
  }

  resetTimer(): void {
    this.stop();
    this.elapsedSec.set(0);
  }

  private tick(): void {
    this.clearTick();
    this.handle = setInterval(() => {
      this.elapsedSec.set(Math.round((Date.now() - this.startTs) / 1000));
    }, 500);
  }
  private clearTick(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
  }
  private key(): string {
    return `rt_${this.sessionId()}_${this.studentId()}`;
  }
  private persist(): void {
    try {
      sessionStorage.setItem(this.key(), JSON.stringify({ startTs: this.startTs }));
    } catch {
      /* محجوب */
    }
  }
  private forget(): void {
    try {
      sessionStorage.removeItem(this.key());
    } catch {
      /* محجوب */
    }
  }

  async save(): Promise<void> {
    const fromSurah = Number(this.m.fromSurah);
    const toSurah = Number(this.m.toSurah);
    const fromAyah = Number(this.m.fromAyah);
    const toAyah = Number(this.m.toAyah);
    if (toSurah < fromSurah || (toSurah === fromSurah && toAyah < fromAyah)) {
      this.notify.error('نهاية المقطع يجب أن تكون بعد بدايته');
      return;
    }
    if (this.running()) this.stop();
    this.saving.set(true);
    const payload = {
      studentId: this.studentId(),
      circleId: this.circleId(),
      sessionId: this.sessionId(),
      date: this.date(),
      kind: this.m.kind,
      fromSurah,
      fromAyah,
      toSurah,
      toAyah,
      pages: Number(this.pages()) || 0,
      score: this.score(),
      hifzErrors: this.clampErrorCount(this.m.hifzErrors),
      tajweedErrors: this.clampErrorCount(this.m.tajweedErrors),
      promptCount: this.clampErrorCount(this.m.promptCount),
      rating: this.score() >= this.tasmiePass ? (this.m.rating ?? 'very_good') : undefined,
      durationSec: this.elapsedSec() || undefined,
      notes: this.m.notes.trim() || undefined,
    };
    const ok = await this.notify.run(
      () =>
        this.data
          .upsertSessionRecitation(this.sessionId(), this.studentId(), payload)
          .then(() => true),
      { success: 'حُفظ التسميع', error: 'تعذّر حفظ التسميع' },
    );
    this.saving.set(false);
    if (!ok) return;

    // «حفظ جديد» يُضيف السور تلقائيًّا إلى مقرّر الطالب وينبّه عند اكتمال جزء.
    // التسميع نفسه حُفظ بنجاح بالفعل (التوست أعلاه) — فشل هذه الخطوة الثانويّة
    // (اتصال ضعيف مثلًا) يجب أن يظهر بوضوح لا أن يختفي بصمت وسط نجاح ظاهريّ.
    if (this.m.kind === 'new') {
      try {
        const { added, completedJuz } = await this.data.mergeStudentMemorizedSurahs(
          this.studentId(),
          surahsBetween(fromSurah, toSurah),
        );
        if (added > 0) {
          this.notify.success(
            added === 1 ? 'أُضيفت سورة إلى مقرّر الطالب' : `أُضيفت ${added} سور إلى مقرّر الطالب`,
          );
        }
        if (completedJuz.length > 0) {
          const jz = completedJuz.map((j) => `الجزء ${j}`).join(' و');
          this.notify.info(`🎉 أكمل الطالب حفظ ${jz} — سجّل السرد والاختبار من صفحتيهما.`);
        }
      } catch (e) {
        console.error(e);
        this.notify.error('حُفظ التسميع، لكن تعذّر تحديث مقرّر الطالب — أعِد فتح السجلّ للتأكّد');
      }
    }
  }
}
