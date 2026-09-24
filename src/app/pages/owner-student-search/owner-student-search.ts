import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * تصفّح/بحث عن طالب عبر كل المعلّمين — للوحة المالك فقط. عرض فقط، بلا أيّ
 * دمج بين نتائج معلّمين مختلفين (قرار متعمَّد: لا معرّف فريد حقيقيّ للطالب في
 * هذا التطبيق، فتشابه الاسم — شائع جدًّا بالعربيّة — لا يعني بالضرورة نفس
 * الطفل). القائمة كاملة افتراضيًّا (v1.34) — لا تحتاج كتابة لرؤية شيء، بخلاف
 * النسخة السابقة التي كانت بحثًا صرفًا بلا تصفّح.
 */
@Component({
  selector: 'app-owner-student-search',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="كل الطلّاب" />

    <div class="page">
      <div class="field">
        <input
          type="text"
          placeholder="تصفية باسم الطالب…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
      </div>

      @if (students() === undefined) {
        <div class="spinner"></div>
      } @else if (filtered().length === 0) {
        <div class="empty"><span class="icon">🔍</span> لا نتائج مطابقة.</div>
      } @else {
        <p class="muted" style="margin:0 0 10px;font-size:.8rem">
          {{ filtered().length }} طالب{{ query().trim() ? ' (من ' + students()!.length + ')' : '' }}
        </p>
        @for (r of filtered(); track r.teacherId + '_' + r.id) {
          <a class="list-item" [routerLink]="['/sys/teacher', r.teacherId]">
            <span class="avatar">🧒</span>
            <span class="grow">
              <span class="primary">{{ r.name }}</span>
              <span class="secondary">لدى المعلّم: {{ r.teacherName }}</span>
            </span>
            <span class="chevron">‹</span>
          </a>
        }
      }
    </div>
  `,
})
export class OwnerStudentSearchPage {
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly query = signal('');
  readonly students = this.data.platformAllStudents(this.destroyRef);

  readonly filtered = computed(() => {
    const q = this.query().trim();
    const list = this.students() ?? [];
    if (!q) return list;
    return list.filter((s) => s.name.includes(q));
  });
}
