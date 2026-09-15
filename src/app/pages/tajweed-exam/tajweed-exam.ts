import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12 } from '../../core/time';
import { EXAM_PASS, circleLabel, clampScore, passLabel, type Student } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';
import { ScoreInputComponent } from '../../shared/score-input';
import {
  ReportImageComponent,
  type ReportImageMeta,
  type ReportImagePage,
} from '../../shared/report-image';

/**
 * تفاصيل اختبار تجويد واحد: قائمة الطلّاب المستهدَفين + إدخال درجة كلّ طالب
 * (تُزامَن فورًا مع `tajweedExamResults`، ومنها تظهر في صفحة ملفّ الطالب
 * تلقائيًّا — نفس المجموعة، بلا خطوة نسخ يدويّة)، مع تقريرين قابلين للمشاركة
 * (نصّيّ واتساب + صورة).
 */
@Component({
  selector: 'app-tajweed-exam',
  imports: [PageHeaderComponent, ScoreInputComponent, ReportImageComponent],
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
            <div class="num">{{ avgScore() === null ? '—' : avgScore() + '٪' }}</div>
            <div class="label">متوسّط الدرجات</div>
          </div>
        </div>

        <div class="section-title">درجات الطلّاب</div>
        @for (row of roster(); track row.student.id) {
          <div class="card" style="margin-bottom:10px">
            <b>{{ row.student.name }}</b>
            <app-score-input
              [threshold]="examPass"
              [value]="scores[row.student.id] ?? row.score ?? 90"
              (valueChange)="scores[row.student.id] = $event"
            />
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
  readonly examPass = EXAM_PASS;

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
        return { student, score: r?.score ?? null, hasResult: !!r };
      })
      .filter((x): x is { student: Student; score: number | null; hasResult: boolean } => !!x)
      .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ar'));
  });

  readonly gradedCount = computed(() => this.roster().filter((r) => r.hasResult).length);
  readonly avgScore = computed(() => {
    const graded = this.roster().filter((r) => r.hasResult && r.score !== null);
    if (graded.length === 0) return null;
    return Math.round(graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length);
  });

  /** درجات محرَّرة محليًّا قبل الحفظ — كائن عاديّ (لا إشارة) يكفي لأنّ الحفظ صريح بزرّ. */
  scores: Record<string, number> = {};
  readonly saving = signal<string | null>(null);

  readonly circleLabel = circleLabel;
  readonly dmy = dmy;
  readonly weekdayAr = weekdayAr;
  readonly fmt12 = fmt12;

  async saveScore(studentId: string): Promise<void> {
    const e = this.exam();
    if (!e) return;
    const score = clampScore(this.scores[studentId] ?? 90);
    this.saving.set(studentId);
    await this.notify.run(
      () =>
        this.data.upsertTajweedExamResult(
          this.examId,
          this.circleId,
          studentId,
          e.name,
          e.date,
          score,
        ),
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
    const header = `📝 نتائج اختبار: ${e.name}\n${circleLabel(this.circle())} — ${weekdayAr(e.date)} ${dmy(e.date)}`;
    const rows = this.roster();
    const lines = rows.map((r, i) => {
      if (!r.hasResult || r.score === null) return `${i + 1}. ${r.student.name} — لم يُقيَّم بعد`;
      return `${i + 1}. ${r.student.name} — ${r.score}٪ (${passLabel(r.score, EXAM_PASS)})`;
    });
    const rule = '━━━━━━━━━━━━';
    return [header, rule, ...lines, rule, `متوسّط الدرجات: ${this.avgScore() ?? '—'}٪`].join('\n');
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
    const rows = this.roster();
    if (rows.length === 0) return [];
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
            : (r.score as number) >= EXAM_PASS
              ? 'neutral'
              : 'not-recited';
          const placeholderText = ungraded
            ? 'لم يُقيَّم بعد'
            : `${r.score}٪ (${passLabel(r.score as number, EXAM_PASS)})`;
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
