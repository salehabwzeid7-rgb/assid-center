import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, today } from '../../core/data.service';
import { RECITATION_KIND_LABELS, type Grade, type RecitationKind, type Student } from '../../core/models';
import { SURAHS, surah } from '../../core/quran-data';
import { GradePickerComponent } from '../../shared/grade-picker';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-recitation-form',
  imports: [FormsModule, PageHeaderComponent, GradePickerComponent],
  template: `
    <app-page-header title="تسجيل تسميع" />

    <div class="page">
      <form class="card" (ngSubmit)="submit()">
        @if (student(); as s) {
          <p class="muted" style="margin-top:0">الطالب: <b>{{ s.name }}</b></p>
        }

        <div class="field">
          <label for="date">التاريخ</label>
          <input id="date" name="date" type="date" [(ngModel)]="m.date" required />
        </div>

        <div class="field">
          <label>نوع التسميع</label>
          <div class="chips">
            @for (k of kinds; track k) {
              <button type="button" class="chip" [class.active]="m.kind === k" (click)="m.kind = k">
                {{ kindLabels[k] }}
              </button>
            }
          </div>
        </div>

        <div class="section-title" style="margin-top:6px">من</div>
        <div class="field-row">
          <div class="field">
            <label for="fromSurah">السورة</label>
            <select id="fromSurah" name="fromSurah" [(ngModel)]="m.fromSurah">
              @for (su of surahs; track su.n) {
                <option [value]="su.n">{{ su.n }}. {{ su.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="fromAyah">الآية</label>
            <input
              id="fromAyah"
              name="fromAyah"
              type="number"
              inputmode="numeric"
              min="1"
              [max]="maxAyah(m.fromSurah)"
              [(ngModel)]="m.fromAyah"
            />
            <div class="hint">من 1 إلى {{ maxAyah(m.fromSurah) }}</div>
          </div>
        </div>

        <div class="section-title">إلى</div>
        <div class="field-row">
          <div class="field">
            <label for="toSurah">السورة</label>
            <select id="toSurah" name="toSurah" [(ngModel)]="m.toSurah">
              @for (su of surahs; track su.n) {
                <option [value]="su.n">{{ su.n }}. {{ su.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="toAyah">الآية</label>
            <input
              id="toAyah"
              name="toAyah"
              type="number"
              inputmode="numeric"
              min="1"
              [max]="maxAyah(m.toSurah)"
              [(ngModel)]="m.toAyah"
            />
            <div class="hint">من 1 إلى {{ maxAyah(m.toSurah) }}</div>
          </div>
        </div>

        <div class="field">
          <label for="pages">عدد الأوجه (الصفحات)</label>
          <input
            id="pages"
            name="pages"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.5"
            [(ngModel)]="m.pages"
          />
        </div>

        <app-grade-picker label="تقدير التسميع" [(value)]="grade" />

        <div class="field-row">
          <div class="field">
            <label for="hifzErrors">أخطاء الحفظ</label>
            <input id="hifzErrors" name="hifzErrors" type="number" inputmode="numeric" min="0" [(ngModel)]="m.hifzErrors" />
          </div>
          <div class="field">
            <label for="tajweedErrors">أخطاء التجويد</label>
            <input id="tajweedErrors" name="tajweedErrors" type="number" inputmode="numeric" min="0" [(ngModel)]="m.tajweedErrors" />
          </div>
        </div>

        <div class="field">
          <label for="promptCount">عدد مرات التلقين (الفتح على الطالب)</label>
          <input id="promptCount" name="promptCount" type="number" inputmode="numeric" min="0" [(ngModel)]="m.promptCount" />
        </div>

        <div class="field">
          <label for="notes">ملاحظات المعلّم</label>
          <textarea id="notes" name="notes" [(ngModel)]="m.notes" placeholder="ملاحظات حول الأداء والتجويد والمواضع المتكررة…"></textarea>
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving() || !student()">
          {{ saving() ? 'جارٍ الحفظ…' : 'حفظ سجل التسميع' }}
        </button>
      </form>
    </div>
  `,
})
export class RecitationFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private router = inject(Router);

  readonly studentId = this.route.snapshot.paramMap.get('id')!;
  readonly student = signal<Student | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly surahs = SURAHS;
  readonly kinds: RecitationKind[] = ['new', 'near_review', 'far_review'];
  readonly kindLabels = RECITATION_KIND_LABELS;
  readonly grade = signal<Grade>('very_good');

  m = {
    date: today(),
    kind: 'new' as RecitationKind,
    fromSurah: 78,
    fromAyah: 1,
    toSurah: 78,
    toAyah: 40,
    pages: 1,
    hifzErrors: 0,
    tajweedErrors: 0,
    promptCount: 0,
    notes: '',
  };

  async ngOnInit(): Promise<void> {
    this.student.set(await this.data.getStudent(this.studentId));
  }

  maxAyah(surahNo: number | string): number {
    return surah(Number(surahNo))?.ayahs ?? 286;
  }

  async submit(): Promise<void> {
    const s = this.student();
    if (!s) {
      this.error.set('تعذّر تحميل بيانات الطالب');
      return;
    }
    const fromSurah = Number(this.m.fromSurah);
    const toSurah = Number(this.m.toSurah);
    const fromAyah = Number(this.m.fromAyah);
    const toAyah = Number(this.m.toAyah);
    if (toSurah < fromSurah || (toSurah === fromSurah && toAyah < fromAyah)) {
      this.error.set('نهاية المقطع يجب أن تكون بعد بدايته');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.data.addRecitation({
        studentId: s.id,
        circleId: s.circleId,
        date: this.m.date,
        kind: this.m.kind,
        fromSurah,
        fromAyah,
        toSurah,
        toAyah,
        pages: Number(this.m.pages) || 0,
        grade: this.grade(),
        hifzErrors: Number(this.m.hifzErrors) || 0,
        tajweedErrors: Number(this.m.tajweedErrors) || 0,
        promptCount: Number(this.m.promptCount) || 0,
        notes: this.m.notes.trim() || undefined,
      });
      await this.router.navigate(['/student', s.id]);
    } catch {
      this.error.set('تعذّر حفظ السجل، تحقق من الاتصال');
      this.saving.set(false);
    }
  }
}
