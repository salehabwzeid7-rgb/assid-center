import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { type PlatformMirrorItem } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * بحث عن طالب بالاسم عبر كل المعلّمين — عرض فقط، بلا أيّ دمج بين نتائج
 * معلّمين مختلفين (قرار متعمَّد: لا معرّف فريد حقيقيّ للطالب في هذا التطبيق،
 * فتشابه الاسم — شائع جدًّا بالعربيّة — لا يعني بالضرورة نفس الطفل).
 */
@Component({
  selector: 'app-owner-student-search',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="بحث عن طالب" />

    <div class="page">
      <div class="field">
        <input
          type="text"
          placeholder="اكتب اسم الطالب…"
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
        />
      </div>
      <p class="muted" style="margin:6px 0 16px;font-size:.8rem">
        كل نتيجة سجلّ طالب مستقلّ تحت معلّمه — لا يوجد دمج بين نتائج معلّمين مختلفين حتى مع تطابق
        الاسم.
      </p>

      @if (searching()) {
        <div class="spinner"></div>
      } @else if (query().trim().length > 0 && results().length === 0) {
        <div class="empty"><span class="icon">🔍</span> لا نتائج مطابقة.</div>
      }

      @for (r of results(); track r.teacherId + '_' + r.id) {
        <a class="list-item" [routerLink]="['/sys/teacher', r.teacherId]">
          <span class="avatar">🧒</span>
          <span class="grow">
            <span class="primary">{{ r.name }}</span>
            <span class="secondary">لدى المعلّم: {{ r.teacherName }}</span>
          </span>
          <span class="chevron">‹</span>
        </a>
      }
    </div>
  `,
})
export class OwnerStudentSearchPage {
  private data = inject(DataService);

  readonly query = signal('');
  readonly results = signal<PlatformMirrorItem[]>([]);
  readonly searching = signal(false);
  private debounceTimer?: ReturnType<typeof setTimeout>;

  onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.debounceTimer);
    if (!value.trim()) {
      this.results.set([]);
      return;
    }
    this.debounceTimer = setTimeout(() => void this.runSearch(value), 300);
  }

  private async runSearch(value: string): Promise<void> {
    this.searching.set(true);
    try {
      this.results.set(await this.data.searchPlatformStudents(value));
    } finally {
      this.searching.set(false);
    }
  }
}
