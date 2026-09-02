import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  type AttendanceStatus,
  type Circle,
  type Student,
} from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-attendance',
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <app-page-header [title]="'تحضير: ' + (circle()?.name || '')" />

    <div class="page">
      <div class="card">
        <div class="field" style="margin:0">
          <label for="date">تاريخ التحضير</label>
          <input id="date" name="date" type="date" [ngModel]="date()" (ngModelChange)="onDate($event)" />
        </div>
      </div>

      <div class="row-between section-title">
        <span>الطلاب ({{ students()?.length ?? 0 }})</span>
        <button class="chip" type="button" (click)="markAll('present')">تعيين الكل حاضر</button>
      </div>

      @if (students() === undefined || loading()) {
        <div class="spinner"></div>
      } @else if (students()!.length === 0) {
        <div class="empty"><span class="icon">👤</span> لا يوجد طلاب في هذه الحلقة.</div>
      } @else {
        @for (s of students(); track s.id) {
          <div class="card">
            <div class="primary" style="font-weight:700;margin-bottom:8px">{{ s.name }}</div>
            <div class="chips">
              @for (st of order; track st) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="marks()[s.id] === st"
                  [class.c-absent]="st === 'absent'"
                  [class.c-late]="st === 'late'"
                  [class.c-excused]="st === 'excused'"
                  (click)="set(s.id, st)"
                >
                  {{ labels[st] }}
                </button>
              }
            </div>
          </div>
        }
      }

      @if (error()) {
        <div class="alert alert-error" style="margin-top:12px">{{ error() }}</div>
      }
      @if (saved()) {
        <div class="alert alert-ok" style="margin-top:12px">تم حفظ التحضير ({{ savedCount() }} طالب)</div>
      }
    </div>

    <button class="fab" type="button" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'جارٍ الحفظ…' : '💾 حفظ التحضير' }}
    </button>
  `,
})
export class AttendancePage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly circleId = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);
  readonly students = this.data.studentsByCircle(this.circleId, this.destroyRef);

  readonly date = signal(today());
  readonly marks = signal<Record<string, AttendanceStatus>>({});
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly savedCount = signal(0);
  readonly error = signal('');

  readonly order = ATTENDANCE_ORDER;
  readonly labels = ATTENDANCE_LABELS;

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.circleId));
    await this.loadExisting();
  }

  async onDate(value: string): Promise<void> {
    if (!value) return;
    this.date.set(value);
    this.saved.set(false);
    await this.loadExisting();
  }

  private async loadExisting(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.data.loadCircleAttendance(this.circleId, this.date());
      const map: Record<string, AttendanceStatus> = {};
      for (const r of rows) map[r.studentId] = r.status;
      this.marks.set(map);
    } catch {
      this.error.set('تعذّر تحميل التحضير السابق');
    } finally {
      this.loading.set(false);
    }
  }

  set(studentId: string, status: AttendanceStatus): void {
    this.marks.update((m) => ({ ...m, [studentId]: status }));
    this.saved.set(false);
  }

  markAll(status: AttendanceStatus): void {
    const m: Record<string, AttendanceStatus> = {};
    for (const s of this.students() ?? []) m[s.id] = status;
    this.marks.set(m);
    this.saved.set(false);
  }

  async save(): Promise<void> {
    const list = this.students() ?? [];
    const entries = list.filter((s): s is Student => !!this.marks()[s.id]);
    if (entries.length === 0) {
      this.error.set('حدّد حالة طالب واحد على الأقل');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await Promise.all(
        entries.map((s) =>
          this.data.upsertAttendance({
            studentId: s.id,
            circleId: this.circleId,
            date: this.date(),
            status: this.marks()[s.id]!,
          }),
        ),
      );
      this.savedCount.set(entries.length);
      this.saved.set(true);
    } catch {
      this.error.set('تعذّر حفظ التحضير، تحقق من الاتصال');
    } finally {
      this.saving.set(false);
    }
  }
}
