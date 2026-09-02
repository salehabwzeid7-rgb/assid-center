import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import type { Grade, Student } from '../../core/models';
import { GradePickerComponent } from '../../shared/grade-picker';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-evaluation-form',
  imports: [FormsModule, PageHeaderComponent, GradePickerComponent],
  template: `
    <app-page-header title="التقييم اليومي" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        @if (student(); as s) {
          <p class="muted" style="margin-top:0">الطالب: <b>{{ s.name }}</b></p>
        }

        <div class="field">
          <label for="date">التاريخ</label>
          <input id="date" name="date" type="date" [(ngModel)]="date" required />
        </div>

        <app-grade-picker label="الحفظ الجديد" [(value)]="memorization" />
        <app-grade-picker label="المراجعة" [(value)]="review" />
        <app-grade-picker label="التجويد وأحكام التلاوة" [(value)]="tajweed" />
        <app-grade-picker label="الانتباه والتفاعل" [(value)]="attention" />
        <app-grade-picker label="الأدب والسلوك" [(value)]="behavior" />

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

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving() || !student()">
          {{ saving() ? 'جارٍ الحفظ…' : 'حفظ التقييم' }}
        </button>
      </form>
    </div>
  `,
})
export class EvaluationFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private router = inject(Router);

  readonly studentId = this.route.snapshot.paramMap.get('id')!;
  readonly student = signal<Student | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');

  date = today();
  notes = '';
  readonly memorization = signal<Grade>('very_good');
  readonly review = signal<Grade>('very_good');
  readonly tajweed = signal<Grade>('very_good');
  readonly attention = signal<Grade>('very_good');
  readonly behavior = signal<Grade>('very_good');

  async ngOnInit(): Promise<void> {
    this.student.set(await this.data.getStudent(this.studentId));
  }

  async submit(): Promise<void> {
    const s = this.student();
    if (!s) {
      this.error.set('تعذّر تحميل بيانات الطالب');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.data.addEvaluation({
        studentId: s.id,
        circleId: s.circleId,
        date: this.date,
        memorization: this.memorization(),
        review: this.review(),
        tajweed: this.tajweed(),
        attention: this.attention(),
        behavior: this.behavior(),
        notes: this.notes.trim() || undefined,
      });
      await this.router.navigate(['/student', s.id]);
    } catch {
      this.error.set('تعذّر حفظ التقييم، تحقق من الاتصال');
      this.saving.set(false);
    }
  }
}
