import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../core/data.service';
import { NotifyService } from '../core/notify.service';
import {
  NOTE_MAX,
  RECITATION_KIND_LABELS,
  TASMIE_PASS,
  expectedRecitationSec,
  isActualRecitation,
  kindOf,
  scoreOf,
  type AyahSegment,
  type RecitationKind,
  type RecitationRecord,
} from '../core/models';
import {
  ayahCount,
  descendingSegments,
  linesOf,
  pagesFromLines,
  pagesText,
  rangeIndexes,
  segmentIndexes,
} from '../core/mushaf';
import { completedJuzOf, coveredSurahs, memorizedAyahs } from '../core/memorized';
import {
  freshPart,
  inferDirection,
  nextStep,
  previouslyMemorized,
  recitationEnd,
  recitationIndexes,
} from '../core/new-memorization';
import { surahName } from '../core/quran-data';
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

/** رقم السورة التي تقع فيها آية (بفهرسها العامّ ٠..٦٢٣٥). */
function surahOfIndex(index: number): number {
  let acc = 0;
  for (let n = 1; n <= 114; n++) {
    acc += ayahCount(n);
    if (index < acc) return n;
  }
  return 114;
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
            <span class="rp-pages-lbl">أوجه المؤقّت</span>
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
              (ngModelChange)="setTimerPages($event)"
              [ngModelOptions]="{ standalone: true }"
              aria-label="أوجه المؤقّت"
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
              [class.active]="kind() === k"
              (click)="selectKind(k)"
            >
              {{ kindLabels[k] }}
            </button>
          }
        </div>
      </div>

      @if (smartHint(); as hint) {
        <p class="rp-hint">💡 {{ hint }}</p>
      }
      @if (choices().length > 0) {
        <div class="chips">
          @for (c of choices(); track c.surah) {
            <button type="button" class="chip" (click)="pickChoice(c.surah)">{{ c.label }}</button>
          }
        </div>
      }

      <div class="rp-row">
        <div class="rp-field">
          <label>من سورة</label>
          <app-surah-picker
            [value]="fromSurah()"
            (valueChange)="setFromSurah($event)"
            label="من سورة"
          />
        </div>
        <div class="rp-field rp-ayah">
          <label>آية</label>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            [attr.max]="maxFromAyah() || null"
            [value]="fromAyah() ?? ''"
            [disabled]="!fromSurah()"
            [attr.placeholder]="fromSurah() ? '1 – ' + maxFromAyah() : '—'"
            (input)="onAyah('from', $event)"
            (blur)="onAyahBlur('from', $event)"
            aria-label="آية البداية"
          />
        </div>
      </div>
      <div class="rp-row">
        <div class="rp-field">
          <label>إلى سورة</label>
          <app-surah-picker
            [value]="toSurah()"
            (valueChange)="setToSurah($event)"
            label="إلى سورة"
          />
        </div>
        <div class="rp-field rp-ayah">
          <label>آية</label>
          <input
            type="number"
            inputmode="numeric"
            [attr.min]="minToAyah()"
            [attr.max]="maxToAyah() || null"
            [value]="toAyah() ?? ''"
            [disabled]="!toSurah()"
            [attr.placeholder]="toSurah() ? minToAyah() + ' – ' + maxToAyah() : '—'"
            (input)="onAyah('to', $event)"
            (blur)="onAyahBlur('to', $event)"
            aria-label="آية النهاية"
          />
        </div>
      </div>
      @if (fromSurah() || toSurah()) {
        <p class="rp-range-hint">
          @if (fromSurah()) {
            آيات {{ surahLabel(fromSurah()) }}: {{ maxFromAyah() }}
          }
          @if (toSurah() && toSurah() !== fromSurah()) {
            · آيات {{ surahLabel(toSurah()) }}: {{ maxToAyah() }}
          }
        </p>
      }

      <!-- ترتيب السور عكسيّ (إلى سورة قبل من سورة): تقسيم تلقائيّ بحسب السور، آياته قابلة للتعديل.
           الآيات داخل كلّ سورة تصاعديّة دائمًا، وما يُترك بين المقاطع من فراغ لا يُحسب. -->
      @if (reversed()) {
        <div class="rp-segs">
          <div class="rp-segs-title">
            ترتيب السور عكسيّ — المقاطع التي سمّعها (عدّل الآيات إن اختلف الواقع)
          </div>
          @for (g of segments(); track g.surah) {
            <div class="rp-seg">
              <span class="rp-seg-name">{{ surahLabel(g.surah) }}</span>
              <input
                type="number"
                inputmode="numeric"
                min="1"
                [attr.max]="segMax(g.surah)"
                [value]="g.from"
                (input)="onSeg(g.surah, 'from', $event)"
                [attr.aria-label]="'من آية — ' + surahLabel(g.surah)"
              />
              <span class="rp-seg-dash">إلى</span>
              <input
                type="number"
                inputmode="numeric"
                min="1"
                [attr.max]="segMax(g.surah)"
                [value]="g.to"
                (input)="onSeg(g.surah, 'to', $event)"
                [attr.aria-label]="'إلى آية — ' + surahLabel(g.surah)"
              />
              <span class="rp-seg-max">من {{ segMax(g.surah) }}</span>
            </div>
          }
        </div>
      }

      <!-- أوجه الحفظ الجديد المسمّعة: تُحسَب تلقائيًّا من الآيات الجديدة وفق مصحف المدينة،
           ويعتمد البرنامج رقم المعلّم إن عدّله. منفصلة تمامًا عن أوجه المؤقّت. -->
      @if (kind() === 'new') {
        <div class="rp-field rp-recited">
          <label>الأوجه المسمّعة (حفظ جديد)</label>
          @if (!range().valid) {
            <p class="rp-recited-note">حدّد المقطع لتظهر الأوجه.</p>
          } @else {
            <div class="rp-pages">
              <button
                type="button"
                class="rp-step"
                (click)="bumpRecited(-0.25)"
                [disabled]="range().allRepeated || recitedPages() <= 0"
                aria-label="إنقاص ربع وجه"
              >
                −
              </button>
              <input
                class="rp-pages-in"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.25"
                [value]="recitedPages()"
                [disabled]="range().allRepeated"
                (input)="onRecited($event)"
                aria-label="الأوجه المسمّعة"
              />
              <button
                type="button"
                class="rp-step"
                (click)="bumpRecited(0.25)"
                [disabled]="range().allRepeated"
                aria-label="زيادة ربع وجه"
              >
                +
              </button>
              <span class="rp-recited-text">= {{ pagesText(recitedPages(), true) }}</span>
              @if (recitedOverride() !== null) {
                <button type="button" class="chip" (click)="recitedOverride.set(null)">
                  ↺ تلقائيّ
                </button>
              }
            </div>
            @if (range().allRepeated) {
              <p class="rp-warn-note">
                كلّ آيات هذا المقطع محفوظة سابقًا فلا أوجه جديدة تُحسب. إن كان تسميع مراجعة فاختر
                «مراجعة».
              </p>
            }
            <p class="rp-recited-note">
              {{ range().total }} آية
              @if (range().repeated > 0) {
                · منها {{ range().repeated }} سبق حفظها فلا تُحسب
              }
              @if (recitedOverride() === null) {
                · محسوبة تلقائيًّا ({{ pagesText(range().freshPages, true) }})
              } @else {
                · رقمك أنت (التلقائيّ {{ pagesText(range().freshPages, true) }})
              }
            </p>
          }
          <p class="rp-warn-note">
            ⚠ الأوجه لا تُحسب في التقارير إلّا للحفظ الجديد الناجح (٩٠٪ فأكثر) وللآيات التي لم
            تُحفَظ من قبل.
          </p>
        </div>
      } @else {
        <p class="rp-warn-note">
          ⚠ المراجعة لا تُحسب في عدد الأوجه — الأوجه تخصّ الحفظ الجديد وحده.
        </p>
      }

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
        <label>ملاحظة قصيرة (تظهر في التقرير)</label>
        <input
          type="text"
          [maxlength]="noteMax"
          [(ngModel)]="m.notes"
          [ngModelOptions]="{ standalone: true }"
          placeholder="مثال: تردّد في الآيات الأخيرة"
        />
      </div>

      <div class="rp-actions">
        <a class="btn btn-ghost" [routerLink]="['/session', sessionId(), 'evaluate', studentId()]">
          ✦ تقييم يوميّ
        </a>
        <button class="btn btn-primary" type="button" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'جارٍ الحفظ…' : entry() ? 'حفظ تعديل المحاولة' : 'حفظ التسميع' }}
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
      .rp-range-hint {
        margin: -4px 0 0;
        font-size: 0.74rem;
        color: var(--text-soft);
      }
      .rp-recited-note {
        margin: 6px 0 0;
        font-size: 0.76rem;
        color: var(--text-soft);
        line-height: 1.8;
      }
      .rp-segs {
        padding: 10px;
        border-radius: var(--radius-sm);
        background: var(--surface-2);
        border: 1px dashed var(--border);
      }
      .rp-segs-title {
        margin-bottom: 8px;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--text-soft);
        line-height: 1.7;
      }
      .rp-seg {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
      }
      .rp-seg-name {
        flex: 1;
        min-width: 80px;
        font-size: 0.86rem;
        font-weight: 800;
      }
      .rp-seg input {
        width: 58px;
        flex-shrink: 0;
        text-align: center;
        padding: 6px 4px;
      }
      .rp-seg-dash,
      .rp-seg-max {
        font-size: 0.74rem;
        color: var(--text-soft);
        white-space: nowrap;
      }
      .rp-warn-note {
        margin: 6px 0 0;
        padding: 6px 10px;
        border-radius: 8px;
        background: var(--surface-2);
        font-size: 0.74rem;
        line-height: 1.8;
        color: var(--text-soft);
      }
      .rp-recited-text {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--green);
      }
      .rp-recited .rp-pages {
        flex-wrap: wrap;
      }
      /* القاعدة العامّة (rp-field input) تمدّ الحقل بعرض كامل — هنا حقل رقميّ صغير بين زرَّي ± */
      .rp-recited .rp-pages-in {
        width: 64px;
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
   * المحاولة المُعدَّلة — `null` لمحاولة جديدة. الطالب قد يسمّع أكثر من مرّة في
   * الجلسة نفسها (حتى من النوع ذاته)، فكلّ حفظ بلا `entry` سجلٌّ مستقلّ جديد.
   */
  readonly entry = input<RecitationRecord | null>(null);
  /** يُطلَق بعد حفظ ناجح — لتعيد الجلسة اللوحة لمحاولة جديدة فارغة. */
  readonly saved = output<void>();
  /** حدّ الملاحظة القصيرة (نحو ثلاث كلمات). */
  readonly noteMax = NOTE_MAX;

  readonly kinds: RecitationKind[] = ['new', 'review'];
  readonly pagesText = pagesText;
  readonly kindLabels = RECITATION_KIND_LABELS;
  readonly tasmiePass = TASMIE_PASS;
  readonly fmtClock = fmtClock;
  readonly circ = 2 * Math.PI * 52;

  readonly score = signal(TASMIE_PASS);
  readonly saving = signal(false);

  /** نوع التسميع: حفظ جديد أو مراجعة (خانة واحدة). */
  readonly kind = signal<RecitationKind>('new');

  /**
   * المقطع: فارغ تمامًا ابتداءً (٠ = لا سورة، null = لا آية) — لا قيمة افتراضيّة. إشارات لا
   * حقول عاديّة، لأنّ الأوجه المقترحة والقيود (آيات السورة الفعليّة) تُشتقّ منها لحظيًّا.
   */
  readonly fromSurah = signal(0);
  readonly fromAyah = signal<number | null>(null);
  readonly toSurah = signal(0);
  readonly toAyah = signal<number | null>(null);

  m = {
    hifzErrors: 0,
    tajweedErrors: 0,
    promptCount: 0,
    rating: undefined as 'very_good' | 'excellent' | undefined,
    notes: '',
  };

  /** يظهر اختيار التقييم اليدويّ فقط عند بلوغ الدرجة عتبة النجاح فأعلى. */
  readonly showRatingChoice = computed(() => this.score() >= TASMIE_PASS);
  /** أوجه **المؤقّت** (٤ د/وجه) — إشارة مستقلّة لأنّ المؤقّت يتفاعل معها لحظيًّا. */
  readonly pages = signal(1);
  /** عدّل المعلّم أوجه المؤقّت بنفسه — فلا يتبع المقطع تلقائيًّا بعد ذلك. */
  private timerTouched = false;

  /** رقم المعلّم لأوجه الحفظ الجديد المسمّعة؛ `null` = تلقائيّ من الآيات الجديدة. */
  readonly recitedOverride = signal<number | null>(null);

  /** كلّ تسميعات الطالب (لمعرفة ما سبق حفظه فلا يُحسب مرّتين) — مصدرها يُضبط في ngOnInit. */
  private readonly historySrc = signal<Signal<RecitationRecord[] | undefined> | null>(null);
  private readonly history = computed(() => this.historySrc()?.());

  /** الآيات التي حفظها الطالب سابقًا قبل هذا التسميع. */
  private readonly priorSeen = computed(() => {
    const h = this.history();
    if (!h) return new Set<number>();
    const e = this.entry();
    return previouslyMemorized(
      h,
      e ? { id: e.id, date: e.date, createdAt: e.createdAt } : undefined,
    );
  });

  /** ترتيب السور عكسيّ: «إلى سورة» قبل «من سورة» في المصحف (النبأ ← المرسلات ← الإنسان). */
  readonly reversed = computed(
    () => this.fromSurah() > 0 && this.toSurah() > 0 && this.toSurah() < this.fromSurah(),
  );
  /** تعديلات المعلّم على آيات كلّ سورة من المقاطع العكسيّة (المفتاح رقم السورة). */
  readonly segEdits = signal<Record<number, { from?: number; to?: number }>>({});
  /**
   * مقاطع الترتيب العكسيّ بحسب السور: سورة البداية من آيتها إلى آخرها، والسور بينهما
   * كاملة، وسورة النهاية من آية ١ إلى آيتها — مع ما عدّله المعلّم. فارغة إن لم يكن عكسيًّا.
   */
  readonly segments = computed<AyahSegment[]>(() => {
    if (!this.reversed()) return [];
    const base = descendingSegments(
      this.fromSurah(),
      this.fromAyah() ?? 1,
      this.toSurah(),
      this.toAyah() ?? Number.MAX_SAFE_INTEGER,
    );
    const edits = this.segEdits();
    return base.map((g) => {
      const max = ayahCount(g.surah);
      const e = edits[g.surah];
      const from = Math.min(Math.max(1, e?.from ?? g.from), max);
      const to = Math.min(Math.max(from, e?.to ?? g.to), max);
      return { surah: g.surah, from, to };
    });
  });

  /** معلومات المقطع الحاليّ: صالح؟ عدد آياته، الجديد منها، وأوجه كلٍّ. */
  readonly range = computed(() => {
    const idx = this.reversed()
      ? segmentIndexes(this.segments())
      : rangeIndexes(this.fromSurah(), this.fromAyah() ?? 0, this.toSurah(), this.toAyah() ?? 0);
    const fresh = freshPart(idx, this.priorSeen());
    return {
      valid: idx.length > 0,
      total: idx.length,
      repeated: idx.length - fresh.fresh.length,
      /** كلّ آيات المقطع محفوظة سابقًا: لا شيء جديد يُحسَب فتُقفَل خانة الأوجه على صفر. */
      allRepeated: idx.length > 0 && fresh.fresh.length === 0,
      freshPages: fresh.pages,
      allPages: pagesFromLines(linesOf(idx)),
    };
  });

  /** الأوجه المسمّعة المعتمدة: رقم المعلّم إن عدّل، وإلّا المحسوب من الآيات الجديدة. */
  readonly recitedPages = computed(() =>
    this.range().allRepeated ? 0 : (this.recitedOverride() ?? this.range().freshPages),
  );

  /** قيود الآيات بحسب السور المختارة فعليًّا. */
  readonly maxFromAyah = computed(() => ayahCount(this.fromSurah()));
  readonly maxToAyah = computed(() => ayahCount(this.toSurah()));
  readonly minToAyah = computed(() =>
    this.toSurah() !== 0 && this.toSurah() === this.fromSurah() ? (this.fromAyah() ?? 1) : 1,
  );

  // ---- الاقتراح الذكيّ لبداية المقطع (من آخر تسميع «حفظ جديد» للطالب) ----
  /** ملاحظة توضيحيّة صغيرة تظهر عند تفعيل الاقتراح — null إن لم يُفعَّل. */
  readonly smartHint = signal<string | null>(null);
  /** حين لا يُعرَف اتّجاه الطالب بعد: خيارا «التالية/السابقة» ليختار المعلّم بلمسة. */
  readonly choices = signal<{ surah: number; label: string }[]>([]);
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
    // وفقط إن كانت الحقول فارغة (لم يبدأ المعلّم الكتابة يدويًّا بعد).
    effect(() => {
      if (this.smartPrefillDone || this.entry() !== null) {
        this.smartPrefillDone = true;
        return;
      }
      const history = this.history();
      if (history === undefined) return; // لم تصل البيانات بعد — يُعاد التشغيل تلقائيًّا عند وصولها
      this.smartPrefillDone = true;
      untracked(() => this.applySmartDefaults(history));
    });

    // أوجه المؤقّت تتبع المقطع تلقائيًّا ما لم يعدّلها المعلّم: الحفظ الجديد بأوجه آياته
    // الجديدة، والمراجعة بأوجه المقطع كلّه. (بحدّ أدنى نصف وجه ليبقى للمؤقّت معنى.)
    effect(() => {
      const r = this.range();
      if (!r.valid || this.timerTouched) return;
      const p = this.kind() === 'new' ? r.freshPages : r.allPages;
      untracked(() => this.pages.set(Math.max(0.5, this.clampPages(p))));
    });

    // قيود الآيات: لا تتجاوز عدد آيات السورة الفعليّ، ولا تسبق البداية في السورة نفسها.
    effect(() => {
      const max = this.maxFromAyah();
      const a = untracked(() => this.fromAyah());
      if (max > 0 && a !== null && a > max) this.fromAyah.set(max);
    });
    effect(() => {
      const max = this.maxToAyah();
      const a = untracked(() => this.toAyah());
      if (max > 0 && a !== null && a > max) this.toAyah.set(max);
    });
    // اختيار «من سورة» يملأ «إلى سورة» بنفسها أوّل مرّة (أشيع الحالات: مقطع داخل سورة).
    effect(() => {
      const from = this.fromSurah();
      if (from > 0 && untracked(() => this.toSurah()) === 0) this.toSurah.set(from);
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
      this.fromSurah() === 0 &&
      this.fromAyah() === null &&
      this.toSurah() === 0 &&
      this.toAyah() === null;
    if (!untouched) return;
    // آخر تسميع «حفظ جديد» فعليّ (الأحدث بالتاريخ ثمّ وقت الإنشاء).
    const last = history
      .filter((r) => kindOf(r) === 'new' && isActualRecitation(r))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
    if (!last) return; // طالب لم يسمّع من قبل: يبقى المقطع فارغًا تمامًا.

    if (scoreOf(last) < TASMIE_PASS) {
      // لم يبلغ نسبة النجاح: يُعاد المقطع نفسه (بمقاطعه إن كان عكسيًّا).
      this.loadRange(last);
      this.smartHint.set(
        `أُعيد نفس مقطع آخر تسميع (${this.rangeText(last)}) لأنّه لم يبلغ نسبة النجاح.`,
      );
      return;
    }

    // اتّجاه الطالب يُفهَم من تسميعاته: تصاعديّ أو تنازليّ — والمقطع التالي يتبعه.
    const dir = inferDirection(history);
    const dirText = dir === 'desc' ? 'تنازليّ' : 'تصاعديّ';
    const step = nextStep(last, dir);
    switch (step.type) {
      case 'continue':
        this.prefill(step.surah, step.ayah);
        this.smartHint.set(
          `يتابع تلقائيًّا من حيث انتهى آخر تسميع ناجح — ${surahName(step.surah)} ${step.ayah}. عدّل «إلى» حسب المقطع المطلوب.`,
        );
        break;
      case 'surah':
        this.prefill(step.surah, 1);
        this.smartHint.set(
          `اتّجاه حفظ الطالب ${dirText}: يتابع من ${surahName(step.surah)} بعد أن أنهى ${surahName(recitationEnd(last).surah)}. عدّل «إلى» حسب المقطع المطلوب.`,
        );
        break;
      case 'choose': {
        // أنهى سورة ولا يُعرَف اتّجاهه بعد: نقترح الخيارين ويختار المعلّم بلمسة.
        const options: { surah: number; label: string }[] = [];
        if (step.next)
          options.push({ surah: step.next, label: `التالية: ${surahName(step.next)}` });
        if (step.prev)
          options.push({ surah: step.prev, label: `السابقة: ${surahName(step.prev)}` });
        this.choices.set(options);
        this.smartHint.set(
          'أنهى الطالب سورة — من أيّ سورة يتابع؟ (يتعلّم التطبيق اتّجاهه من اختيارك)',
        );
        break;
      }
      case 'end':
        this.smartHint.set(
          step.direction === 'asc'
            ? '🎉 أكمل الطالب حفظ القرآن الكريم كاملًا في آخر تسميع ناجح مسجَّل له!'
            : '🎉 أكمل الطالب حفظ السور حتى الفاتحة في آخر تسميع ناجح مسجَّل له!',
        );
        break;
    }
  }

  /** يبدأ المقطع من آية بعينها (من وإلى السورة نفسها والآية نفسها، ليعدّل المعلّم «إلى»). */
  private prefill(surahNo: number, ayah: number): void {
    this.fromSurah.set(surahNo);
    this.fromAyah.set(ayah);
    this.toSurah.set(surahNo);
    this.toAyah.set(ayah);
    this.segEdits.set({});
  }

  /** يختار المعلّم من خيارَي «التالية/السابقة» — فيبدأ المقطع من أوّل تلك السورة. */
  pickChoice(surahNo: number): void {
    this.prefill(surahNo, 1);
    this.choices.set([]);
    this.smartHint.set(null);
  }

  /** نصّ مقطع تسميع محفوظ: «النبأ 1 ← النبأ 20» أو «النبأ 1-40، المرسلات 1-50». */
  private rangeText(r: RecitationRecord): string {
    return r.segments?.length
      ? r.segments.map((g) => `${surahName(g.surah)} ${g.from}-${g.to}`).join('، ')
      : `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`;
  }

  /** يحمّل مقطع سجلّ محفوظ في الحقول (ومقاطعه إن كان بترتيب سور عكسيّ). */
  private loadRange(r: RecitationRecord): void {
    this.fromSurah.set(r.fromSurah);
    this.fromAyah.set(r.fromAyah);
    this.toSurah.set(r.toSurah);
    this.toAyah.set(r.toAyah);
    const edits: Record<number, { from?: number; to?: number }> = {};
    for (const g of r.segments ?? []) edits[g.surah] = { from: g.from, to: g.to };
    this.segEdits.set(edits);
  }

  ngOnInit(): void {
    // تسميعات الطالب كلّها: أساس معرفة ما سبق حفظه (للأوجه الجديدة) والاقتراح الذكيّ.
    this.historySrc.set(this.data.studentRecitations(this.studentId(), this.destroyRef));
    const e = this.entry();
    this.kind.set(e ? kindOf(e) : 'new');
    this.hydrateFrom(e);
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

  /**
   * يملأ حقول النموذج من سجلّ موجود، أو يعيدها لقيمها الافتراضيّة إن كان
   * null (نوع لم يُسجَّل له تسميع بعد بهذه الجلسة). لا يمسّ المؤقّت (يبقى
   * الوقت الجاري مستقلًّا عن نوع التسميع المعروض).
   */
  private hydrateFrom(r: RecitationRecord | null): void {
    if (!r || !isActualRecitation(r)) {
      this.fromSurah.set(0);
      this.fromAyah.set(null);
      this.toSurah.set(0);
      this.toAyah.set(null);
      this.m.hifzErrors = 0;
      this.m.tajweedErrors = 0;
      this.m.promptCount = 0;
      this.m.rating = undefined;
      this.m.notes = '';
      this.pages.set(1);
      this.timerTouched = false;
      this.recitedOverride.set(null);
      this.score.set(TASMIE_PASS);
      return;
    }
    this.loadRange(r);
    this.m.hifzErrors = r.hifzErrors;
    this.m.tajweedErrors = r.tajweedErrors;
    this.m.promptCount = r.promptCount;
    this.m.rating = r.rating;
    this.m.notes = r.notes ?? '';
    this.pages.set(r.pages);
    // محاولة محفوظة: لا يُعاد ضبط أوجه المؤقّت من المقطع، ورقم المعلّم القديم يُحفَظ كما هو.
    this.timerTouched = true;
    this.recitedOverride.set(typeof r.recitedPages === 'number' ? r.recitedPages : null);
    this.score.set(scoreOf(r));
    if (r.durationSec) this.elapsedSec.set(r.durationSec);
  }

  /** نوع التسميع لهذه المحاولة — لا يمسّ بقيّة الحقول. */
  selectKind(kind: RecitationKind): void {
    this.kind.set(kind);
  }

  /** تغيير «من سورة»: يملأ «إلى سورة» أوّل مرّة، ويُسقط تعديلات المقاطع القديمة. */
  setFromSurah(n: number): void {
    // سورة جديدة تُفرِّغ آيتها: آية سورة سابقة لا تصلح لغيرها (كانت تبقى «١١» من البقرة في الكهف).
    if (n !== this.fromSurah()) this.fromAyah.set(null);
    this.fromSurah.set(n);
    this.segEdits.set({});
    this.choices.set([]);
    if (n > 0 && this.toSurah() === 0) this.toSurah.set(n);
  }

  /** تغيير «إلى سورة»: قبل «من سورة» في المصحف = ترتيب عكسيّ (تظهر مقاطعه). */
  setToSurah(n: number): void {
    if (n !== this.toSurah()) this.toAyah.set(null);
    this.toSurah.set(n);
    this.segEdits.set({});
    this.choices.set([]);
  }

  /** عدد آيات سورة — حدّ مقاطع الترتيب العكسيّ. */
  segMax(n: number): number {
    return ayahCount(n);
  }

  /** تعديل آيات مقطع سورة في الترتيب العكسيّ (تُقصّ على عدد آيات السورة). */
  onSeg(surahNo: number, which: 'from' | 'to', e: Event): void {
    const el = e.target as HTMLInputElement;
    const raw = el.value.trim();
    if (raw === '') return;
    const max = ayahCount(surahNo);
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > max) n = max;
    if (String(n) !== raw) el.value = String(n);
    const cur = this.segEdits();
    this.segEdits.set({ ...cur, [surahNo]: { ...cur[surahNo], [which]: n } });
  }

  /** «2. البقرة» — اسم السورة مع رقمها لسطر التلميح. */
  surahLabel(n: number): string {
    return surahName(n);
  }

  /**
   * آية البداية/النهاية: لا تقبل إلّا عددًا صحيحًا ضمن آيات السورة الفعليّة. تُقصّ القيمة
   * الكبيرة فورًا إلى آخر آية؛ أمّا الحدّ الأدنى (آية النهاية لا تسبق البداية) فيُطبَّق عند
   * مغادرة الحقل حتى لا نعطّل كتابة رقم من خانتين (١ ثمّ ١٢).
   */
  onAyah(which: 'from' | 'to', e: Event): void {
    const el = e.target as HTMLInputElement;
    const sig = which === 'from' ? this.fromAyah : this.toAyah;
    const max = which === 'from' ? this.maxFromAyah() : this.maxToAyah();
    const raw = el.value.trim();
    this.segEdits.set({});
    if (raw === '' || max === 0) {
      sig.set(null);
      if (max === 0) el.value = '';
      return;
    }
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > max) n = max;
    sig.set(n);
    if (String(n) !== raw) el.value = String(n);
  }

  onAyahBlur(which: 'from' | 'to', e: Event): void {
    const el = e.target as HTMLInputElement;
    const sig = which === 'from' ? this.fromAyah : this.toAyah;
    const min = which === 'from' ? 1 : this.minToAyah();
    const cur = sig();
    if (cur !== null && cur < min) {
      sig.set(min);
      el.value = String(min);
    }
  }

  /** رقم المعلّم لأوجه الحفظ الجديد: يُقرَّب لأقرب ربع وجه، ويعود تلقائيًّا إن ساوى المحسوب. */
  onRecited(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    if (raw.trim() === '') return;
    this.setRecited(Math.round((Number(raw) || 0) * 4) / 4);
  }

  bumpRecited(delta: number): void {
    this.setRecited(Math.round((this.recitedPages() + delta) * 4) / 4);
  }

  private setRecited(v: number): void {
    if (this.range().allRepeated) return;
    const n = Math.max(0, v);
    this.recitedOverride.set(n === this.range().freshPages ? null : n);
  }

  /** أوجه المؤقّت بيد المعلّم — يتوقّف تتبّعها التلقائيّ للمقطع. */
  setTimerPages(v: number | string): void {
    this.timerTouched = true;
    this.pages.set(this.clampPages(v));
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
    this.timerTouched = true;
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
    const reversed = this.reversed();
    const segments = reversed ? this.segments() : [];
    let fromSurah = this.fromSurah();
    let toSurah = this.toSurah();
    let fromAyah = this.fromAyah() ?? 0;
    let toAyah = this.toAyah() ?? 0;

    if (reversed) {
      // ترتيب سور عكسيّ: المقاطع هي المقطع — كلّ مقطع آياته ضمن سورته ولا يسبق بدايتُه نهايتَه.
      if (
        segments.length === 0 ||
        segments.some((g) => g.from < 1 || g.to > ayahCount(g.surah) || g.from > g.to)
      ) {
        this.notify.error('آيات المقاطع غير صالحة — راجع كلّ سورة');
        return;
      }
      fromSurah = segments[0].surah;
      fromAyah = segments[0].from;
      toSurah = segments[segments.length - 1].surah;
      toAyah = segments[segments.length - 1].to;
    } else {
      // لا مقطع افتراضيّ: لا يُحفَظ تسميع قبل تحديد البداية والنهاية (سورة وآية) فعليًّا.
      if (!fromSurah || !toSurah || !fromAyah || !toAyah) {
        this.notify.error('حدّد بداية المقطع ونهايته: السورة والآية');
        return;
      }
      if (
        fromAyah > ayahCount(fromSurah) ||
        toAyah > ayahCount(toSurah) ||
        fromAyah < 1 ||
        toAyah < 1
      ) {
        this.notify.error('رقم الآية خارج عدد آيات السورة');
        return;
      }
      if (toSurah === fromSurah && toAyah < fromAyah) {
        this.notify.error('نهاية المقطع يجب أن تكون بعد بدايته');
        return;
      }
    }
    if (this.running()) this.stop();
    this.saving.set(true);
    const payload = {
      studentId: this.studentId(),
      circleId: this.circleId(),
      sessionId: this.sessionId(),
      date: this.date(),
      kind: this.kind(),
      fromSurah,
      fromAyah,
      toSurah,
      toAyah,
      // مقاطع بحسب السور — فقط حين يكون الترتيب عكسيًّا (وإلّا مقطع متّصل من البداية للنهاية).
      segments: reversed ? segments : undefined,
      pages: Number(this.pages()) || 0,
      // رقم المعلّم لأوجه الحفظ الجديد يُحفَظ فقط إن عدّله — وإلّا تُحسب من الآيات عند كلّ تقرير.
      recitedPages:
        this.kind() === 'new' && this.recitedOverride() !== null && !this.range().allRepeated
          ? (this.recitedOverride() as number)
          : undefined,
      score: this.score(),
      hifzErrors: this.clampErrorCount(this.m.hifzErrors),
      tajweedErrors: this.clampErrorCount(this.m.tajweedErrors),
      promptCount: this.clampErrorCount(this.m.promptCount),
      rating: this.score() >= this.tasmiePass ? (this.m.rating ?? 'very_good') : undefined,
      durationSec: this.elapsedSec() || undefined,
      notes: this.m.notes.trim() || undefined,
    };
    let savedId = this.entry()?.id ?? '';
    const ok = await this.notify.run(
      () =>
        this.data
          .upsertSessionRecitation(this.sessionId(), this.studentId(), payload, this.entry()?.id)
          .then((id) => {
            savedId = id;
            return true;
          }),
      { success: 'حُفظ التسميع', error: 'تعذّر حفظ التسميع' },
    );
    this.saving.set(false);
    if (!ok) return;
    this.saved.emit();

    // «حفظ جديد» ناجح: تُضاف إلى مقرّر الطالب **السور التي اكتملت كلّ آياتها فقط** (بما نجح فيه
    // في كلّ جلساته)، لا كلّ سورة لمسها المقطع — ويُنبَّه عند اكتمال جزء بآياته.
    // التسميع نفسه حُفظ بنجاح بالفعل (التوست أعلاه) — فشل هذه الخطوة الثانويّة
    // (اتصال ضعيف مثلًا) يجب أن يظهر بوضوح لا أن يختفي بصمت وسط نجاح ظاهريّ.
    if (this.kind() === 'new' && this.score() >= this.tasmiePass) {
      try {
        const st = await this.data.getStudent(this.studentId());
        const others = (this.history() ?? []).filter((r) => r.id !== savedId);
        const saved = { ...payload, id: savedId, createdAt: Date.now() } as RecitationRecord;
        const before = memorizedAyahs(st, others);
        const after = memorizedAyahs(st, [...others, saved]);
        const touched = new Set<number>();
        for (const i of recitationIndexes(saved)) touched.add(surahOfIndex(i));
        const { added } = await this.data.mergeStudentMemorizedSurahs(
          this.studentId(),
          coveredSurahs(touched, after),
        );
        if (added > 0) {
          this.notify.success(
            added === 1 ? 'أُضيفت سورة إلى مقرّر الطالب' : `أُضيفت ${added} سور إلى مقرّر الطالب`,
          );
        }
        const wasDone = new Set(completedJuzOf(before));
        const newlyDone = completedJuzOf(after).filter((j) => !wasDone.has(j));
        if (newlyDone.length > 0) {
          const jz = newlyDone.map((j) => `الجزء ${j}`).join(' و');
          this.notify.info(`🎉 أكمل الطالب حفظ ${jz} — سجّل السرد والاختبار من صفحتيهما.`);
        }
      } catch (e) {
        console.error(e);
        this.notify.error('حُفظ التسميع، لكن تعذّر تحديث مقرّر الطالب — أعِد فتح السجلّ للتأكّد');
      }
    }
  }
}
