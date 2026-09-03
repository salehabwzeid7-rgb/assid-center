import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  GRADE_LABELS,
  GRADE_ORDER,
  GRADE_VALUE,
  SESSION_STATUS_LABELS,
  gradeFromValue,
  type AttendanceStatus,
  type Grade,
  type Session,
} from '../../core/models';
import { dmy } from '../../core/format';
import { fmt12, sessionWindow, untilLabel } from '../../core/time';
import { surahName } from '../../core/quran-data';
import { PageHeaderComponent } from '../../shared/page-header';

type Step = 'attendance' | 'recitation' | 'summary';

@Component({
  selector: 'app-session',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="'جلسة ' + dateLabel()" />

    <div class="page">
      @if (notFound()) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الجلسة.</div>
      } @else if (locked(); as lk) {
        <div class="empty">
          <span class="icon">{{ lk.reason === 'before' ? '🔒' : '⛔' }}</span>
          @if (lk.reason === 'before') {
            <p style="font-weight:700;margin:6px 0">لم يحن موعد هذه الحصّة بعد.</p>
            <p class="muted">
              تُفتح تلقائيًّا الساعة {{ fmt12(session()!.fromTime) }} · {{ untilOpen() }}
            </p>
          } @else {
            <p style="font-weight:700;margin:6px 0">انتهى وقت هذه الحصّة.</p>
            <p class="muted">لبدء حصّة خارج موعدها، عدّل توقيت الحلقة من إعداداتها.</p>
          }
          <a class="btn btn-ghost" style="margin-top:12px" [routerLink]="['/circle', circleId()]">
            رجوع إلى الحلقة
          </a>
        </div>
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

        <div class="tabs" style="margin-top:12px">
          <button [class.active]="step() === 'attendance'" (click)="step.set('attendance')">
            ١ · الحضور
          </button>
          <button [class.active]="step() === 'recitation'" (click)="step.set('recitation')">
            ٢ · التسميع
          </button>
          <button [class.active]="step() === 'summary'" (click)="step.set('summary')">
            ٣ · الملخّص
          </button>
        </div>

        @if (students() === undefined) {
          <div class="spinner"></div>
        } @else if (students()!.length === 0) {
          <div class="empty"><span class="icon">👤</span> لا يوجد طلاب نشطون في هذه الحلقة.</div>
        } @else {
          <!-- ١ · الحضور -->
          @if (step() === 'attendance') {
            <div class="row-between section-title">
              <span>الحضور {{ presentTotal() }}/{{ students()!.length }}</span>
              <button class="chip" type="button" (click)="markAllPresent()">تعيين الكل حاضر</button>
            </div>
            @for (st of students(); track st.id) {
              <div class="card">
                <div class="primary" style="font-weight:700;margin-bottom:8px">{{ st.name }}</div>
                <div class="chips">
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
              </div>
            }
            <button
              class="btn btn-primary btn-block btn-lg"
              type="button"
              (click)="step.set('recitation')"
            >
              التالي: التسميع ›
            </button>
          }

          <!-- ٢ · التسميع -->
          @if (step() === 'recitation') {
            <div class="section-title">التسميع {{ recitedTotal() }}/{{ students()!.length }}</div>
            @for (st of students(); track st.id) {
              <div class="card">
                <div class="row-between">
                  <span class="primary" style="font-weight:700">{{ st.name }}</span>
                  <span style="display:flex;gap:6px">
                    <a
                      class="btn btn-ghost"
                      style="padding:7px 12px"
                      [routerLink]="['/session', id, 'evaluate', st.id]"
                    >
                      ✦ تقييم
                    </a>
                    <button
                      class="btn btn-ghost"
                      style="padding:7px 13px"
                      type="button"
                      (click)="recite(st.id)"
                    >
                      {{ recOf(st.id) ? 'تعديل' : '＋ تسميع' }}
                    </button>
                  </span>
                </div>
                @if (recOf(st.id); as r) {
                  <div class="muted" style="font-size:.85rem;margin-top:6px">
                    {{ surahName(r.fromSurah) }} {{ r.fromAyah }} ← {{ surahName(r.toSurah) }}
                    {{ r.toAyah }} · {{ r.pages }} وجه · {{ gradeLabels[r.grade] }}
                  </div>
                } @else {
                  <div class="muted" style="font-size:.82rem;margin-top:4px">
                    لم يُسجَّل تسميع بعد
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

          <!-- ٣ · الملخّص -->
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
                <div class="num">{{ avgGradeLabel() }}</div>
                <div class="label">متوسط التقدير</div>
              </div>
            </div>

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
              <div class="section-title" style="margin:0 0 8px">توزيع تقديرات التسميع</div>
              @for (g of gradeOrder; track g) {
                <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
                  <span style="width:64px;font-size:.85rem">{{ gradeLabels[g] }}</span>
                  <span class="bar"><i [style.width.%]="gradePct(g)"></i></span>
                  <span class="muted" style="font-size:.8rem">{{ gradeCount(g) }}</span>
                </div>
              }
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

            <a
              class="btn btn-block"
              style="margin-top:12px"
              [routerLink]="['/circle', session()!.circleId, 'stats']"
            >
              📊 إحصائيات الحلقة
            </a>
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: [
    `
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
    `,
  ],
})
export class SessionPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly session = signal<Session | null>(null);
  readonly notFound = signal(false);
  readonly step = signal<Step>(this.initialStep());

  private initialStep(): Step {
    const q = this.route.snapshot.queryParamMap.get('step');
    return q === 'recitation' || q === 'summary' ? q : 'attendance';
  }
  readonly circleId = signal('');
  note = '';

  readonly attLabels = ATTENDANCE_LABELS;
  readonly attOrder = ATTENDANCE_ORDER;
  readonly gradeLabels = GRADE_LABELS;
  readonly gradeOrder = GRADE_ORDER;
  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly surahName = surahName;
  readonly fmt12 = fmt12;

  /** لحظة حيّة لإعادة تقييم قفل الوقت */
  private readonly now = signal(Date.now());

  /** حصّة مجدولة خارج نافذتها → معروضة كمقفلة بدل فتحها */
  readonly locked = computed<{ reason: 'before' | 'after' } | null>(() => {
    const s = this.session();
    if (!s || s.status !== 'scheduled') return null;
    const w = sessionWindow(s, new Date(this.now()));
    return w.state === 'before' || w.state === 'after' ? { reason: w.state } : null;
  });
  readonly untilOpen = computed(() => {
    const s = this.session();
    if (!s) return '';
    const w = sessionWindow(s, new Date(this.now()));
    return w.opensAt ? untilLabel(w.opensAt, new Date(this.now())) : '';
  });

  private readonly allStudents = this.data.allStudents(this.destroyRef);
  readonly students = computed(() => {
    const cid = this.circleId();
    if (!cid) return undefined;
    return this.allStudents()?.filter((s) => s.circleId === cid && s.active);
  });
  readonly attendance = this.data.sessionAttendance(this.id, this.destroyRef);
  readonly recitations = this.data.sessionRecitations(this.id, this.destroyRef);

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
  readonly avgGradeLabel = computed(() => {
    const list = this.recitations() ?? [];
    if (!list.length) return '—';
    const avg = list.reduce((t, r) => t + GRADE_VALUE[r.grade], 0) / list.length;
    return GRADE_LABELS[gradeFromValue(avg)];
  });
  readonly absentNames = computed(() => {
    const map = new Map((this.attendance() ?? []).map((a) => [a.studentId, a.status]));
    return (this.students() ?? []).filter((s) => map.get(s.id) === 'absent').map((s) => s.name);
  });
  readonly notRecitedNames = computed(() => {
    const done = new Set((this.recitations() ?? []).map((r) => r.studentId));
    return (this.students() ?? []).filter((s) => !done.has(s.id)).map((s) => s.name);
  });

  constructor() {
    const timer = setInterval(() => {
      this.now.set(Date.now());
      // فتح تلقائيّ عند دخول النافذة الزمنية دون إعادة تحميل
      const s = this.session();
      if (s?.status === 'scheduled' && !this.locked()) void this.tryOpen();
    }, 20_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async ngOnInit(): Promise<void> {
    const s = await this.data.getSession(this.id);
    if (!s) {
      this.notFound.set(true);
      return;
    }
    this.session.set(s);
    this.circleId.set(s.circleId);
    this.note = s.note ?? '';
    // زيارة حصّة مجدولة داخل نافذتها = بدؤها؛ خارجها تبقى مقفلة
    if (s.status === 'scheduled' && !this.locked()) await this.tryOpen();
  }

  private async tryOpen(): Promise<void> {
    if (this.session()?.status !== 'scheduled') return;
    try {
      await this.data.setSessionStatus(this.id, 'open');
      const cur = this.session();
      if (cur) this.session.set({ ...cur, status: 'open' });
    } catch (e) {
      console.error(e);
    }
  }

  statusOf(studentId: string): AttendanceStatus | null {
    return this.attendance()?.find((a) => a.studentId === studentId)?.status ?? null;
  }
  recOf(studentId: string) {
    return this.recitations()?.find((r) => r.studentId === studentId) ?? null;
  }
  countAtt(status: AttendanceStatus): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }
  gradeCount(g: Grade): number {
    return this.recitations()?.filter((r) => r.grade === g).length ?? 0;
  }
  gradePct(g: Grade): number {
    const n = this.recitedTotal();
    return n ? (this.gradeCount(g) / n) * 100 : 0;
  }

  async setAttendance(studentId: string, status: AttendanceStatus): Promise<void> {
    const s = this.session();
    if (!s) return;
    try {
      await this.data.upsertSessionAttendance({
        sessionId: this.id,
        studentId,
        circleId: s.circleId,
        date: s.date,
        status,
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

  recite(studentId: string): void {
    this.router.navigate(['/session', this.id, 'recite', studentId]);
  }

  async setStatus(status: 'open' | 'closed'): Promise<void> {
    const done = await this.notify.run(
      () => this.data.setSessionStatus(this.id, status).then(() => true),
      { success: status === 'closed' ? 'أُنهيت الجلسة' : 'أُعيد فتح الجلسة' },
    );
    if (!done) return;
    const s = this.session();
    if (s) this.session.set({ ...s, status });
  }

  async saveNote(): Promise<void> {
    await this.notify.run(() => this.data.setSessionNote(this.id, this.note.trim()), {
      loading: 'جارٍ حفظ الملاحظة…',
      success: 'حُفظت ملاحظة الجلسة',
    });
  }
}
