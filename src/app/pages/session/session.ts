import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { AuthService } from '../../core/auth.service';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  DEFAULT_REPORT_INTRO,
  DEFAULT_REPORT_OUTRO,
  SARD_PASS,
  SESSION_STATUS_LABELS,
  TASMIE_PASS,
  circleLabel,
  scoreOf,
  studentCircleIds,
  type AttendanceRecord,
  type AttendanceStatus,
  type SerdRecord,
  type Student,
} from '../../core/models';
import { dmy, weekdayAr } from '../../core/format';
import { fmt12, isValidHHMM, nowHHMM } from '../../core/time';
import { completedJuz, surahName } from '../../core/quran-data';
import { PageHeaderComponent } from '../../shared/page-header';
import { RecitationPanelComponent } from '../../shared/recitation-panel';

type Step = 'attendance' | 'summary' | 'serd';

@Component({
  selector: 'app-session',
  imports: [FormsModule, RouterLink, PageHeaderComponent, RecitationPanelComponent],
  template: `
    <app-page-header [title]="'جلسة ' + dateLabel()" />

    <div class="page">
      @if (session() === null) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الجلسة.</div>
      } @else if (session(); as s) {
        <div class="card row-between">
          <span>
            <b>{{ dateLabel() }}</b>
            <span
              [class]="
                'badge b-' +
                (s.status === 'open' ? 'late' : s.status === 'scheduled' ? 'grade' : 'present')
              "
              style="margin-inline-start:8px"
            >
              {{ statusLabels[s.status] }}
            </span>
          </span>
          @if (s.status === 'open') {
            <button
              class="btn btn-ghost"
              style="padding:8px 14px"
              type="button"
              (click)="setStatus('closed')"
            >
              إنهاء الجلسة
            </button>
          } @else {
            <button
              class="btn btn-ghost"
              style="padding:8px 14px"
              type="button"
              (click)="setStatus('open')"
            >
              إعادة فتح
            </button>
          }
        </div>

        @if (s.status === 'closed') {
          <div class="edit-banner">
            ✎ الجلسة منتهية — يمكنك تعديل الحضور والتسميع وإضافة تسميعات، وتُحفظ التغييرات فورًا.
          </div>
        }

        <div class="tabs" style="margin-top:12px">
          <button [class.active]="step() === 'attendance'" (click)="step.set('attendance')">
            الحضور والتسميع
          </button>
          <button [class.active]="step() === 'summary'" (click)="step.set('summary')">
            الملخّص
          </button>
          <button [class.active]="step() === 'serd'" (click)="step.set('serd')">السرد</button>
        </div>

        @if (students() === undefined) {
          <div class="spinner"></div>
        } @else if (students()!.length === 0) {
          <div class="empty"><span class="icon">👤</span> لا يوجد طلاب نشطون في هذه الحلقة.</div>
        } @else {
          <!-- الحضور والتسميع -->
          @if (step() === 'attendance') {
            <div class="row-between section-title">
              <span>
                الحضور {{ presentTotal() }}/{{ students()!.length }} · التسميع
                {{ recitedTotal() }}/{{ students()!.length }}
              </span>
              <button class="chip" type="button" (click)="markAllPresent()">تعيين الكل حاضر</button>
            </div>

            @for (st of students(); track st.id) {
              <div class="card std-card">
                <div class="primary" style="font-weight:700">{{ st.name }}</div>
                <div class="chips" style="margin-top:8px">
                  @for (opt of attOrder; track opt) {
                    <button
                      type="button"
                      class="chip"
                      [class.active]="statusOf(st.id) === opt"
                      [class.c-absent]="opt === 'absent'"
                      [class.c-late]="opt === 'late'"
                      [class.c-excused]="opt === 'excused'"
                      (click)="setAttendance(st.id, opt)"
                    >
                      {{ attLabels[opt] }}
                    </button>
                  }
                </div>

                @if (isPresent(st.id)) {
                  <div class="times">
                    <label>
                      وقت الحضور
                      <input
                        type="time"
                        [value]="arrivalOf(st.id)"
                        (change)="setArrival(st.id, $event)"
                      />
                    </label>
                    <label>
                      وقت الانصراف
                      <input
                        type="time"
                        [value]="departureOf(st.id)"
                        (change)="setDeparture(st.id, $event)"
                      />
                    </label>
                  </div>
                  <app-recitation-panel
                    [sessionId]="id"
                    [studentId]="st.id"
                    [circleId]="s.circleId"
                    [date]="s.date"
                    [existing]="recOf(st.id)"
                  />
                } @else if (recOf(st.id); as r) {
                  <div class="muted rp-done">
                    سُجّل تسميع سابق: {{ surahName(r.fromSurah) }} {{ r.fromAyah }} ←
                    {{ surahName(r.toSurah) }} {{ r.toAyah }} · {{ r.pages }} وجه ·
                    {{ scoreOf(r) }}٪
                  </div>
                }
              </div>
            }

            <button
              class="btn btn-primary btn-block btn-lg"
              type="button"
              (click)="step.set('summary')"
            >
              التالي: الملخّص ›
            </button>
          }

          <!-- الملخّص -->
          @if (step() === 'summary') {
            <div class="stat-grid">
              <div class="stat">
                <div class="num">{{ presentTotal() }}/{{ students()!.length }}</div>
                <div class="label">الحضور ({{ presentRate() }}٪)</div>
              </div>
              <div class="stat">
                <div class="num">{{ recitedTotal() }}</div>
                <div class="label">عدد المسمّعين</div>
              </div>
              <div class="stat">
                <div class="num">{{ totalPages() }}</div>
                <div class="label">مجموع الأوجه</div>
              </div>
              <div class="stat">
                <div class="num">{{ avgScore() === null ? '—' : avgScore() + '٪' }}</div>
                <div class="label">متوسّط التسميع</div>
              </div>
            </div>

            @if (overtimeCount() > 0) {
              <div class="card" style="margin-top:10px">
                <div class="section-title" style="margin:0 0 6px">زمن التسميع (٤ د/وجه)</div>
                <span style="color:var(--danger);font-weight:700">
                  {{ overtimeCount() }} تسميع تجاوز المعيار الزمنيّ
                </span>
                <div class="muted" style="margin-top:6px;font-size:.86rem">
                  {{ overtimeNames().join('، ') }}
                </div>
              </div>
            }

            <div class="card" style="margin-top:10px">
              <div class="section-title" style="margin:0 0 8px">تفصيل الحضور</div>
              <div style="display:flex;gap:14px;flex-wrap:wrap">
                <span
                  >حاضر: <b>{{ countAtt('present') }}</b></span
                >
                <span
                  >متأخر: <b>{{ countAtt('late') }}</b></span
                >
                <span
                  >مأذون: <b>{{ countAtt('excused') }}</b></span
                >
                <span
                  >غائب: <b>{{ countAtt('absent') }}</b></span
                >
              </div>
              @if (absentNames().length) {
                <div class="muted" style="margin-top:8px;font-size:.86rem">
                  الغائبون: {{ absentNames().join('، ') }}
                </div>
              }
            </div>

            <div class="card" style="margin-top:10px">
              <div class="section-title" style="margin:0 0 8px">
                نتيجة التسميع (عتبة النجاح ٩٥٪)
              </div>
              <div style="display:flex;gap:16px;flex-wrap:wrap">
                <span
                  >ناجح (≥ ٩٥٪): <b style="color:var(--ok,#3b6b4a)">{{ passCount() }}</b></span
                >
                <span
                  >دون العتبة: <b style="color:var(--danger)">{{ failCount() }}</b></span
                >
              </div>
              <div class="bar" style="margin-top:8px">
                <i [style.width.%]="passPct()"></i>
              </div>
              @if (notRecitedNames().length) {
                <div class="muted" style="margin-top:8px;font-size:.86rem">
                  لم يسمّعوا: {{ notRecitedNames().join('، ') }}
                </div>
              }
            </div>

            <div class="card" style="margin-top:10px">
              <div class="field" style="margin:0">
                <label for="note">ملاحظة الجلسة</label>
                <textarea
                  id="note"
                  name="note"
                  [(ngModel)]="note"
                  (blur)="saveNote()"
                  placeholder="ملاحظة عامة عن سير الجلسة…"
                ></textarea>
              </div>
            </div>

            <!-- تقرير الجلسة للأهالي + مشاركة واتساب -->
            <div class="card report-card" style="margin-top:12px">
              <div class="row-between" style="margin-bottom:8px">
                <b>تقرير الجلسة للأهالي</b>
                @if (reportEdited()) {
                  <button class="chip" type="button" (click)="resetReport()">
                    ↻ توليد تلقائيّ
                  </button>
                }
              </div>
              <p class="muted" style="margin:0 0 8px;font-size:.82rem">
                يُبنى تلقائيًّا من الحضور والتسميع والدرجات. عدّل النصّ إن شئت ثم شارِكه في مجموعة
                أولياء الأمور. (تُضبَط رسالتا الافتتاح والختام من «حساب المعلّم».)
              </p>
              <textarea
                class="report-text"
                dir="rtl"
                rows="12"
                [value]="displayReport()"
                (input)="onReportInput($event)"
              ></textarea>
              <div class="report-actions">
                <button class="btn btn-primary" type="button" (click)="shareWhatsApp()">
                  📲 مشاركة عبر واتساب
                </button>
                <button class="btn btn-ghost" type="button" (click)="shareNative()">
                  ↗ مشاركة
                </button>
                <button class="btn btn-ghost" type="button" (click)="copyReport()">📋 نسخ</button>
              </div>
            </div>

            <a
              class="btn btn-block"
              style="margin-top:12px"
              [routerLink]="['/circle', s.circleId, 'stats']"
            >
              📊 إحصائيات الحلقة
            </a>
          }

          <!-- السرد -->
          @if (step() === 'serd') {
            <div class="section-title">سرد الأجزاء المحفوظة</div>
            @for (st of students(); track st.id) {
              <a class="list-item" [routerLink]="['/student', st.id, 'serd']">
                <span class="avatar">{{ serdOf(st).revised }}</span>
                <span class="grow">
                  <span class="primary">{{ st.name }}</span>
                  <span class="secondary">
                    {{ serdOf(st).completed }} جزء مكتمل · {{ serdOf(st).revised }} مسرود
                    @if (serdOf(st).pending > 0) {
                      ·
                      <span style="color:var(--warn,#a07030)"
                        >⚠ {{ serdOf(st).pending }} بانتظار السرد</span
                      >
                    }
                  </span>
                </span>
                <span class="chevron">‹</span>
              </a>
            }
            <p class="hint" style="margin-top:10px">
              افتح سجلّ الطالب لتسجيل السرد وتقييمه، أو السرد المجمّع لكلّ ٣ أجزاء.
            </p>
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: [
    `
      .edit-banner {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-xs);
        background: var(--gold-tint2, #faf4e4);
        color: var(--gold-deep);
        font-weight: 700;
        font-size: 0.86rem;
      }
      .std-card {
        margin-bottom: 10px;
      }
      .rp-done {
        margin-top: 8px;
        font-size: 0.84rem;
      }
      .bar {
        flex: 1;
        height: 10px;
        background: var(--surface-2);
        border-radius: 6px;
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        background: var(--green);
        border-radius: 6px;
        transition: width 0.3s;
      }
      .times {
        display: flex;
        gap: 10px;
        margin-top: 8px;
      }
      .times label {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 0.76rem;
        font-weight: 700;
        color: var(--text-soft);
      }
      .times input {
        padding: 7px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }
      .report-card {
        border: 1px solid var(--green);
      }
      .report-text {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: var(--radius-xs);
        background: var(--surface-2);
        color: var(--text);
        padding: 10px;
        font: inherit;
        line-height: 1.7;
        resize: vertical;
      }
      .report-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .report-actions .btn {
        flex: 1;
      }
    `,
  ],
})
export class SessionPage {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  /** الجلسة كإشارة حيّة — التعديلات (حالة/ملاحظة/إعادة فتح) تنعكس فورًا وعبر الأجهزة. */
  readonly session = this.data.sessionLive(this.id, this.destroyRef);
  readonly step = signal<Step>(this.initialStep());

  private initialStep(): Step {
    const q = this.route.snapshot.queryParamMap.get('step');
    return q === 'summary' || q === 'serd' ? q : 'attendance';
  }

  readonly circleId = computed(() => this.session()?.circleId ?? '');
  note = '';
  private noteInit = false;

  readonly attLabels = ATTENDANCE_LABELS;
  readonly attOrder = ATTENDANCE_ORDER;
  readonly scoreOf = scoreOf;
  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly surahName = surahName;

  private readonly allStudents = this.data.allStudents(this.destroyRef);
  private readonly allCircles = this.data.circles(this.destroyRef);
  readonly circle = computed(
    () => this.allCircles()?.find((c) => c.id === this.circleId()) ?? null,
  );
  readonly students = computed(() => {
    const cid = this.circleId();
    if (!cid) return undefined;
    return this.allStudents()?.filter((s) => s.active && studentCircleIds(s).includes(cid));
  });
  readonly attendance = this.data.sessionAttendance(this.id, this.destroyRef);
  readonly recitations = this.data.sessionRecitations(this.id, this.destroyRef);
  private readonly allSerds = this.data.allSerds(this.destroyRef);

  readonly dateLabel = computed(() => dmy(this.session()?.date));

  readonly presentTotal = computed(
    () =>
      this.attendance()?.filter((a) => a.status === 'present' || a.status === 'late').length ?? 0,
  );
  readonly recitedTotal = computed(() => this.recitations()?.length ?? 0);
  readonly presentRate = computed(() => {
    const n = this.students()?.length ?? 0;
    return n ? Math.round((this.presentTotal() / n) * 100) : 0;
  });
  readonly totalPages = computed(() => {
    const sum = (this.recitations() ?? []).reduce((t, r) => t + (Number(r.pages) || 0), 0);
    return Math.round(sum * 10) / 10;
  });
  readonly avgScore = computed<number | null>(() => {
    const list = this.recitations() ?? [];
    if (!list.length) return null;
    return Math.round(list.reduce((t, r) => t + scoreOf(r), 0) / list.length);
  });
  readonly passCount = computed(
    () => (this.recitations() ?? []).filter((r) => scoreOf(r) >= TASMIE_PASS).length,
  );
  readonly failCount = computed(() => this.recitedTotal() - this.passCount());
  readonly passPct = computed(() => {
    const n = this.recitedTotal();
    return n ? (this.passCount() / n) * 100 : 0;
  });

  /** تسميعات تجاوزت المعيار الزمنيّ ٤ د/وجه (لها durationSec مسجَّلة). */
  private readonly overtimeRecs = computed(() =>
    (this.recitations() ?? []).filter(
      (r) => r.durationSec != null && r.durationSec > (Number(r.pages) || 0) * 240,
    ),
  );
  readonly overtimeCount = computed(() => this.overtimeRecs().length);
  readonly overtimeNames = computed(() => {
    const names = new Map((this.students() ?? []).map((s) => [s.id, s.name]));
    return this.overtimeRecs().map((r) => names.get(r.studentId) ?? '—');
  });

  readonly absentNames = computed(() => {
    const map = new Map((this.attendance() ?? []).map((a) => [a.studentId, a.status]));
    return (this.students() ?? []).filter((s) => map.get(s.id) === 'absent').map((s) => s.name);
  });
  readonly notRecitedNames = computed(() => {
    const done = new Set((this.recitations() ?? []).map((r) => r.studentId));
    return (this.students() ?? []).filter((s) => !done.has(s.id)).map((s) => s.name);
  });

  // ---------- تقرير الجلسة للأهالي + مشاركة واتساب ----------

  /** نصّ حرّره المعلّم يدويًّا؛ null = ما زال التقرير مُولَّدًا تلقائيًّا. */
  private readonly reportOverride = signal<string | null>(null);
  readonly reportEdited = computed(() => this.reportOverride() !== null);
  readonly displayReport = computed(() => this.reportOverride() ?? this.reportText());

  onReportInput(e: Event): void {
    this.reportOverride.set((e.target as HTMLTextAreaElement).value);
  }
  resetReport(): void {
    this.reportOverride.set(null);
  }

  /** سطر حضور طالب في التقرير: «حاضر (٤:٠٠ م – ٥:٠٠ م)» أو «غائب». */
  private attendanceLine(a: AttendanceRecord | null): string {
    if (!a) return 'لم يُسجَّل';
    const label = ATTENDANCE_LABELS[a.status];
    if (a.status === 'present' || a.status === 'late') {
      const from = isValidHHMM(a.arrivalTime) ? fmt12(a.arrivalTime) : '';
      const to = isValidHHMM(a.departureTime) ? fmt12(a.departureTime) : '';
      const span = from && to ? ` (${from} – ${to})` : from ? ` (حضر ${from})` : '';
      return label + span;
    }
    return label;
  }

  private studentBlock(index: number, st: Student): string {
    const a = this.attOf(st.id);
    const r = this.recOf(st.id);
    const lines = [`${index}. ${st.name}`, `• الحضور: ${this.attendanceLine(a)}`];
    const present = a?.status === 'present' || a?.status === 'late';
    if (present) {
      if (r) {
        const range = `${surahName(r.fromSurah)} ${r.fromAyah} ← ${surahName(r.toSurah)} ${r.toAyah}`;
        lines.push(`• التسميع: ${r.pages} وجه — ${scoreOf(r)}٪ (${range})`);
        if (r.hifzErrors || r.tajweedErrors) {
          lines.push(`• الأخطاء: حفظ ${r.hifzErrors} · تجويد ${r.tajweedErrors}`);
        }
        if (r.notes?.trim()) lines.push(`• ملاحظة: ${r.notes.trim()}`);
      } else {
        lines.push('• التسميع: لم يُسمّع في هذه الجلسة');
      }
    }
    if (a?.note?.trim()) lines.push(`• ملاحظة الحضور: ${a.note.trim()}`);
    return lines.join('\n');
  }

  /** التقرير الكامل: افتتاح المعلّم + الترويسة والتاريخ + قائمة الطلّاب + ختام المعلّم. */
  readonly reportText = computed<string>(() => {
    const s = this.session();
    const students = this.students() ?? [];
    if (!s) return '';
    const t = this.auth.teacher();
    const intro = (t?.reportIntro ?? '').trim() || DEFAULT_REPORT_INTRO;
    const outro = (t?.reportOutro ?? '').trim() || DEFAULT_REPORT_OUTRO;
    const header = `📋 ${circleLabel(this.circle())} — ${weekdayAr(s.date)} ${dmy(s.date)}`;
    const totals = `الحضور: ${this.presentTotal()}/${students.length} · التسميع: ${this.recitedTotal()}/${students.length}`;
    const rule = '━━━━━━━━━━━━';
    const blocks = students.map((st, i) => this.studentBlock(i + 1, st));
    return [intro, '', header, totals, rule, '', blocks.join('\n\n'), '', rule, outro].join('\n');
  });

  /**
   * يفتح واتساب مباشرةً والنصّ مُعبّأ — على الجوال يفتح تطبيق واتساب فيختار
   * المعلّم مجموعة أولياء الأمور، وعلى سطح المكتب يفتح واتساب ويب. رابط
   * `wa.me` هو واجهة المشاركة الرسميّة لواتساب.
   */
  shareWhatsApp(): void {
    const text = this.displayReport();
    if (!text.trim()) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }

  /** واجهة المشاركة الأصليّة للنظام (تُتيح اختيار أيّ تطبيق) — عند توفّرها. */
  async shareNative(): Promise<void> {
    const text = this.displayReport();
    if (!text.trim()) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share !== 'function') {
      this.shareWhatsApp();
      return;
    }
    try {
      await nav.share({ title: 'تقرير الحلقة', text });
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') console.error(e);
    }
  }

  async copyReport(): Promise<void> {
    const text = this.displayReport();
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('نُسخ التقرير — الصقه في مجموعة أولياء الأمور');
    } catch {
      this.notify.error('تعذّر النسخ — انسخ النصّ يدويًّا');
    }
  }

  constructor() {
    // تهيئة نصّ الملاحظة مرّة واحدة عند وصول الجلسة (دون الكتابة فوق ما يكتبه المعلّم)
    effect(() => {
      const s = this.session();
      if (s && !this.noteInit) {
        this.note = s.note ?? '';
        this.noteInit = true;
      }
    });

    // أيّ حصّة «مجدولة» تُفتح فورًا بمجرّد زيارتها — بلا أيّ قيد زمنيّ (حاليّة
    // كانت أو مستقبليّة)، فتتاح فورًا لتسجيل الحضور والتسميع والدرجات.
    effect(() => {
      const s = this.session();
      if (s?.status === 'scheduled') void this.tryOpen();
    });
  }

  private opening = false;
  private async tryOpen(): Promise<void> {
    if (this.opening || this.session()?.status !== 'scheduled') return;
    this.opening = true;
    try {
      await this.data.setSessionStatus(this.id, 'open');
    } catch (e) {
      console.error(e);
    } finally {
      this.opening = false;
    }
  }

  statusOf(studentId: string): AttendanceStatus | null {
    return this.attendance()?.find((a) => a.studentId === studentId)?.status ?? null;
  }
  isPresent(studentId: string): boolean {
    const st = this.statusOf(studentId);
    return st === 'present' || st === 'late';
  }
  recOf(studentId: string) {
    return this.recitations()?.find((r) => r.studentId === studentId) ?? null;
  }
  private attOf(studentId: string): AttendanceRecord | null {
    return this.attendance()?.find((a) => a.studentId === studentId) ?? null;
  }
  arrivalOf(studentId: string): string {
    return this.attOf(studentId)?.arrivalTime ?? '';
  }
  departureOf(studentId: string): string {
    return this.attOf(studentId)?.departureTime ?? '';
  }
  setArrival(studentId: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    void this.data.setAttendanceTime(this.id, studentId, { arrivalTime: v });
  }
  setDeparture(studentId: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    void this.data.setAttendanceTime(this.id, studentId, { departureTime: v });
  }
  /** ملخّص السرد لطالب: الأجزاء المكتملة، وكم منها سُرِد، وكم بانتظار السرد. */
  serdOf(st: { id: string; memorizedSurahs?: number[] }): {
    completed: number;
    revised: number;
    pending: number;
  } {
    const done = completedJuz(st.memorizedSurahs ?? []);
    const byJuz = new Map<number, SerdRecord[]>();
    for (const r of this.allSerds() ?? []) {
      if (r.studentId !== st.id || r.scope !== 'juz') continue;
      const arr = byJuz.get(r.juz);
      if (arr) arr.push(r);
      else byJuz.set(r.juz, [r]);
    }
    const revisedSet = new Set<number>();
    for (const [juz, list] of byJuz) {
      if (list.some((r) => scoreOf(r) >= SARD_PASS)) revisedSet.add(juz);
    }
    const revised = done.filter((j) => revisedSet.has(j)).length;
    return { completed: done.length, revised, pending: done.length - revised };
  }
  countAtt(status: AttendanceStatus): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }

  async setAttendance(studentId: string, status: AttendanceStatus): Promise<void> {
    const s = this.session();
    if (!s) return;
    // عند تعليم الطالب حاضرًا/متأخّرًا لأوّل مرّة (ولا وقت حضور مسجَّل) نملأ وقت
    // الحضور بالوقت الحاليّ تلقائيًّا — يبقى قابلًا للتعديل يدويًّا.
    const autoArrival =
      (status === 'present' || status === 'late') && !this.attOf(studentId)?.arrivalTime
        ? nowHHMM()
        : undefined;
    try {
      await this.data.upsertSessionAttendance({
        sessionId: this.id,
        studentId,
        circleId: s.circleId,
        date: s.date,
        status,
        arrivalTime: autoArrival,
      });
    } catch (e) {
      console.error(e);
      this.notify.error('تعذّر حفظ الحضور — سيُعاد المحاولة تلقائيًا');
    }
  }

  async markAllPresent(): Promise<void> {
    const s = this.session();
    if (!s) return;
    await this.notify.run(
      () =>
        Promise.all(
          (this.students() ?? []).map((st) =>
            this.data.upsertSessionAttendance({
              sessionId: this.id,
              studentId: st.id,
              circleId: s.circleId,
              date: s.date,
              status: 'present',
            }),
          ),
        ),
      { success: 'سُجّل حضور الجميع', error: 'تعذّر حفظ الحضور' },
    );
  }

  async setStatus(status: 'open' | 'closed'): Promise<void> {
    // عند إنهاء الجلسة نملأ وقت انصراف كلّ حاضر/متأخّر لم يُسجَّل له انصراف بعد.
    if (status === 'closed') {
      const t = nowHHMM();
      await Promise.all(
        (this.attendance() ?? [])
          .filter((a) => (a.status === 'present' || a.status === 'late') && !a.departureTime)
          .map((a) => this.data.setAttendanceTime(this.id, a.studentId, { departureTime: t })),
      );
    }
    await this.notify.run(() => this.data.setSessionStatus(this.id, status), {
      success: status === 'closed' ? 'أُنهيت الجلسة' : 'أُعيد فتح الجلسة',
    });
  }

  async saveNote(): Promise<void> {
    await this.notify.run(() => this.data.setSessionNote(this.id, this.note.trim()), {
      loading: 'جارٍ حفظ الملاحظة…',
      success: 'حُفظت ملاحظة الجلسة',
    });
  }
}
