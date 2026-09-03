import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import { SARD_PASS, studentCircleIds, type Student } from '../../core/models';
import { ScoreInputComponent } from '../../shared/score-input';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-evaluation-form',
  imports: [FormsModule, PageHeaderComponent, ScoreInputComponent],
  template: `
    <app-page-header title="التقييم اليومي" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        @if (student(); as s) {
          <p class="muted" style="margin-top:0">
            الطالب: <b>{{ s.name }}</b>
          </p>
        }

        <div class="field">
          <label for="date">التاريخ</label>
          <input id="date" name="date" type="date" [(ngModel)]="date" required />
        </div>

        <app-score-input
          label="الحفظ الجديد (٪)"
          [threshold]="pass"
          [value]="memorization()"
          (valueChange)="memorization.set($event)"
        />
        <app-score-input
          label="المراجعة (٪)"
          [threshold]="pass"
          [value]="review()"
          (valueChange)="review.set($event)"
        />
        <app-score-input
          label="التجويد وأحكام التلاوة (٪)"
          [threshold]="pass"
          [value]="tajweed()"
          (valueChange)="tajweed.set($event)"
        />
        <app-score-input
          label="الانتباه والتفاعل (٪)"
          [threshold]="pass"
          [value]="attention()"
          (valueChange)="attention.set($event)"
        />
        <app-score-input
          label="الأدب والسلوك (٪)"
          [threshold]="pass"
          [value]="behavior()"
          (valueChange)="behavior.set($event)"
        />

        <div class="field">
          <label for="notes">ملاحظات اليوم</label>
          <textarea
            id="notes"
            name="notes"
            [(ngModel)]="notes"
            placeholder="ملاحظة موجزة عن أداء الطالب اليوم…"
          ></textarea>
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button
          class="btn btn-primary btn-block btn-lg"
          type="submit"
          [disabled]="saving() || !student()"
        >
          {{ saving() ? 'جارٍ الحفظ…' : 'حفظ التقييم' }}
        </button>
      </form>
    </div>
  `,
})
export class EvaluationFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly studentId =
    this.route.snapshot.paramMap.get('studentId') ?? this.route.snapshot.paramMap.get('id')!;
  readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? undefined;
  readonly student = signal<Student | null>(null);
  private circleId = '';
  readonly saving = signal(false);
  readonly error = signal('');

  date = today();
  notes = '';
  readonly pass = SARD_PASS;
  readonly memorization = signal(90);
  readonly review = signal(90);
  readonly tajweed = signal(90);
  readonly attention = signal(90);
  readonly behavior = signal(90);

  async ngOnInit(): Promise<void> {
    this.student.set(await this.data.getStudent(this.studentId));
    if (this.sessionId) {
      const session = await this.data.getSession(this.sessionId);
      if (session) {
        this.date = session.date;
        this.circleId = session.circleId;
      }
    }
  }

  async submit(): Promise<void> {
    const s = this.student();
    if (!s) {
      this.error.set('تعذّر تحميل بيانات الطالب');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const ok = await this.notify.run(
      () =>
        this.data
          .addEvaluation({
            studentId: s.id,
            circleId: this.circleId || studentCircleIds(s)[0] || '',
            date: this.date,
            memorization: this.memorization(),
            review: this.review(),
            tajweed: this.tajweed(),
            attention: this.attention(),
            behavior: this.behavior(),
            notes: this.notes.trim() || undefined,
          })
          .then(() => true),
      { success: 'حُفظ التقييم اليومي', error: 'تعذّر حفظ التقييم' },
    );
    this.saving.set(false);
    if (!ok) return;
    if (this.sessionId) {
      await this.router.navigate(['/session', this.sessionId], {
        queryParams: { step: 'summary' },
      });
    } else {
      await this.router.navigate(['/student', s.id]);
    }
  }
}
