import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12 } from '../../core/time';
import { circleLabel, tajweedExamVerdict, type Student } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';
import {
  ReportImageComponent,
  type ReportImageMeta,
  type ReportImagePage,
} from '../../shared/report-image';

type Rating = 'very_good' | 'excellent';

/**
 * تفاصيل اختبار تجويد واحد: قائمة الطلّاب المستهدَفين + إدخال درجة كلّ طالب
 * (تُزامَن فورًا مع `tajweedExamResults`، ومنها تظهر في صفحة ملفّ الطالب
 * تلقائيًّا — نفس المجموعة، بلا خطوة نسخ يدويّة)، مع تقريرين قابلين للمشاركة
 * (نصّيّ واتساب + صورة).
 */
@Component({
  selector: 'app-tajweed-exam',
  imports: [FormsModule, PageHeaderComponent, ReportImageComponent],
  template: `
    <app-page-header [title]="exam()?.name || 'اختبار التجويد'" />

    <div class="page">
      @if (exam() === null) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الاختبار.</div>
      } @else if (exam(); as e) {
        <div class="card">
          <div class="row-between">
            <b>{{ e.name }}</b>
            <button
              class="icon-btn"
              type="button"
              (click)="confirmDelete()"
              aria-label="حذف الاختبار"
            >
              🗑
            </button>
          </div>
          <p class="muted" style="margin:6px 0 0">
            {{ circleLabel(circle()) }} — {{ weekdayAr(e.date) }} {{ dmy(e.date) }}
            @if (e.time) {
              · {{ fmt12(e.time) }}
            }
            @if (e.durationMin) {
              · {{ e.durationMin }} دقيقة
            }
          </p>
          <p class="muted" style="margin:4px 0 0">
            العلامة الكلّية: <b>{{ e.totalScore }}</b> · علامة النجاح: <b>{{ e.passScore }}</b>
          </p>
        </div>

        <div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="stat">
            <div class="num">{{ e.studentIds.length }}</div>
            <div class="label">مستهدَفون</div>
          </div>
          <div class="stat">
            <div class="num">{{ gradedCount() }}</div>
            <div class="label">قُيِّموا</div>
          </div>
          <div class="stat">
            <div class="num">{{ avgScore() === null ? '—' : avgScore() + '/' + e.totalScore }}</div>
            <div class="label">متوسّط الدرجات</div>
          </div>
        </div>

        <div class="section-title">درجات الطلّاب</div>
        @for (row of roster(); track row.student.id) {
          <div class="card grade-card">
            <b>{{ row.student.name }}</b>
            <div class="grade-row">
              <input
                type="number"
                inputmode="numeric"
                min="0"
                [max]="e.totalScore"
                [ngModel]="scoreOf(row)"
                (ngModelChange)="scores[row.student.id] = $event"
                [ngModelOptions]="{ standalone: true }"
                class="grade-num"
                [attr.aria-label]="'درجة ' + row.student.name"
              />
              <span class="grade-total">/ {{ e.totalScore }}</span>
              <span [class]="'badge ' + (scoreOf(row) < e.passScore ? 'b-absent' : 'b-present')">
                {{ verdictLabel(scoreOf(row), e.passScore, ratingOf(row)) }}
              </span>
            </div>
            @if (scoreOf(row) >= e.passScore) {
              <div class="rating-choice">
                <button
                  type="button"
                  class="rating-opt"
                  [class.active]="(ratingOf(row) ?? 'very_good') === 'very_good'"
                  (click)="setRating(row.student.id, 'very_good')"
                >
                  جيد جدًّا
                </button>
                <button
                  type="button"
                  class="rating-opt"
                  [class.active]="ratingOf(row) === 'excellent'"
                  (click)="setRating(row.student.id, 'excellent')"
                >
                  ممتاز
                </button>
              </div>
            }
            <button
              class="btn btn-primary btn-block"
              type="button"
              [disabled]="saving() === row.student.id"
              (click)="saveScore(row.student.id)"
            >
              {{
                saving() === row.student.id
                  ? 'جارٍ الحفظ…'
                  : row.hasResult
                    ? 'تحديث الدرجة'
                    : 'حفظ الدرجة'
              }}
            </button>
          </div>
        }

        <!-- تقرير نصّيّ + مشاركة واتساب -->
        <div class="card report-card" style="margin-top:12px">
          <b>تقرير نتائج الاختبار</b>
          <p class="muted" style="margin:6px 0 8px;font-size:.82rem">
            يُبنى تلقائيًّا من الدرجات المُسجَّلة — شارِكه في مجموعة أولياء الأمور.
          </p>
          <textarea class="report-text" dir="rtl" rows="10" [value]="reportText()" readonly>
          </textarea>
          <div class="report-actions">
            <button class="btn btn-primary" type="button" (click)="shareWhatsApp()">
              📲 مشاركة عبر واتساب
            </button>
            <button class="btn btn-ghost" type="button" (click)="copyReport()">📋 نسخ</button>
          </div>
        </div>

        <!-- تقرير مصوَّر -->
        <div class="card report-card" style="margin-top:12px">
          <b>تقرير مصوَّر (صورة)</b>
          <p class="muted" style="margin:6px 0 8px;font-size:.82rem">
            نفس النتائج بصيغة صورة جدول جاهزة للمشاركة أو التنزيل.
          </p>
          <app-report-image [pages]="reportImagePages()" [meta]="reportImageMeta()" mode="exam" />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .report-text {
        width: 100%;
        resize: vertical;
        font-family: inherit;
      }
      .report-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        flex-wrap: wrap;
      }
      .grade-card {
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .grade-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .grade-num {
        width: 76px;
        flex-shrink: 0;
        text-align: center;
        font-weight: 800;
        padding: 8px 6px;
      }
      .grade-total {
        color: var(--text-soft);
        font-weight: 700;
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
    `,
  ],
})
export class TajweedExamPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly circleId = this.route.snapshot.paramMap.get('id')!;
  readonly examId = this.route.snapshot.paramMap.get('examId')!;

  readonly circle = this.data.circleLive(this.circleId, this.destroyRef);
  private readonly exams = this.data.tajweedExamsByCircle(this.circleId, this.destroyRef);
  readonly exam = computed(() => {
    const list = this.exams();
    if (list === undefined) return undefined;
    return list.find((e) => e.id === this.examId) ?? null;
  });

  private readonly allStudents = this.data.allStudents(this.destroyRef);
  private readonly results = this.data.tajweedExamResultsByExam(this.examId, this.destroyRef);

  readonly roster = computed(() => {
    const e = this.exam();
    if (!e) return [];
    const students = this.allStudents() ?? [];
    const results = this.results() ?? [];
    return e.studentIds
      .map((sid) => {
        const student = students.find((s) => s.id === sid);
        if (!student) return null;
        const r = results.find((x) => x.studentId === sid);
        return {
          student,
          score: r?.score ?? null,
          rating: r?.rating,
          hasResult: !!r,
        };
      })
      .filter(
        (
          x,
        ): x is {
          student: Student;
          score: number | null;
          rating: Rating | undefined;
          hasResult: boolean;
        } => !!x,
      )
      .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ar'));
  });

  readonly gradedCount = computed(() => this.roster().filter((r) => r.hasResult).length);
  readonly avgScore = computed(() => {
    const graded = this.roster().filter((r) => r.hasResult && r.score !== null);
    if (graded.length === 0) return null;
    return Math.round(graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length);
  });

  /**
   * الدرجات والتقييمات المحرَّرة محليًّا قبل الحفظ — كائنان عاديّان (لا
   * إشارة) يكفيان لأنّ الحفظ صريح بزرّ لكلّ طالب على حدة، لا حفظًا تلقائيًّا
   * فوريًّا يحتاج تفاعليّة `computed()`.
   */
  scores: Record<string, number> = {};
  private ratings: Record<string, Rating> = {};
  readonly saving = signal<string | null>(null);

  readonly circleLabel = circleLabel;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmt12 = fmt12;
  readonly verdictLabel = tajweedExamVerdict;

  /** الدرجة الحاليّة المعروضة لهذا الصفّ — المُحرَّرة محليًّا، وإلا المحفوظة، وإلا صفر. */
  scoreOf(row: { student: Student; score: number | null }): number {
    return this.scores[row.student.id] ?? row.score ?? 0;
  }

  /** التقييم الحاليّ المعروض — المُختار محلّيًّا، وإلا المحفوظ. */
  ratingOf(row: { student: Student; rating: Rating | undefined }): Rating | undefined {
    return this.ratings[row.student.id] ?? row.rating;
  }

  setRating(studentId: string, rating: Rating): void {
    this.ratings[studentId] = rating;
  }

  async saveScore(studentId: string): Promise<void> {
    const e = this.exam();
    if (!e) return;
    const row = this.roster().find((r) => r.student.id === studentId);
    if (!row) return;
    const score = Math.max(0, Math.min(e.totalScore, Math.round(this.scoreOf(row))));
    const rating = score >= e.passScore ? (this.ratingOf(row) ?? 'very_good') : undefined;
    this.saving.set(studentId);
    await this.notify.run(
      () =>
        this.data.upsertTajweedExamResult({
          examId: this.examId,
          circleId: this.circleId,
          studentId,
          examName: e.name,
          date: e.date,
          totalScore: e.totalScore,
          passScore: e.passScore,
          score,
          rating,
        }),
      { success: 'حُفظت الدرجة', error: 'تعذّر حفظ الدرجة' },
    );
    this.saving.set(null);
  }

  async confirmDelete(): Promise<void> {
    const e = this.exam();
    if (!e) return;
    const ok = await this.notify.confirm(`حذف اختبار «${e.name}»؟`, {
      message: 'سيُحذف الاختبار وكلّ درجاته المسجَّلة (يبقى بالإمكان استعادتها من سجلّ الحركات).',
      confirmText: 'حذف',
      danger: true,
    });
    if (!ok) return;
    await this.notify.run(() => this.data.deleteTajweedExam(this.examId), {
      success: 'حُذف الاختبار',
      error: 'تعذّر حذف الاختبار',
    });
    void this.router.navigate(['/circle', this.circleId, 'exams']);
  }

  readonly reportText = computed<string>(() => {
    const e = this.exam();
    if (!e) return '';
    const header = `📝 نتائج اختبار: ${e.name}\n${circleLabel(this.circle())} — ${weekdayAr(e.date)} ${dmy(e.date)}\nالعلامة الكلّية: ${e.totalScore} · علامة النجاح: ${e.passScore}`;
    const rows = this.roster();
    const lines = rows.map((r, i) => {
      if (!r.hasResult || r.score === null) return `${i + 1}. ${r.student.name} — لم يُقيَّم بعد`;
      return `${i + 1}. ${r.student.name} — ${r.score}/${e.totalScore} (${tajweedExamVerdict(r.score, e.passScore, r.rating)})`;
    });
    const rule = '━━━━━━━━━━━━';
    const avg = this.avgScore();
    return [
      header,
      rule,
      ...lines,
      rule,
      `متوسّط الدرجات: ${avg === null ? '—' : avg + '/' + e.totalScore}`,
    ].join('\n');
  });

  shareWhatsApp(): void {
    const text = this.reportText();
    if (!text.trim()) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }

  async copyReport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.reportText());
      this.notify.success('نُسخ التقرير — الصقه في مجموعة أولياء الأمور');
    } catch {
      this.notify.error('تعذّر النسخ — انسخ النصّ يدويًّا');
    }
  }

  readonly reportImageMeta = computed<ReportImageMeta>(() => {
    const e = this.exam();
    if (!e) return { title: '', teacherName: '' };
    return {
      title: `${e.name} — ${circleLabel(this.circle())} — ${weekdayAr(e.date)} ${dmy(e.date)}`,
      teacherName: '',
    };
  });

  readonly reportImagePages = computed<ReportImagePage[]>(() => {
    const e = this.exam();
    const rows = this.roster();
    if (!e || rows.length === 0) return [];
    const size = 10;
    const chunks: ReportImagePage[] = [];
    for (let i = 0; i < rows.length; i += size) {
      const slice = rows.slice(i, i + size);
      chunks.push({
        pageNumber: 0,
        totalPages: 0,
        rows: slice.map((r, j) => {
          const ungraded = !r.hasResult || r.score === null;
          const placeholderClass: 'absent' | 'neutral' | 'not-recited' = ungraded
            ? 'absent'
            : (r.score as number) >= e.passScore
              ? 'neutral'
              : 'not-recited';
          const placeholderText = ungraded
            ? 'لم يُقيَّم بعد'
            : `${r.score}/${e.totalScore} (${tajweedExamVerdict(r.score as number, e.passScore, r.rating)})`;
          return {
            index: i + j + 1,
            name: r.student.name,
            attendanceLabel: '',
            segments: [{ placeholderText, placeholderClass }],
          };
        }),
      });
    }
    chunks.forEach((p, i) => {
      p.pageNumber = i + 1;
      p.totalPages = chunks.length;
    });
    return chunks;
  });
}
