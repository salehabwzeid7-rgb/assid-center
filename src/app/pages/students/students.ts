import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { NotifyService } from '../../core/notify.service';
import type { Student } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * قسم «الطلاب» — صفحة مخصّصة بالكامل لإدارة الطلاب:
 *  · بطاقة «إضافة سريعة» في الأعلى (اسم + حلقة + زرّ) لتسجيل الطلاب تباعًا بأقلّ نقرات.
 *  · قائمة بكلّ الطلاب مع بحث فوريّ، وكلّ صفّ يفتح ملفّ الطالب.
 */
@Component({
  selector: 'app-students',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="الطلاب" [back]="false" />

    <div class="page">
      <!-- إضافة سريعة -->
      <form class="card quick-add" (ngSubmit)="quickAdd()">
        <div class="section-title" style="margin-top:0">إضافة طالب جديد</div>

        @if (circles() !== undefined && circles()!.length === 0) {
          <p class="muted" style="margin:0 0 12px">
            لا توجد حلقات بعد — أنشئ حلقة أولًا لتتمكّن من تسجيل الطلاب.
          </p>
          <a class="btn btn-primary btn-block" routerLink="/circles/new">إنشاء حلقة</a>
        } @else {
          <div class="field">
            <label for="qa-name">اسم الطالب</label>
            <input
              #nameInput
              id="qa-name"
              name="qa-name"
              [(ngModel)]="name"
              placeholder="الاسم الكامل"
              autocomplete="off"
            />
          </div>

          <div class="field">
            <label for="qa-circle">الحلقة</label>
            <select id="qa-circle" name="qa-circle" [(ngModel)]="circleId">
              <option value="" disabled>اختر الحلقة</option>
              @for (c of circles(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>

          @if (error()) {
            <div class="alert alert-error">{{ error() }}</div>
          }

          <button class="btn btn-primary btn-block btn-lg" type="submit" [disabled]="saving()">
            {{ saving() ? 'جارٍ الإضافة…' : '＋ إضافة الطالب' }}
          </button>
          <a class="detail-link" routerLink="/students/new">
            إضافة مع تفاصيل كاملة (مستوى، جوال، مقرّر) ‹
          </a>
        }
      </form>

      <!-- القائمة -->
      <div class="row-between section-title">
        <span>كلّ الطلاب ({{ total() }})</span>
        @if (total() > 0) {
          <span class="muted">{{ activeCount() }} نشط</span>
        }
      </div>

      @if (students() === undefined) {
        <div class="spinner"></div>
      } @else if (total() === 0) {
        <div class="empty">
          <span class="icon">👤</span>
          لم يُسجَّل أيّ طالب بعد.
        </div>
      } @else {
        @if (total() > 5) {
          <div class="field" style="margin-bottom:10px">
            <input
              name="q"
              [ngModel]="q()"
              (ngModelChange)="q.set($event)"
              placeholder="ابحث باسم الطالب…"
              autocomplete="off"
              inputmode="search"
            />
          </div>
        }

        @if (filtered().length === 0) {
          <p class="muted" style="margin:2px">لا نتائج مطابقة للبحث.</p>
        } @else {
          @for (s of filtered(); track s.id) {
            <a
              class="list-item"
              [routerLink]="['/student', s.id]"
              [style.opacity]="s.active ? 1 : 0.55"
            >
              <span class="avatar">{{ s.name.charAt(0) }}</span>
              <span class="grow">
                <span class="primary">{{ s.name }}</span>
                <span class="secondary">
                  {{ circleName(s.circleId) }}
                  @if (s.level) {
                    · {{ s.level }}
                  }
                  @if (!s.active) {
                    · غير نشط
                  }
                </span>
              </span>
              <span class="chevron">‹</span>
            </a>
          }
        }
      }
    </div>

    <button class="fab" type="button" routerLink="/students/new">＋ طالب</button>
  `,
  styles: [
    `
      .quick-add {
        margin-bottom: 18px;
      }
      .detail-link {
        display: block;
        margin-top: 12px;
        text-align: center;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--green);
      }
    `,
  ],
})
export class StudentsPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private notify = inject(NotifyService);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);

  readonly total = computed(() => this.students()?.length ?? 0);
  readonly activeCount = computed(() => this.students()?.filter((s) => s.active).length ?? 0);

  readonly saving = signal(false);
  readonly error = signal('');
  readonly q = signal('');

  name = '';
  circleId = '';

  readonly filtered = computed<Student[]>(() => {
    const list = this.students() ?? [];
    const term = this.q().trim();
    if (!term) return list;
    return list.filter((s) => s.name.includes(term));
  });

  circleName(id: string): string {
    return this.circles()?.find((c) => c.id === id)?.name ?? 'حلقة محذوفة';
  }

  async quickAdd(): Promise<void> {
    const name = this.name.trim();
    if (!name) return void this.error.set('أدخل اسم الطالب');
    if (!this.circleId) return void this.error.set('اختر الحلقة');

    this.saving.set(true);
    this.error.set('');
    const id = await this.notify.run(
      () => this.data.addStudent({ name, circleId: this.circleId, active: true }),
      { success: 'أُضيف الطالب', error: 'تعذّر إضافة الطالب' },
    );
    this.saving.set(false);

    if (id) {
      // نُبقي الحلقة مختارة لتسريع تسجيل عدّة طلاب في الحلقة نفسها
      this.name = '';
      this.nameInput()?.nativeElement.focus();
    }
  }
}
