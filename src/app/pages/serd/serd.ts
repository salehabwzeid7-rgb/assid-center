import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import {
  SARD_PASS,
  passLabel,
  scoreOf,
  type Circle,
  type SerdRecord,
  type Student,
} from '../../core/models';
import { completedJuz, juzOfBlock } from '../../core/quran-data';
import { dmy } from '../../core/format';
import { ScoreInputComponent } from '../../shared/score-input';
import { PageHeaderComponent } from '../../shared/page-header';

interface JuzRow {
  juz: number;
  cycles: number;
  lastScore: number | null;
}
interface BlockRow {
  block: number;
  juz: number[];
  /** عدد أجزاء الكتلة الثلاثة التي سُرِد كلٌّ منها مرّة على الأقلّ (٠..٣) */
  revisedCount: number;
  ready: boolean;
  done: boolean;
  cycles: number;
  lastScore: number | null;
}
interface Recording {
  scope: 'juz' | 'block';
  juz: number;
  juzList?: number[];
  cycle: number;
  title: string;
}

/**
 * صفحة السرد — سجلّ مراجعة/سرد الأجزاء المحفوظة وتقييماتها.
 *  · تنبيه لكلّ جزء مكتمل الحفظ ولم يُسرد بعد.
 *  · السرد المجمّع المطلوب لكلّ كتلة ثلاثة أجزاء متتالية.
 *  · وضع الإعداد (?setup=1) للطلاب المسجَّلين بأجزاء محفوظة مسبقًا.
 */
@Component({
  selector: 'app-serd',
  imports: [FormsModule, ScoreInputComponent, PageHeaderComponent],
  template: `
    <app-page-header [title]="'السرد — ' + (student()?.name || 'الطالب')" />

    <div class="page">
      @if (student() === null && loaded()) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الطالب.</div>
      } @else if (student(); as s) {
        @if (setup()) {
          <div class="card setup">
            <b>إعداد سجلّ السرد</b>
            <p class="muted" style="margin:6px 0 0">
              هذا الطالب مسجَّل بأجزاء محفوظة مسبقًا. سجّل حالة سرد كلّ جزء وتقييمه لتكتمل بياناته
              (يُنصح بدورة أو دورتين لكلّ جزء).
            </p>
          </div>
        }

        @if (completed().length === 0) {
          <div class="empty">
            <span class="icon">📗</span>
            لا توجد أجزاء مكتملة الحفظ بعد. يظهر السرد هنا فور إكمال أوّل جزء.
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <div class="num">{{ revisedCount() }}/{{ completed().length }}</div>
              <div class="label">أجزاء سُردت</div>
            </div>
            <div class="stat">
              <div class="num">{{ masteredBlocks() }}</div>
              <div class="label">كتل مُتقنة (٣ أجزاء)</div>
            </div>
            <div class="stat">
              <div class="num">{{ serds()?.length ?? 0 }}</div>
              <div class="label">مرّات السرد</div>
            </div>
          </div>

          <!-- مطلوب: أجزاء لم تُسرد -->
          @if (unrevised().length) {
            <div class="section-title">مطلوب — أجزاء لم تُسرد بعد</div>
            @if (unrevised().length > 1) {
              <div class="card batch">
                <app-score-input
                  label="نسبة موحّدة للسرد الأوّل (٪)"
                  [threshold]="sardPass"
                  [value]="batchScore()"
                  (valueChange)="batchScore.set($event)"
                />
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  [disabled]="saving()"
                  (click)="batchRecord()"
                >
                  تسجيل سرد أوّل لكلّ الأجزاء ({{ unrevised().length }}) بهذه النسبة
                </button>
              </div>
            }
            @for (r of unrevised(); track r.juz) {
              <div class="card need">
                <div class="row-between">
                  <span
                    ><b>الجزء {{ r.juz }}</b> · مكتمل الحفظ ولم يُسرد</span
                  >
                  <button class="btn btn-primary" type="button" (click)="openJuz(r.juz)">
                    ＋ سرد
                  </button>
                </div>
              </div>
            }
          }

          <!-- السرد المجمّع لكلّ ٣ أجزاء -->
          @if (blockRows().length) {
            <div class="section-title">السرد المجمّع — كلّ ٣ أجزاء متتالية</div>
            @for (b of blockRows(); track b.block) {
              <div class="card" [class.milestone]="b.ready" [class.locked]="!b.ready && !b.done">
                <div class="row-between">
                  <span>
                    الأجزاء {{ b.juz[0] }} · {{ b.juz[1] }} · {{ b.juz[2] }}
                    @if (b.done) {
                      <span
                        class="badge"
                        [class.b-present]="b.lastScore! >= sardPass"
                        [class.b-absent]="b.lastScore! < sardPass"
                        style="margin-inline-start:6px"
                      >
                        {{ b.lastScore }}٪ · {{ pass(b.lastScore!) }} · {{ b.cycles }} دورة
                      </span>
                    }
                  </span>
                  @if (b.ready) {
                    <button class="btn btn-primary" type="button" (click)="openBlock(b.block)">
                      ＋ سرد مجمّع
                    </button>
                  } @else if (b.done) {
                    <button class="btn btn-ghost" type="button" (click)="openBlock(b.block)">
                      دورة أخرى
                    </button>
                  } @else {
                    <span class="lock-pill">🔒 مقفل</span>
                  }
                </div>
                @if (b.ready) {
                  <p class="muted" style="margin:6px 0 0">
                    اكتمل حفظ الأجزاء الثلاثة وسُرِد كلٌّ منها — السرد المجمّع مطلوب الآن.
                  </p>
                } @else if (!b.done) {
                  <p class="muted" style="margin:6px 0 0">
                    {{ b.revisedCount }}/3 أجزاء سُرِدت — يُفتح السرد المجمّع بعد حفظ وسرد الأجزاء
                    الثلاثة كلٌّ على حدة.
                  </p>
                }
              </div>
            }
          }

          <!-- الأجزاء المسرودة -->
          @if (revisedRows().length) {
            <div class="section-title">الأجزاء المسرودة</div>
            @for (r of revisedRows(); track r.juz) {
              <div class="list-item" style="cursor:default">
                <span class="avatar">{{ r.juz }}</span>
                <span class="grow">
                  <span class="primary">الجزء {{ r.juz }}</span>
                  <span class="secondary">
                    {{ r.cycles }} دورة · آخر درجة {{ r.lastScore }}٪ ({{ pass(r.lastScore!) }})
                    @if (r.cycles < 2) {
                      · يُنصح بدورة ثانية
                    }
                  </span>
                </span>
                <button
                  class="btn btn-ghost"
                  style="padding:6px 12px"
                  type="button"
                  (click)="openJuz(r.juz)"
                >
                  ＋ دورة
                </button>
              </div>
            }
          }

          <!-- السجلّ الكامل -->
          <div class="section-title">سجلّ السرد ({{ serds()?.length ?? 0 }})</div>
          @if (serds() === undefined) {
            <div class="spinner"></div>
          } @else if (serds()!.length === 0) {
            <div class="empty"><span class="icon">📄</span> لا سجلّات سرد بعد.</div>
          } @else {
            @for (rec of serds(); track rec.id) {
              <div class="card">
                <div class="row-between">
                  <b>{{ scopeText(rec) }}</b>
                  <span
                    class="badge"
                    [class.b-present]="scoreOf(rec) >= sardPass"
                    [class.b-absent]="scoreOf(rec) < sardPass"
                  >
                    {{ scoreOf(rec) }}٪ · {{ pass(scoreOf(rec)) }}
                  </span>
                </div>
                <div class="muted" style="font-size:.84rem;margin-top:4px">
                  الدورة {{ rec.cycle }} · {{ dmy(rec.date) }}
                </div>
                @if (rec.notes) {
                  <div style="margin-top:6px">{{ rec.notes }}</div>
                }
                <button
                  class="btn btn-danger"
                  style="margin-top:8px;padding:6px 12px"
                  type="button"
                  (click)="removeSerd(rec.id)"
                >
                  حذف
                </button>
              </div>
            }
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>

    <!-- نافذة تسجيل سرد -->
    @if (recording(); as rec) {
      <div class="modal-backdrop" (click)="recording.set(null)">
        <form class="modal serd-modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <h3>{{ rec.title }}</h3>
          <p>الدورة {{ rec.cycle }}</p>

          <app-score-input
            label="نسبة السرد (٪)"
            [threshold]="sardPass"
            [value]="score()"
            (valueChange)="score.set($event)"
          />

          <div class="field">
            <label for="sd-date">التاريخ</label>
            <input id="sd-date" name="sd-date" type="date" [(ngModel)]="date" />
          </div>
          <div class="field">
            <label for="sd-notes">ملاحظات (اختياري)</label>
            <textarea id="sd-notes" name="sd-notes" [(ngModel)]="notes"></textarea>
          </div>

          <div class="modal-actions">
            <button class="btn btn-ghost" type="button" (click)="recording.set(null)">إلغاء</button>
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'جارٍ الحفظ…' : 'حفظ السرد' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [
    `
      .setup {
        border-inline-start: 4px solid var(--green);
      }
      .card.need {
        border-inline-start: 4px solid var(--warn, #a07030);
      }
      .card.milestone {
        border: 1px solid var(--gold);
        background: var(--gold-tint);
      }
      .card.locked {
        opacity: 0.7;
      }
      .lock-pill {
        flex-shrink: 0;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .card.batch {
        background: var(--surface-2);
      }
      .serd-modal {
        max-width: 400px;
        max-height: 88vh;
        overflow-y: auto;
        text-align: start;
      }
      .serd-modal h3 {
        margin-bottom: 2px;
      }
    `,
  ],
})
export class SerdPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly setup = signal(this.route.snapshot.queryParamMap.get('setup') === '1');
  readonly student = signal<Student | null>(null);
  readonly circle = signal<Circle | null>(null);
  readonly loaded = signal(false);

  readonly serds = this.data.serdByStudent(this.id, this.destroyRef);
  readonly dmy = dmy;
  readonly sardPass = SARD_PASS;
  readonly scoreOf = scoreOf;

  readonly score = signal(90);
  readonly batchScore = signal(90);
  readonly recording = signal<Recording | null>(null);
  readonly saving = signal(false);
  date = today();
  notes = '';

  readonly completed = computed(() => completedJuz(this.student()?.memorizedSurahs ?? []));

  private groupByJuz(scope: 'juz' | 'block'): Map<number, SerdRecord[]> {
    const map = new Map<number, SerdRecord[]>();
    for (const r of this.serds() ?? []) {
      if (r.scope !== scope) continue;
      const arr = map.get(r.juz);
      if (arr) arr.push(r);
      else map.set(r.juz, [r]);
    }
    return map;
  }
  /** سجلّات سرد كلّ جزء (scope='juz') — الأحدث أوّلًا (المصدر مرتَّب تنازليًّا). */
  private readonly juzSerds = computed(() => this.groupByJuz('juz'));
  /** سجلّات السرد المجمّع لكلّ كتلة (المفتاح = رقم الكتلة). */
  private readonly blockSerdMap = computed(() => this.groupByJuz('block'));

  readonly juzRows = computed<JuzRow[]>(() =>
    this.completed().map((juz) => {
      const list = this.juzSerds().get(juz) ?? [];
      return { juz, cycles: list.length, lastScore: list[0] ? scoreOf(list[0]) : null };
    }),
  );
  readonly unrevised = computed(() => this.juzRows().filter((r) => r.cycles === 0));
  readonly revisedRows = computed(() => this.juzRows().filter((r) => r.cycles > 0));
  readonly revisedCount = computed(() => this.revisedRows().length);

  readonly blockRows = computed<BlockRow[]>(() => {
    const done = new Set(this.completed());
    const out: BlockRow[] = [];
    for (let b = 1; b <= 10; b++) {
      const juz = juzOfBlock(b);
      // شرط الظهور: حفظ الأجزاء الثلاثة كاملةً
      if (!juz.every((j) => done.has(j))) continue;
      // شرط الفتح: سرد كلّ جزء منها منفردًا مرّةً على الأقلّ
      const revisedCount = juz.filter((j) => (this.juzSerds().get(j)?.length ?? 0) >= 1).length;
      const eachRevised = revisedCount === 3;
      const bs = this.blockSerdMap().get(b) ?? [];
      out.push({
        block: b,
        juz,
        revisedCount,
        ready: eachRevised && bs.length === 0,
        done: bs.length > 0,
        cycles: bs.length,
        lastScore: bs[0] ? scoreOf(bs[0]) : null,
      });
    }
    return out;
  });
  readonly masteredBlocks = computed(() => this.blockRows().filter((b) => b.done).length);

  async ngOnInit(): Promise<void> {
    const s = await this.data.getStudent(this.id);
    this.student.set(s);
    this.loaded.set(true);
    if (s) this.circle.set(await this.data.getCircle(s.circleId));
  }

  scopeText(r: SerdRecord): string {
    return r.scope === 'block' && r.juzList?.length
      ? `سرد مجمّع — الأجزاء ${r.juzList.join(' · ')}`
      : `سرد الجزء ${r.juz}`;
  }

  openJuz(juz: number): void {
    const cycle = (this.juzSerds().get(juz)?.length ?? 0) + 1;
    this.reset();
    this.recording.set({ scope: 'juz', juz, cycle, title: `سرد الجزء ${juz}` });
  }
  openBlock(block: number): void {
    const juz = juzOfBlock(block);
    const cycle = (this.blockSerdMap().get(block)?.length ?? 0) + 1;
    this.reset();
    this.recording.set({
      scope: 'block',
      juz: block,
      juzList: juz,
      cycle,
      title: `سرد مجمّع — الأجزاء ${juz.join(' · ')}`,
    });
  }
  private reset(): void {
    this.score.set(SARD_PASS);
    this.date = today();
    this.notes = '';
  }

  /** «ناجح» عند ≥ ٩٠٪ وإلا «راسب» */
  pass(score: number): string {
    return passLabel(score, SARD_PASS);
  }

  async save(): Promise<void> {
    const rec = this.recording();
    const s = this.student();
    if (!rec || !s) return;
    this.saving.set(true);
    const ok = await this.notify.run(
      () =>
        this.data
          .addSerd({
            studentId: s.id,
            circleId: s.circleId,
            scope: rec.scope,
            juz: rec.juz,
            juzList: rec.juzList,
            score: this.score(),
            cycle: rec.cycle,
            date: this.date,
            notes: this.notes.trim() || undefined,
          })
          .then(() => true),
      { success: 'سُجّل السرد', error: 'تعذّر حفظ السرد' },
    );
    this.saving.set(false);
    if (ok) this.recording.set(null);
  }

  async batchRecord(): Promise<void> {
    const s = this.student();
    const list = this.unrevised();
    if (!s || list.length === 0) return;
    this.saving.set(true);
    const ok = await this.notify.run(
      () =>
        Promise.all(
          list.map((r) =>
            this.data.addSerd({
              studentId: s.id,
              circleId: s.circleId,
              scope: 'juz',
              juz: r.juz,
              score: this.batchScore(),
              cycle: 1,
              date: today(),
            }),
          ),
        ).then(() => true),
      { success: 'سُجّل سرد أوّل لكلّ الأجزاء', error: 'تعذّر حفظ السرد' },
    );
    this.saving.set(false);
    void ok;
  }

  async removeSerd(id: string): Promise<void> {
    if (!(await this.notify.confirm('حذف سجلّ السرد؟', { confirmText: 'حذف', danger: true })))
      return;
    await this.notify.run(() => this.data.deleteSerd(id), { success: 'حُذف السجلّ' });
  }
}
