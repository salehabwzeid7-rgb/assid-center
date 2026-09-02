import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService, today, toDateStr } from '../../core/data.service';
import { SESSION_STATUS_LABELS, type Session } from '../../core/models';

/** آيات مختارة عن العلم والقرآن — تُعرض واحدة يوميًّا بالتناوب حسب اليوم. */
const VERSES: { ref: string; text: string; meaning: string }[] = [
  {
    ref: 'البقرة ١٨٦',
    text: '﴿وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ ٱلدَّاعِ إِذَا دَعَانِ﴾',
    meaning: 'قربٌ من الله وإجابةٌ للدعاء — تذكيرٌ للمعلّم والطالب أن يستعينا به في كل خطوة.',
  },
  {
    ref: 'طه ١١٤',
    text: '﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾',
    meaning: 'دعاءٌ بطلب الزيادة في العلم؛ خيرُ ما يُفتتح به مجلس التحفيظ.',
  },
  {
    ref: 'القمر ١٧',
    text: '﴿وَلَقَدْ يَسَّرْنَا ٱلْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ﴾',
    meaning: 'تيسيرُ الله لحفظ كتابه وتدبّره؛ فليُقبِل الطالب واثقًا بعون الله.',
  },
  {
    ref: 'فاطر ٢٩',
    text: '﴿إِنَّ ٱلَّذِينَ يَتْلُونَ كِتَٰبَ ٱللَّهِ وَأَقَامُوا۟ ٱلصَّلَوٰةَ ... يَرْجُونَ تِجَٰرَةً لَّن تَبُورَ﴾',
    meaning: 'تلاوةُ القرآن مع العمل تجارةٌ رابحةٌ لا كساد فيها ولا خسارة.',
  },
  {
    ref: 'المجادلة ١١',
    text: '﴿يَرْفَعِ ٱللَّهُ ٱلَّذِينَ ءَامَنُوا۟ مِنكُمْ وَٱلَّذِينَ أُوتُوا۟ ٱلْعِلْمَ دَرَجَٰتٍ﴾',
    meaning: 'رفعةُ الدرجات لأهل الإيمان والعلم؛ حافزٌ للمثابرة في الطلب والتعليم.',
  },
  {
    ref: 'العنكبوت ٤٩',
    text: '﴿بَلْ هُوَ ءَايَٰتٌۢ بَيِّنَٰتٌ فِى صُدُورِ ٱلَّذِينَ أُوتُوا۟ ٱلْعِلْمَ﴾',
    meaning: 'شرفُ حَمَلة القرآن أن يكون محفوظًا في صدورهم آياتٍ بيّنات.',
  },
  {
    ref: 'ص ٢٩',
    text: '﴿كِتَٰبٌ أَنزَلْنَٰهُ إِلَيْكَ مُبَٰرَكٌ لِّيَدَّبَّرُوٓا۟ ءَايَٰتِهِۦ وَلِيَتَذَكَّرَ أُو۟لُوا۟ ٱلْأَلْبَٰبِ﴾',
    meaning: 'الغايةُ من إنزال القرآن تدبّرُه والاتّعاظ به، لا مجرّد تلاوة اللسان.',
  },
  {
    ref: 'الإسراء ٩',
    text: '﴿إِنَّ هَٰذَا ٱلْقُرْءَانَ يَهْدِى لِلَّتِى هِىَ أَقْوَمُ﴾',
    meaning: 'القرآن يهدي إلى أقوم الطرق وأصلحها في الاعتقاد والعمل والسلوك.',
  },
];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="greet">
        <div class="grow">
          <p class="salam">السلام عليكم</p>
          <h1>أهلاً، {{ firstName() }} 👋</h1>
        </div>
        <div class="greet-actions">
          <button class="bell" type="button" routerLink="/schedule" aria-label="الحصص المفتوحة">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            @if (openCount() > 0) {
              <span class="dot"></span>
            }
          </button>
          <button
            class="avatar-btn"
            type="button"
            routerLink="/profile"
            [attr.aria-label]="'حساب ' + firstName()"
          >
            {{ initials() }}
          </button>
        </div>
      </header>

      <section class="verse-card">
        <p class="kicker">آية اليوم · سورة {{ verse.ref }}</p>
        <p class="ayah">{{ verse.text }}</p>
        <p class="meaning">{{ verse.meaning }}</p>
      </section>

      <div class="stat-row">
        <div class="stat">
          <div class="num">{{ circles()?.length ?? 0 }} <span class="unit">حلقة</span></div>
          <div class="label">نشطة</div>
        </div>
        <div class="stat">
          <div class="num">{{ students()?.length ?? 0 }} <span class="unit">طالب</span></div>
          <div class="label">مسجّل</div>
        </div>
        <div class="stat">
          <div class="num">
            @if (attendancePct() === null) {
              —
            } @else {
              {{ attendancePct() }}<span class="unit">%</span>
            }
          </div>
          <div class="label">حضور اليوم</div>
        </div>
      </div>

      <div class="section-title">إجراءات سريعة</div>
      <div class="qa-grid">
        <a class="qa" routerLink="/circles/new">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M12 6c-1.8-1.3-4.2-2-7-2v14c2.8 0 5.2.7 7 2 1.8-1.3 4.2-2 7-2V4c-2.8 0-5.2.7-7 2Z"
              />
              <path d="M12 6v14" />
            </svg>
          </span>
          <span class="qa-label">حلقة جديدة</span>
        </a>
        <a class="qa" routerLink="/students/new">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="9.5" cy="8" r="3.3" />
              <path d="M3.5 20c.9-3.3 3.3-4.8 6-4.8 1.3 0 2.5.3 3.5 1" />
              <path d="M17.5 14v6M14.5 17h6" />
            </svg>
          </span>
          <span class="qa-label">طالب جديد</span>
        </a>
        <a class="qa" routerLink="/circles">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
              <path d="M3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" />
            </svg>
          </span>
          <span class="qa-label">كل الحلقات</span>
        </a>
        <a class="qa" routerLink="/schedule">
          <span class="qa-ico">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4.5" width="18" height="16" rx="2" />
              <path d="M3 9.5h18M8 3v4M16 3v4" />
            </svg>
          </span>
          <span class="qa-label">الجدول</span>
        </a>
      </div>

      <div class="row-between section-title">
        <span>الحصص القادمة</span>
        <a routerLink="/schedule">عرض الكل</a>
      </div>

      @if (upcoming() === undefined) {
        <div class="spinner"></div>
      } @else if (upcoming()!.length === 0) {
        <div class="empty">
          <span class="icon">🗓️</span>
          لا توجد حصص قادمة — ابدأ حصّة من صفحة الحلقة.
        </div>
      } @else {
        @for (s of upcoming(); track s.id) {
          <a class="list-item" [routerLink]="['/session', s.id]">
            <span class="avatar">{{ circleInitial(s.circleId) }}</span>
            <span class="grow">
              <span class="primary">{{ circleName(s.circleId) }}</span>
              <span class="secondary">{{ circleSchedule(s.circleId) || 'حصّة الحلقة' }}</span>
            </span>
            <span class="when">
              <span class="day">{{ relDay(s.date) }}</span>
              <span [class]="'badge b-' + (s.status === 'open' ? 'late' : 'present')">
                {{ statusLabels[s.status] }}
              </span>
            </span>
          </a>
        }
      }
    </div>
  `,
})
export class DashboardPage {
  private destroyRef = inject(DestroyRef);
  private data = inject(DataService);
  private auth = inject(AuthService);

  readonly statusLabels = SESSION_STATUS_LABELS;
  readonly verse = VERSES[dayOfYear() % VERSES.length];

  readonly circles = this.data.circles(this.destroyRef);
  readonly students = this.data.allStudents(this.destroyRef);
  private readonly sessions = this.data.allSessions(this.destroyRef);
  private readonly attToday = this.data.attendanceForDate(today(), this.destroyRef);

  readonly firstName = computed(
    () => (this.auth.teacher()?.name ?? 'أستاذ').trim().split(/\s+/)[0],
  );
  readonly initials = computed(() => {
    const parts = (this.auth.teacher()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return (
      parts
        .map((p) => p.charAt(0))
        .join('')
        .slice(0, 2) || 'م'
    ).toUpperCase();
  });

  readonly openCount = computed(
    () => this.sessions()?.filter((s) => s.status === 'open').length ?? 0,
  );

  readonly attendancePct = computed<number | null>(() => {
    const rows = this.attToday();
    if (!rows || rows.length === 0) return null;
    const present = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((present / rows.length) * 100);
  });

  /** حصص مفتوحة أو مجدولة اليوم وما بعده — مرتّبة تصاعديًّا، حتى ٣. */
  readonly upcoming = computed<Session[] | undefined>(() => {
    const all = this.sessions();
    if (all === undefined) return undefined;
    const t = today();
    return all
      .filter((s) => s.status === 'open' || s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt)
      .slice(0, 3);
  });

  private circle(id: string) {
    return this.circles()?.find((c) => c.id === id);
  }
  circleName(id: string): string {
    return this.circle(id)?.name ?? 'الحلقة';
  }
  circleInitial(id: string): string {
    return this.circleName(id).charAt(0);
  }
  circleSchedule(id: string): string {
    return this.circle(id)?.schedule ?? '';
  }

  relDay(date: string): string {
    const t = today();
    if (date === t) return 'اليوم';
    const tomorrow = toDateStr(new Date(Date.now() + 86400000));
    if (date === tomorrow) return 'غدًا';
    const yesterday = toDateStr(new Date(Date.now() - 86400000));
    if (date === yesterday) return 'أمس';
    return new Date(date + 'T00:00:00').toLocaleDateString('ar', { weekday: 'long' });
  }
}

/** ترتيب اليوم في السنة (١..٣٦٦) لاختيار آية اليوم. */
function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}
