import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import {
  ATTENDANCE_LABELS,
  GRADE_LABELS,
  RECITATION_KIND_LABELS,
  type Student,
} from '../../core/models';
import { ayahRef } from '../../core/quran-data';
import { PageHeaderComponent } from '../../shared/page-header';

type Tab = 'overview' | 'recitation' | 'attendance' | 'evaluation';

@Component({
  selector: 'app-student',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="student()?.name || 'الطالب'" />

    <div class="page">
      @if (student() === null && loaded()) {
        <div class="empty"><span class="icon">⚠️</span> لم يتم العثور على الطالب.</div>
      } @else if (student(); as s) {
        <div class="card">
          <div class="row-between">
            <div>
              <h2 style="font-size:1.1rem;margin:0">{{ s.name }}</h2>
              <p class="muted" style="margin:2px 0 0">
                {{ s.level || 'طالب' }} · {{ circleName() }}
                @if (!s.active) {
                  · <span style="color:var(--danger)">غير نشط</span>
                }
              </p>
            </div>
            <a class="btn btn-ghost" [routerLink]="['/student', s.id, 'edit']">تعديل</a>
          </div>
        </div>

        <div class="stack-8" style="margin:10px 0">
          <a class="btn btn-primary btn-block btn-lg" [routerLink]="['/student', s.id, 'recitation']">
            🎙️ تسجيل تسميع
          </a>
          <a class="btn btn-block" [routerLink]="['/student', s.id, 'evaluation']">
            ⭐ تقييم يومي
          </a>
        </div>

        <div class="tabs">
          <button [class.active]="tab() === 'overview'" (click)="tab.set('overview')">نظرة عامة</button>
          <button [class.active]="tab() === 'recitation'" (click)="tab.set('recitation')">التسميع</button>
          <button [class.active]="tab() === 'attendance'" (click)="tab.set('attendance')">الحضور</button>
          <button [class.active]="tab() === 'evaluation'" (click)="tab.set('evaluation')">التقييم</button>
        </div>

        <!-- نظرة عامة -->
        @if (tab() === 'overview') {
          <div class="stat-grid">
            <div class="stat">
              <div class="num">{{ recitations()?.length ?? 0 }}</div>
              <div class="label">جلسات تسميع</div>
            </div>
            <div class="stat">
              <div class="num">{{ totalPages() }}</div>
              <div class="label">مجموع الأوجه المسمَّعة</div>
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

          @if (s.currentPlan) {
            <div class="card" style="margin-top:10px">
              <div class="section-title" style="margin:0 0 4px">المقرر الحالي</div>
              <div>{{ s.currentPlan }}</div>
            </div>
          }

          <div class="card" style="margin-top:10px">
            <div class="section-title" style="margin:0 0 8px">التواصل</div>
            @if (s.guardianPhone) {
              <a class="btn btn-ghost btn-block" [href]="'tel:' + s.guardianPhone" dir="ltr">
                📞 ولي الأمر: {{ s.guardianPhone }}
              </a>
            }
            @if (s.phone) {
              <a class="btn btn-ghost btn-block" style="margin-top:6px" [href]="'tel:' + s.phone" dir="ltr">
                📱 الطالب: {{ s.phone }}
              </a>
            }
            @if (!s.guardianPhone && !s.phone) {
              <p class="muted" style="margin:0">لا توجد أرقام مسجّلة.</p>
            }
          </div>
        }

        <!-- التسميع -->
        @if (tab() === 'recitation') {
          @if (recitations() === undefined) {
            <div class="spinner"></div>
          } @else if (recitations()!.length === 0) {
            <div class="empty"><span class="icon">🎙️</span> لا توجد سجلات تسميع بعد.</div>
          } @else {
            @for (r of recitations(); track r.id) {
              <div class="card">
                <div class="row-between">
                  <span class="badge b-grade">{{ kindLabels[r.kind] }}</span>
                  <span class="muted" style="font-size:.82rem">{{ r.date }}</span>
                </div>
                <div style="margin:6px 0;font-weight:700">
                  من ({{ from(r) }}) إلى ({{ to(r) }})
                </div>
                <div class="muted" style="font-size:.86rem">
                  {{ r.pages }} وجه · التقدير: {{ gradeLabels[r.grade] }}
                  · أخطاء حفظ: {{ r.hifzErrors }} · تجويد: {{ r.tajweedErrors }} · تلقين: {{ r.promptCount }}
                </div>
                @if (r.notes) {
                  <div style="margin-top:6px">{{ r.notes }}</div>
                }
                <button class="btn btn-danger" style="margin-top:8px;padding:6px 12px" (click)="delRec(r.id)">
                  حذف
                </button>
              </div>
            }
          }
        }

        <!-- الحضور -->
        @if (tab() === 'attendance') {
          <div class="card" style="display:flex;gap:14px;flex-wrap:wrap">
            <span>حاضر: <b>{{ attCount('present') }}</b></span>
            <span>متأخر: <b>{{ attCount('late') }}</b></span>
            <span>مأذون: <b>{{ attCount('excused') }}</b></span>
            <span>غائب: <b>{{ attCount('absent') }}</b></span>
          </div>
          @if (attendance() === undefined) {
            <div class="spinner"></div>
          } @else if (attendance()!.length === 0) {
            <div class="empty"><span class="icon">📋</span> لا يوجد سجل حضور بعد.</div>
          } @else {
            @for (a of attendance(); track a.id) {
              <div class="list-item" style="cursor:default">
                <span class="grow"><span class="primary">{{ a.date }}</span></span>
                <span [class]="'badge b-' + a.status">{{ attLabels[a.status] }}</span>
              </div>
            }
          }
        }

        <!-- التقييم -->
        @if (tab() === 'evaluation') {
          @if (evaluations() === undefined) {
            <div class="spinner"></div>
          } @else if (evaluations()!.length === 0) {
            <div class="empty"><span class="icon">⭐</span> لا توجد تقييمات بعد.</div>
          } @else {
            @for (e of evaluations(); track e.id) {
              <div class="card">
                <div class="row-between">
                  <b>{{ e.date }}</b>
                  <button class="btn btn-danger" style="padding:4px 10px" (click)="delEval(e.id)">حذف</button>
                </div>
                <div class="muted" style="font-size:.86rem;margin-top:6px;line-height:2">
                  الحفظ: {{ gradeLabels[e.memorization] }} · المراجعة: {{ gradeLabels[e.review] }}
                  · التجويد: {{ gradeLabels[e.tajweed] }} · الانتباه: {{ gradeLabels[e.attention] }}
                  · السلوك: {{ gradeLabels[e.behavior] }}
                </div>
                @if (e.notes) {
                  <div style="margin-top:6px">{{ e.notes }}</div>
                }
              </div>
            }
          }
        }
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
})
export class StudentPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly student = signal<Student | null>(null);
  readonly loaded = signal(false);
  readonly circleName = signal('');
  readonly tab = signal<Tab>('overview');

  readonly recitations = this.data.studentRecitations(this.id, this.destroyRef);
  readonly attendance = this.data.studentAttendance(this.id, this.destroyRef);
  readonly evaluations = this.data.studentEvaluations(this.id, this.destroyRef);

  readonly kindLabels = RECITATION_KIND_LABELS;
  readonly gradeLabels = GRADE_LABELS;
  readonly attLabels = ATTENDANCE_LABELS;

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
    const s = await this.data.getStudent(this.id);
    this.student.set(s);
    this.loaded.set(true);
    if (s) {
      const c = await this.data.getCircle(s.circleId);
      this.circleName.set(c?.name ?? '');
    }
  }

  from(r: { fromSurah: number; fromAyah: number }): string {
    return ayahRef(r.fromSurah, r.fromAyah);
  }
  to(r: { toSurah: number; toAyah: number }): string {
    return ayahRef(r.toSurah, r.toAyah);
  }

  attCount(status: string): number {
    return this.attendance()?.filter((a) => a.status === status).length ?? 0;
  }

  async delRec(id: string): Promise<void> {
    if (!(await this.notify.confirm('حذف سجل التسميع؟', { confirmText: 'حذف', danger: true }))) return;
    await this.notify.run(() => this.data.deleteRecitation(id), { success: 'حُذف سجل التسميع' });
  }
  async delEval(id: string): Promise<void> {
    if (!(await this.notify.confirm('حذف التقييم؟', { confirmText: 'حذف', danger: true }))) return;
    await this.notify.run(() => this.data.deleteEvaluation(id), { success: 'حُذف التقييم' });
  }
}
