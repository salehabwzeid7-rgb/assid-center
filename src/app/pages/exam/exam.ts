import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import {
  EXAM_PASS,
  isHifzCircle,
  passLabel,
  scoreOf,
  studentCircleIds,
  type ExamRecord,
  type Student,
} from '../../core/models';
import { completedJuz } from '../../core/quran-data';
import { dmy } from '../../core/format';
import { ScoreInputComponent } from '../../shared/score-input';
import { PageHeaderComponent } from '../../shared/page-header';

interface JuzRow {
  juz: number;
  attempts: number;
  lastScore: number | null;
}
interface Recording {
  juz: number;
  attempt: number;
  title: string;
}

/**
 * صفحة الاختبار — سجلّ اختبار الأجزاء المحفوظة وتقييماتها.
 *
 * على النقيض من السرد: لا كتل مجمّعة إطلاقًا. كلّ جزء مكتمل الحفظ يفتح اختبارًا
 * مستقلًّا خاصًّا به. تنبيه لكلّ جزء لم يُختبر بعد، ومحاولات متعدّدة لكلّ جزء.
 * وضع الإعداد (?setup=1) للطلاب المسجَّلين بأجزاء محفوظة مسبقًا.
 */
@Component({
  selector: 'app-exam',
  imports: [FormsModule, ScoreInputComponent, PageHeaderComponent],
  template: `
    <app-page-header [title]="'الاختبار — ' + (student()?.name || 'الطالب')" />

    <div class="page">
      @if (student() === null) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الطالب.</div>
      } @else if (student(); as s) {
        @if (setup()) {
          <div class="card setup">
            <b>إعداد سجلّ الاختبار</b>
            <p class="muted" style="margin:6px 0 0">
              هذا الطالب مسجَّل بأجزاء محفوظة مسبقًا. سجّل نتيجة اختبار كلّ جزء ليكتمل سجلّه.
            </p>
          </div>
        }

        @if (completed().length === 0) {
          <div class="empty">
            <span class="icon">📝</span>
            لا توجد أجزاء مكتملة الحفظ بعد. يظهر الاختبار هنا فور إكمال أوّل جزء.
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <div class="num">{{ examinedRows().length }}/{{ completed().length }}</div>
              <div class="label">أجزاء اختُبرت</div>
            </div>
            <div class="stat">
              <div class="num">{{ exams()?.length ?? 0 }}</div>
              <div class="label">مرّات الاختبار</div>
            </div>
            <div class="stat">
              <div class="num">{{ avgScore() === null ? '—' : avgScore() + '٪' }}</div>
              <div class="label">متوسّط الدرجات</div>
            </div>
          </div>

          <!-- مطلوب: أجزاء لم تُختبر (كلّ جزء مستقلّ) -->
          @if (pending().length) {
            <div class="section-title">مطلوب — أجزاء لم تُختبر بعد</div>
            @if (pending().length > 1) {
              <div class="card batch">
                <app-score-input
                  label="نسبة موحّدة للاختبار الأوّل (٪)"
                  [threshold]="examPass"
                  [value]="batchScore()"
                  (valueChange)="batchScore.set($event)"
                />
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  [disabled]="saving()"
                  (click)="batchRecord()"
                >
                  تسجيل اختبار أوّل لكلّ الأجزاء ({{ pending().length }}) بهذه النسبة
                </button>
              </div>
            }
            @for (r of pending(); track r.juz) {
              <div class="card need">
                <div class="row-between">
                  <span
                    ><b>الجزء {{ r.juz }}</b> · مكتمل الحفظ ولم يُختبر</span
                  >
                  <button class="btn btn-primary" type="button" (click)="openJuz(r.juz)">
                    ＋ اختبار
                  </button>
                </div>
              </div>
            }
          }

          <!-- الأجزاء المُختبَرة -->
          @if (examinedRows().length) {
            <div class="section-title">الأجزاء المُختبَرة</div>
            @for (r of examinedRows(); track r.juz) {
              <div class="list-item" style="cursor:default">
                <span class="avatar">{{ r.juz }}</span>
                <span class="grow">
                  <span class="primary">الجزء {{ r.juz }}</span>
                  <span class="secondary">
                    {{ r.attempts }} محاولة · آخر درجة {{ r.lastScore }}٪ ({{ pass(r.lastScore!) }})
                  </span>
                </span>
                <button
                  class="btn btn-ghost"
                  style="padding:6px 12px"
                  type="button"
                  (click)="openJuz(r.juz)"
                >
                  ＋ محاولة
                </button>
              </div>
            }
          }

          <!-- السجلّ الكامل -->
          <div class="section-title">سجلّ الاختبار ({{ exams()?.length ?? 0 }})</div>
          @if (exams() === undefined) {
            <div class="spinner"></div>
          } @else if (exams()!.length === 0) {
            <div class="empty"><span class="icon">📄</span> لا سجلّات اختبار بعد.</div>
          } @else {
            @for (rec of exams(); track rec.id) {
              <div class="card">
                <div class="row-between">
                  <b>اختبار الجزء {{ rec.juz }}</b>
                  <span
                    class="badge"
                    [class.b-present]="scoreOf(rec) >= examPass"
                    [class.b-absent]="scoreOf(rec) < examPass"
                  >
                    {{ scoreOf(rec) }}٪ · {{ pass(scoreOf(rec)) }}
                  </span>
                </div>
                <div class="muted" style="font-size:.84rem;margin-top:4px">
                  المحاولة {{ rec.attempt }} · {{ dmy(rec.date) }}
                  @if (rec.examiner) {
                    · المُختبِر: {{ rec.examiner }}
                  }
                </div>
                @if (rec.notes) {
                  <div style="margin-top:6px">{{ rec.notes }}</div>
                }
                <button
                  class="btn btn-danger"
                  style="margin-top:8px;padding:6px 12px"
                  type="button"
                  (click)="removeExam(rec.id)"
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

    <!-- نافذة تسجيل اختبار -->
    @if (recording(); as rec) {
      <div class="modal-backdrop" (click)="recording.set(null)">
        <form class="modal exam-modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <h3>{{ rec.title }}</h3>
          <p>المحاولة {{ rec.attempt }}</p>

          <app-score-input
            label="نسبة الاختبار (٪)"
            [threshold]="examPass"
            [value]="score()"
            (valueChange)="score.set($event)"
          />

          <div class="field">
            <label for="ex-date">التاريخ</label>
            <input id="ex-date" name="ex-date" type="date" [(ngModel)]="date" />
          </div>
          <div class="field">
            <label for="ex-examiner">المُختبِر (اختياري)</label>
            <input id="ex-examiner" name="ex-examiner" [(ngModel)]="examiner" />
          </div>
          <div class="field">
            <label for="ex-notes">ملاحظات (اختياري)</label>
            <textarea id="ex-notes" name="ex-notes" [(ngModel)]="notes"></textarea>
          </div>

          <div class="modal-actions">
            <button class="btn btn-ghost" type="button" (click)="recording.set(null)">إلغاء</button>
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'جارٍ الحفظ…' : 'حفظ الاختبار' }}
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
      .card.batch {
        background: var(--surface-2);
      }
      .exam-modal {
        max-width: 400px;
        max-height: 88vh;
        overflow-y: auto;
        text-align: start;
      }
      .exam-modal h3 {
        margin-bottom: 2px;
      }
    `,
  ],
})
export class ExamPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly setup = signal(this.route.snapshot.queryParamMap.get('setup') === '1');
  /** إشارة حيّة — تنعكس تعديلات المقرّر فورًا على تنبيهات الاختبار (undefined=تحميل · null=محذوف). */
  readonly student = this.data.studentLive(this.id, this.destroyRef);

  private readonly allCircles = this.data.circles(this.destroyRef);
  readonly exams = this.data.examsByStudent(this.id, this.destroyRef);
  readonly dmy = dmy;
  readonly examPass = EXAM_PASS;
  readonly scoreOf = scoreOf;

  readonly score = signal(EXAM_PASS);
  readonly batchScore = signal(EXAM_PASS);
  readonly recording = signal<Recording | null>(null);
  readonly saving = signal(false);
  date = today();
  examiner = '';
  notes = '';

  readonly completed = computed(() => completedJuz(this.student()?.memorizedSurahs ?? []));

  /** سجلّات اختبار كلّ جزء — الأحدث أوّلًا (المصدر مرتَّب تنازليًّا). */
  private readonly juzExams = computed(() => {
    const map = new Map<number, ExamRecord[]>();
    for (const e of this.exams() ?? []) {
      const arr = map.get(e.juz);
      if (arr) arr.push(e);
      else map.set(e.juz, [e]);
    }
    return map;
  });

  readonly juzRows = computed<JuzRow[]>(() =>
    this.completed().map((juz) => {
      const list = this.juzExams().get(juz) ?? [];
      return { juz, attempts: list.length, lastScore: list[0] ? scoreOf(list[0]) : null };
    }),
  );
  readonly pending = computed(() => this.juzRows().filter((r) => r.attempts === 0));
  readonly examinedRows = computed(() => this.juzRows().filter((r) => r.attempts > 0));

  readonly avgScore = computed<number | null>(() => {
    const vals = (this.exams() ?? []).map((e) => scoreOf(e));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  /** حلقة التحفيظ المرتبطة بالطالب (لتخزين سياق سجلّ الاختبار). */
  private hifzCircleId(s: Student): string {
    const cs = this.allCircles() ?? [];
    const ids = studentCircleIds(s);
    const hifz = ids.find((id) => isHifzCircle(cs.find((c) => c.id === id)));
    return hifz ?? ids[0] ?? '';
  }

  openJuz(juz: number): void {
    const attempt = (this.juzExams().get(juz)?.length ?? 0) + 1;
    this.reset();
    this.recording.set({ juz, attempt, title: `اختبار الجزء ${juz}` });
  }
  private reset(): void {
    this.score.set(EXAM_PASS);
    this.date = today();
    this.examiner = '';
    this.notes = '';
  }

  /** «ناجح» عند ≥ ٩٠٪ وإلا «راسب» */
  pass(score: number): string {
    return passLabel(score, EXAM_PASS);
  }

  async save(): Promise<void> {
    const rec = this.recording();
    const s = this.student();
    if (!rec || !s) return;
    this.saving.set(true);
    const ok = await this.notify.run(
      () =>
        this.data
          .addExam({
            studentId: s.id,
            circleId: this.hifzCircleId(s),
            juz: rec.juz,
            score: this.score(),
            attempt: rec.attempt,
            date: this.date,
            examiner: this.examiner.trim() || undefined,
            notes: this.notes.trim() || undefined,
          })
          .then(() => true),
      { success: 'سُجّل الاختبار', error: 'تعذّر حفظ الاختبار' },
    );
    this.saving.set(false);
    if (ok) this.recording.set(null);
  }

  async batchRecord(): Promise<void> {
    const s = this.student();
    const list = this.pending();
    if (!s || list.length === 0) return;
    this.saving.set(true);
    const ok = await this.notify.run(
      () =>
        Promise.all(
          list.map((r) =>
            this.data.addExam({
              studentId: s.id,
              circleId: this.hifzCircleId(s),
              juz: r.juz,
              score: this.batchScore(),
              attempt: 1,
              date: today(),
            }),
          ),
        ).then(() => true),
      { success: 'سُجّل اختبار أوّل لكلّ الأجزاء', error: 'تعذّر حفظ الاختبار' },
    );
    this.saving.set(false);
    void ok;
  }

  async removeExam(id: string): Promise<void> {
    if (!(await this.notify.confirm('حذف سجلّ الاختبار؟', { confirmText: 'حذف', danger: true })))
      return;
    await this.notify.run(() => this.data.deleteExam(id), { success: 'حُذف السجلّ' });
  }
}
