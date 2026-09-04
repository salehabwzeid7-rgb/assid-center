import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import {
  ATTENDANCE_LABELS,
  circleTypeLabel,
  studentCircleIds,
  type Circle,
  type Student,
} from '../../core/models';
import { dmy } from '../../core/format';
import { JUZ_SURAHS, completedJuz } from '../../core/quran-data';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * ملفّ الطالب — يعرض كلّ التفاصيل مباشرةً (المستوى، جوال ولي الأمر، المقرّر)
 * دون الحاجة لفتح شاشة فرعيّة. تسجيل التسميع والتقييم اليوميّ لا يتمّ من هنا،
 * بل من داخل الحلقة أو الجلسة النشطة فقط.
 */
@Component({
  selector: 'app-student',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="student()?.name || 'الطالب'" />

    <div class="page">
      @if (student() === null && loaded()) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الطالب.</div>
      } @else if (student(); as s) {
        <!-- بطاقة الهوية -->
        <div class="card">
          <div class="row-between">
            <div class="grow">
              <h2 style="font-size:1.15rem;margin:0">{{ s.name }}</h2>
              <div class="id-meta">
                @for (c of studentCircles(); track c.id) {
                  <a
                    class="circle-chip"
                    [class.t-tajweed]="c.type === 'tajweed'"
                    [routerLink]="['/circle', c.id]"
                  >
                    {{ c.name }}
                    @if (typeText(c)) {
                      <span class="dot-sep">·</span> {{ typeText(c) }}
                    }
                  </a>
                }
                @if (studentCircles().length === 0) {
                  <span class="off">بلا حلقة</span>
                }
                @if (!s.active) {
                  <span class="off">غير نشط</span>
                }
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
              <a class="btn btn-ghost" [routerLink]="['/student', s.id, 'serd']">السرد</a>
              <a class="btn btn-ghost" [routerLink]="['/student', s.id, 'exam']">الاختبار</a>
              <a class="btn btn-ghost" [routerLink]="['/student', s.id, 'edit']">تعديل</a>
            </div>
          </div>
        </div>

        <!-- التفاصيل الكاملة — تُعرض مباشرةً -->
        <div class="card details">
          <div class="det-row">
            <span class="k">المستوى / الصف</span>
            <span class="v">{{ s.level || '—' }}</span>
          </div>
          <div class="det-row">
            <span class="k">تاريخ الميلاد</span>
            <span class="v">{{ s.birthDate ? dmy(s.birthDate) : '—' }}</span>
          </div>
          <div class="det-row">
            <span class="k">جوال ولي الأمر</span>
            @if (s.guardianPhone) {
              <a class="v link" [href]="'tel:' + s.guardianPhone" dir="ltr">{{
                s.guardianPhone
              }}</a>
            } @else {
              <span class="v">—</span>
            }
          </div>
          <div class="det-row col">
            <span class="k">المقرّر الحالي</span>
            <span class="v plan">{{ s.currentPlan || '—' }}</span>
          </div>
        </div>

        <!-- المقرّر القرآنيّ — يُزامَن تلقائيًّا مع الجلسات والتعديل -->
        <div class="section-title">المقرّر القرآنيّ</div>
        <div class="card">
          @if (memoCount() === 0) {
            <p class="muted" style="margin:0">
              لم يُسجَّل حفظ بعد — يُحدَّث تلقائيًّا عند تسجيل «حفظ جديد» في الجلسة، أو من «تعديل».
            </p>
          } @else {
            <p class="muted" style="margin:0 0 10px">
              <b style="color:var(--green)">{{ fullJuz() }}</b> جزءًا كاملًا ·
              <b style="color:var(--green)">{{ memoCount() }}</b> سورة محفوظة ·
              <b style="color:var(--green)">{{ revisedJuzCount() }}</b> جزءًا مسرودًا ·
              <b style="color:var(--green)">{{ examinedJuzCount() }}</b> جزءًا مُختبَرًا
            </p>
            <div class="juz-strip">
              @for (c of juzCells(); track c.juz) {
                <span
                  class="jz"
                  [class.partial]="c.state === 'partial'"
                  [class.full]="c.state === 'full'"
                  [attr.title]="'الجزء ' + c.juz + ' — ' + c.have + '/' + c.total"
                >
                  {{ c.juz }}
                </span>
              }
            </div>
          }

          @if (unrevisedJuz().length) {
            <a class="serd-alert" [routerLink]="['/student', s.id, 'serd']">
              🔔 أكمل الطالب حفظ {{ unrevisedJuz().length }} جزءًا ولم يُسجَّل سردها — سجّل السرد ›
            </a>
          }
          @if (pendingExamJuz().length) {
            <a class="serd-alert exam-alert" [routerLink]="['/student', s.id, 'exam']">
              📝 أكمل الطالب حفظ {{ pendingExamJuz().length }} جزءًا ولم يُسجَّل اختبارها — سجّل
              الاختبار ›
            </a>
          }

          @if (s.currentPlan) {
            <p style="margin:12px 0 0;line-height:1.8">{{ s.currentPlan }}</p>
          }
        </div>

        <!-- مؤشّرات موجزة -->
        <div class="stat-grid">
          <div class="stat">
            <div class="num">{{ recitationsCount() }}</div>
            <div class="label">جلسات تسميع</div>
          </div>
          <div class="stat">
            <div class="num">{{ totalPages() }}</div>
            <div class="label">مجموع الأوجه</div>
          </div>
          <div class="stat">
            <div class="num">{{ presentRate() }}٪</div>
            <div class="label">نسبة الحضور</div>
          </div>
          <div class="stat">
            <div class="num">{{ sessionsCount() }}</div>
            <div class="label">أيام مسجّلة</div>
          </div>
        </div>

        <p class="hint" style="margin:12px 2px 4px">
          يُسجَّل التسميع والتقييم اليوميّ من داخل جلسة الحلقة النشطة.
        </p>

        <!-- سجلّ الحضور -->
        <div class="section-title">سجلّ الحضور</div>
        <div class="card" style="display:flex;gap:14px;flex-wrap:wrap">
          <span
            >حاضر: <b>{{ attCount('present') }}</b></span
          >
          <span
            >متأخر: <b>{{ attCount('late') }}</b></span
          >
          <span
            >مأذون: <b>{{ attCount('excused') }}</b></span
          >
          <span
            >غائب: <b>{{ attCount('absent') }}</b></span
          >
        </div>
        @if (attendance() === undefined) {
          <div class="spinner"></div>
        } @else if (attendance()!.length === 0) {
          <div class="empty"><span class="icon">📋</span> لا يوجد سجل حضور بعد.</div>
        } @else {
          @for (a of attendance(); track a.id) {
            <div class="list-item" style="cursor:default">
              <span class="grow"
                ><span class="primary">{{ dmy(a.date) }}</span></span
              >
              <span [class]="'badge b-' + a.status">{{ attLabels[a.status] }}</span>
            </div>
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: [
    `
      .id-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .circle-chip {
        font-weight: 700;
        font-size: 0.8rem;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--green-tint);
        color: var(--green);
      }
      .circle-chip.t-tajweed {
        background: var(--gold-tint);
        color: var(--gold-deep);
      }
      .dot-sep {
        opacity: 0.6;
      }
      .off {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--danger);
      }
      .details {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-top: 10px;
        padding: 4px 16px;
      }
      .det-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 0;
        border-bottom: 1px solid var(--border);
      }
      .det-row:last-child {
        border-bottom: 0;
      }
      .det-row.col {
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
      }
      .det-row .k {
        color: var(--text-soft);
        font-size: 0.85rem;
      }
      .det-row .v {
        font-weight: 700;
      }
      .det-row .v.link {
        color: var(--green);
      }
      .det-row .v.plan {
        font-weight: 400;
        line-height: 1.7;
      }
      .juz-strip {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 4px;
      }
      .jz {
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        border-radius: 6px;
        font-size: 0.68rem;
        font-weight: 700;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-soft);
        font-variant-numeric: tabular-nums;
      }
      .jz.partial {
        background: var(--gold-tint);
        border-color: var(--gold);
        color: var(--gold-deep);
      }
      .jz.full {
        background: var(--green);
        border-color: var(--green);
        color: #fff;
      }
      .serd-alert {
        display: block;
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: var(--radius-xs);
        background: var(--warn-bg, #f3e8d8);
        color: var(--warn, #a07030);
        font-weight: 700;
        font-size: 0.86rem;
      }
      .serd-alert.exam-alert {
        margin-top: 8px;
        background: var(--green-tint);
        color: var(--green);
      }
    `,
  ],
})
export class StudentPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly student = signal<Student | null>(null);
  readonly loaded = signal(false);

  private readonly allCircles = this.data.circles(this.destroyRef);
  readonly studentCircles = computed(() => {
    const cs = this.allCircles() ?? [];
    return studentCircleIds(this.student()).flatMap((id) => {
      const c = cs.find((x) => x.id === id);
      return c ? [c] : [];
    });
  });

  readonly attLabels = ATTENDANCE_LABELS;
  readonly dmy = dmy;

  typeText(c: Circle): string {
    return circleTypeLabel(c);
  }

  private readonly recitations = this.data.studentRecitations(this.id, this.destroyRef);
  readonly attendance = this.data.studentAttendance(this.id, this.destroyRef);
  private readonly serds = this.data.serdByStudent(this.id, this.destroyRef);
  private readonly exams = this.data.examsByStudent(this.id, this.destroyRef);

  private readonly memorized = computed(() => new Set(this.student()?.memorizedSurahs ?? []));
  readonly memoCount = computed(() => this.memorized().size);
  readonly juzCells = computed(() => {
    const set = this.memorized();
    return JUZ_SURAHS.map((list, i) => {
      const have = list.filter((n) => set.has(n)).length;
      return {
        juz: i + 1,
        have,
        total: list.length,
        state: have === 0 ? 'none' : have === list.length ? 'full' : 'partial',
      };
    });
  });
  readonly fullJuz = computed(() => this.juzCells().filter((c) => c.state === 'full').length);

  /** أرقام الأجزاء المكتملة حفظًا التي سُرِد كلٌّ منها مرّة واحدة على الأقلّ. */
  private readonly revisedJuzSet = computed(
    () => new Set((this.serds() ?? []).filter((r) => r.scope === 'juz').map((r) => r.juz)),
  );
  readonly revisedJuzCount = computed(
    () =>
      completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) => this.revisedJuzSet().has(j))
        .length,
  );
  /** أجزاء مكتملة الحفظ ولم تُسرد بعد — مصدر تنبيه السرد. */
  readonly unrevisedJuz = computed(() =>
    completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) => !this.revisedJuzSet().has(j)),
  );

  /** أرقام الأجزاء المكتملة حفظًا التي اختُبر كلٌّ منها مرّة واحدة على الأقلّ. */
  private readonly examinedJuzSet = computed(() => new Set((this.exams() ?? []).map((e) => e.juz)));
  readonly examinedJuzCount = computed(
    () =>
      completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) =>
        this.examinedJuzSet().has(j),
      ).length,
  );
  /** أجزاء مكتملة الحفظ ولم تُختبر بعد — مصدر تنبيه الاختبار (كلّ جزء مستقلّ). */
  readonly pendingExamJuz = computed(() =>
    completedJuz(this.student()?.memorizedSurahs ?? []).filter(
      (j) => !this.examinedJuzSet().has(j),
    ),
  );

  readonly recitationsCount = computed(() => this.recitations()?.length ?? 0);
  readonly totalPages = computed(() => {
    const sum = (this.recitations() ?? []).reduce((t, r) => t + (Number(r.pages) || 0), 0);
    return Math.round(sum * 10) / 10;
  });
  readonly sessionsCount = computed(() => this.attendance()?.length ?? 0);
  readonly presentRate = computed(() => {
    const list = this.attendance() ?? [];
    if (list.length === 0) return 0;
    const ok = list.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((ok / list.length) * 100);
  });

  async ngOnInit(): Promise<void> {
    this.student.set(await this.data.getStudent(this.id));
    this.loaded.set(true);
  }

  attCount(status: string): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }
}
