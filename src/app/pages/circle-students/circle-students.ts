import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import type { Circle } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header';

@Component({
  selector: 'app-circle-students',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header [title]="'طلاب ' + (circle()?.name || 'الحلقة')" />

    <div class="page">
      <div class="row-between section-title">
        <span>القائمة ({{ students()?.length ?? 0 }} — منهم {{ activeCount() }} نشط)</span>
        <a routerLink="/students/new" [queryParams]="{ circle: id }">+ إضافة</a>
      </div>

      @if (students() === undefined) {
        <div class="spinner"></div>
      } @else if (students()!.length === 0) {
        <div class="empty">
          <span class="icon">👤</span>
          لا يوجد طلاب في هذه الحلقة.
          <div style="margin-top:12px">
            <a class="btn btn-primary" routerLink="/students/new" [queryParams]="{ circle: id }">
              إضافة طالب
            </a>
          </div>
        </div>
      } @else {
        @for (s of students(); track s.id) {
          <a
            class="list-item"
            [routerLink]="['/student', s.id]"
            [style.opacity]="s.active ? 1 : 0.55"
          >
            <span class="avatar">{{ s.name.charAt(0) }}</span>
            <span class="grow">
              <span class="primary">{{ s.name }}</span>
              <span class="secondary">
                {{ s.level || 'طالب' }}
                @if (!s.active) {
                  · غير نشط
                }
              </span>
            </span>
            <span class="chevron">‹</span>
          </a>
        }
      }
    </div>

    <button class="fab" type="button" routerLink="/students/new" [queryParams]="{ circle: id }">
      ＋ طالب
    </button>
  `,
})
export class CircleStudentsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private data = inject(DataService);
  private destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly circle = signal<Circle | null>(null);
  readonly students = this.data.studentsByCircle(this.id, this.destroyRef);
  readonly activeCount = computed(() => this.students()?.filter((s) => s.active).length ?? 0);

  async ngOnInit(): Promise<void> {
    this.circle.set(await this.data.getCircle(this.id));
  }
}
