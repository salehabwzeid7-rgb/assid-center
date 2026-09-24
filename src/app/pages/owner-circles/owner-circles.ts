import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PageHeaderComponent } from '../../shared/page-header';

/**
 * تصفّح كل الحلقات عبر كل المعلّمين — للوحة المالك فقط (v1.34). عرض فقط،
 * بلا دمج بين معلّمين (كلّ حلقة سجلّ مستقلّ تحت معلّمها)، بنفس فلسفة
 * `OwnerStudentSearchPage`. النقر على حلقة يفتح صفحة معلّمها (لا صفحة حلقة
 * مستقلّة — لوحة المالك لا تملك عرض تفصيليّ لحلقة بمفردها، فقط لمعلّم كامل).
 */
@Component({
  selector: 'app-owner-circles',
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="كل الحلقات" />

    <div class="page">
      <div class="field">
        <input
          type="text"
          placeholder="تصفية بالاسم…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
      </div>

      @if (circles() === undefined) {
        <div class="spinner"></div>
      } @else if (filtered().length === 0) {
        <div class="empty"><span class="icon">📚</span> لا حلقات مطابقة.</div>
      } @else {
        <p class="muted" style="margin:0 0 10px;font-size:.8rem">
          {{ filtered().length }} حلقة{{ query().trim() ? ' (من ' + circles()!.length + ')' : '' }}
        </p>
        @for (c of filtered(); track c.teacherId + '_' + c.id) {
          <a class="list-item" [routerLink]="['/sys/teacher', c.teacherId]">
            <span class="avatar">📗</span>
            <span class="grow">
              <span class="primary">{{ c.name }}</span>
              <span class="secondary">لدى المعلّم: {{ c.teacherName }}</span>
            </span>
            <span class="chevron">‹</span>
          </a>
        }
      }
    </div>
  `,
})
export class OwnerCirclesPage {
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly query = signal('');
  readonly circles = this.data.platformAllCircles(this.destroyRef);

  readonly filtered = computed(() => {
    const q = this.query().trim();
    const list = this.circles() ?? [];
    if (!q) return list;
    return list.filter((c) => c.name.includes(q));
  });
}
