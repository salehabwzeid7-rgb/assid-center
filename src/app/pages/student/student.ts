import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { closeOnBack } from '../../core/back-stack.service';
import {
  ATTENDANCE_LABELS,
  SARD_PASS,
  circleTypeLabel,
  isActualRecitation,
  scoreOf,
  studentCircleIds,
  tajweedExamVerdict,
  type Circle,
  type SerdRecord,
} from '../../core/models';
import { dmy } from '../../core/format';
import { JUZ_SURAHS, completedJuz } from '../../core/quran-data';
import { fracText, lifetimeAttFrac } from '../../core/reports';
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
      @if (student() === null) {
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
              📝 اجتاز الطالب سرد {{ pendingExamJuz().length }} جزءًا ولم يُسجَّل اختبارها — سجّل
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
          <div class="stat" [class.stat-warn]="notRecitedCount() > 0">
            <div class="num">{{ notRecitedCount() }}</div>
            <div class="label">لم يسمّع</div>
          </div>
          <div class="stat">
            <div class="num">{{ totalPages() }}</div>
            <div class="label">مجموع الأوجه</div>
          </div>
          <div class="stat">
            <div class="num">{{ attFrac() }}</div>
            <div class="label">الحضور</div>
          </div>
          <div class="stat">
            <div class="num">{{ sessionsCount() }}</div>
            <div class="label">أيام مسجّلة</div>
          </div>
        </div>

        <p class="hint" style="margin:12px 2px 4px">
          يُسجَّل التسميع والتقييم اليوميّ من داخل جلسة الحلقة النشطة.
        </p>

        <!-- نتائج اختبارات التجويد — تُزامَن تلقائيًّا فور حفظها من صفحة الاختبار -->
        @if (tajweedResults() && tajweedResults()!.length > 0) {
          <div class="section-title">نتائج اختبارات التجويد</div>
          @for (r of tajweedResults(); track r.id) {
            <div class="list-item is-static">
              <span class="grow">
                <span class="primary">{{ r.examName }}</span>
                <span class="secondary">{{ dmy(r.date) }}</span>
              </span>
              <span [class]="'badge ' + (r.score >= r.passScore ? 'b-present' : 'b-absent')">
                {{ r.score }}/{{ r.totalScore }} —
                {{ tajweedExamVerdict(r.score, r.passScore, r.rating) }}
              </span>
            </div>
          }
        }

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
            <div class="list-item is-static">
              <span class="grow"
                ><span class="primary">{{ dmy(a.date) }}</span>
                @if (studentCircles().length > 1) {
                  <span class="secondary">{{ circleName(a.circleId) }}</span>
                }
              </span>
              <span [class]="'badge b-' + a.status">{{ attLabels[a.status] }}</span>
            </div>
          }
        }

        <!-- منطقة الخطر: مسح سجلّ السرد/الاختبارات كاملًا للبدء من جديد -->
        <div class="section-title">منطقة الخطر</div>
        <div class="card danger-zone">
          <p class="muted dz-hint">
            يمسح كلّ سجلّات النوع المختار لهذا الطالب لتبدأ إدخالها من جديد. يمكن التراجع عن المسح
            من «سجلّ الحركات».
          </p>
          <button
            class="btn btn-danger btn-block"
            type="button"
            [disabled]="!serdTotal()"
            (click)="beginWipe('serd')"
          >
            🗑 مسح سجلّ السرد كاملًا ({{ serdTotal() }})
          </button>
          <button
            class="btn btn-danger btn-block"
            type="button"
            style="margin-top:8px"
            [disabled]="!examTotal()"
            (click)="beginWipe('exam')"
          >
            🗑 مسح سجلّ الاختبارات كاملًا ({{ examTotal() }})
          </button>
        </div>

        @if (wipeKind(); as kind) {
          <div class="modal-backdrop" (click)="cancelWipe()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3 style="margin:0 0 8px">
                تأكيد نهائيّ: مسح {{ kind === 'serd' ? 'سجلّ السرد' : 'سجلّ الاختبارات' }}
              </h3>
              <p style="margin:0 0 10px;font-size:.9rem">
                سيُمسح {{ kind === 'serd' ? serdTotal() : examTotal() }} سجلًّا. للتأكيد، اكتب اسم
                الطالب بالضبط:
                <b>{{ s.name }}</b>
              </p>
              <input
                type="text"
                [value]="wipeConfirmName()"
                (input)="wipeConfirmName.set($any($event.target).value)"
                placeholder="اكتب اسم الطالب هنا…"
                autocomplete="off"
                style="margin-bottom:10px"
              />
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost" type="button" (click)="cancelWipe()">إلغاء</button>
                <button
                  class="btn btn-danger"
                  style="flex:1"
                  type="button"
                  [disabled]="wipeConfirmName().trim() !== s.name.trim() || wiping()"
                  (click)="confirmWipe(kind)"
                >
                  {{ wiping() ? 'جارٍ المسح…' : 'مسح نهائيًّا' }}
                </button>
              </div>
            </div>
          </div>
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: [
    `
      .danger-zone {
        border: 1px solid var(--danger-bg);
      }
      .dz-hint {
        margin: 0 0 10px;
        font-size: 0.84rem;
      }
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
      .stat.stat-warn::after {
        background: var(--gold-deep, #a07030);
      }
      .stat.stat-warn .num {
        color: var(--gold-deep, #a07030);
      }
    `,
  ],
})
export class StudentPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  /** إشارة حيّة — تنعكس أيّ تعديلات على الطالب فورًا (undefined=تحميل · null=محذوف). */
  readonly student = this.data.studentLive(this.id, this.destroyRef);

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
  readonly tajweedExamVerdict = tajweedExamVerdict;
  readonly tajweedResults = this.data.studentTajweedExamResults(this.id, this.destroyRef);

  typeText(c: Circle): string {
    return circleTypeLabel(c);
  }

  private readonly recitations = this.data.studentRecitations(this.id, this.destroyRef);
  readonly attendance = this.data.studentAttendance(this.id, this.destroyRef);
  private readonly serds = this.data.serdByStudent(this.id, this.destroyRef);
  private readonly exams = this.data.examsByStudent(this.id, this.destroyRef);
  readonly serdTotal = computed(() => this.serds()?.length ?? 0);
  readonly examTotal = computed(() => this.exams()?.length ?? 0);

  // ---- مسح السجلّ: تأكيد أوّل (تحذير) ثمّ تأكيد ثانٍ بكتابة اسم الطالب ----
  readonly wipeKind = signal<'serd' | 'exam' | null>(null);
  readonly wipeConfirmName = signal('');
  readonly wiping = signal(false);
  private readonly backClose = closeOnBack(
    () => this.wipeKind() !== null,
    () => this.cancelWipe(),
  );

  async beginWipe(kind: 'serd' | 'exam'): Promise<void> {
    const label = kind === 'serd' ? 'سجلّ السرد' : 'سجلّ الاختبارات';
    const n = kind === 'serd' ? this.serdTotal() : this.examTotal();
    const ok = await this.notify.confirm(`مسح ${label} كاملًا؟`, {
      message: `سيُحذف ${n} سجلًّا لـ«${this.student()?.name ?? ''}» ويبدأ إدخاله من جديد. ستُطلب كتابة اسم الطالب في الخطوة التالية.`,
      confirmText: 'متابعة',
      danger: true,
    });
    if (!ok) return;
    this.wipeConfirmName.set('');
    this.wipeKind.set(kind);
  }

  cancelWipe(): void {
    this.wipeKind.set(null);
    this.wipeConfirmName.set('');
  }

  async confirmWipe(kind: 'serd' | 'exam'): Promise<void> {
    const name = this.student()?.name ?? '';
    if (this.wipeConfirmName().trim() !== name.trim() || this.wiping()) return;
    this.wiping.set(true);
    const done = await this.notify.run(() => this.data.wipeStudentHistory(this.id, kind), {
      loading: 'جارٍ المسح…',
      success: kind === 'serd' ? 'مُسح سجلّ السرد' : 'مُسح سجلّ الاختبارات',
      error: 'تعذّر المسح',
    });
    this.wiping.set(false);
    if (done !== undefined) this.cancelWipe();
  }

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

  /**
   * أرقام الأجزاء المكتملة حفظًا التي اجتازت نسبة نجاح السرد فعليًّا — محاولة
   * مسجَّلة دون بلوغ العتبة لا تُحسَب سردًا مكتملًا (يبقى الجزء «غير مسرود»).
   */
  private readonly revisedJuzSet = computed<Set<number>>(() => {
    const byJuz = new Map<number, SerdRecord[]>();
    for (const r of this.serds() ?? []) {
      if (r.scope !== 'juz') continue;
      const arr = byJuz.get(r.juz);
      if (arr) arr.push(r);
      else byJuz.set(r.juz, [r]);
    }
    const passed = new Set<number>();
    for (const [juz, list] of byJuz) {
      if (list.some((r) => scoreOf(r) >= SARD_PASS)) passed.add(juz);
    }
    return passed;
  });
  readonly revisedJuzCount = computed(
    () =>
      completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) => this.revisedJuzSet().has(j))
        .length,
  );
  /** أجزاء مكتملة الحفظ ولم تجتز السرد بعد — مصدر تنبيه السرد. */
  readonly unrevisedJuz = computed(() =>
    completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) => !this.revisedJuzSet().has(j)),
  );

  /**
   * أرقام الأجزاء المكتملة حفظًا التي اختُبرت فرديًّا مرّة واحدة على الأقلّ.
   * يُستثنى سجلّ الاختبار المجمّع (scope='block') — حقل juz فيه رقم الكتلة
   * (١..١٠) لا رقم جزء حقيقيّ، فإدراجه هنا بلا تمييز يُفسد هذا العدّ.
   */
  private readonly examinedJuzSet = computed(
    () =>
      new Set((this.exams() ?? []).filter((e) => (e.scope ?? 'juz') === 'juz').map((e) => e.juz)),
  );
  readonly examinedJuzCount = computed(
    () =>
      completedJuz(this.student()?.memorizedSurahs ?? []).filter((j) =>
        this.examinedJuzSet().has(j),
      ).length,
  );
  /**
   * أجزاء اجتازت السرد ولم تُختبر بعد — مصدر تنبيه الاختبار (كلّ جزء مستقلّ).
   * اختبار جزء مكتمل الحفظ لم يجتز سرده بعدُ يبقى مقفلًا فلا يظهر هنا.
   */
  readonly pendingExamJuz = computed(() =>
    completedJuz(this.student()?.memorizedSurahs ?? []).filter(
      (j) => this.revisedJuzSet().has(j) && !this.examinedJuzSet().has(j),
    ),
  );

  /** تسميعات فعليّة فقط — تستثني سجلّات «لم يسمّع». */
  private readonly actualRecitations = computed(() =>
    (this.recitations() ?? []).filter(isActualRecitation),
  );
  readonly recitationsCount = computed(() => this.actualRecitations().length);
  /** عدد المرّات التي عُلِّم فيها الطالب بأنّه لم يسمّع رغم حضوره. */
  readonly notRecitedCount = computed(
    () => (this.recitations() ?? []).filter((r) => r.notRecited).length,
  );
  readonly totalPages = computed(() => {
    const sum = this.actualRecitations().reduce((t, r) => t + (Number(r.pages) || 0), 0);
    return Math.round(sum * 10) / 10;
  });
  readonly sessionsCount = computed(() => this.attendance()?.length ?? 0);
  /** حصص الحلقات كلّها — مقام كسر الحضور (حلقات الطالب وحدها، من يوم التحاقه). */
  private readonly sessions = this.data.allSessions(this.destroyRef);

  /**
   * الحضور كسرًا «١٨/٢٠»: حضر (حاضر + متأخّر) من الحصص المنعقدة في حلقاته منذ
   * التحاقه — نفس منطق التقارير، مقصوصًا بتاريخ الالتحاق لأنّ الملفّ بلا فترة.
   */
  readonly attFrac = computed(() => {
    const st = this.student();
    if (!st) return '—';
    const att = this.attendance() ?? [];
    const circleIds = [...new Set([...studentCircleIds(st), ...att.map((a) => a.circleId)])];
    return fracText(lifetimeAttFrac(st, att, this.sessions() ?? [], circleIds));
  });

  circleName(id: string): string {
    return (this.allCircles() ?? []).find((c) => c.id === id)?.name ?? '';
  }

  attCount(status: string): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }
}
