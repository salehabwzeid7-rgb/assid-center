import { Routes } from '@angular/router';
import { authGuard, guestGuard, ownerGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    // بوّابة دخول المالك (v1.26.0) — مستقلّة تمامًا، بلا رابط ظاهر من أيّ تنقّل.
    // مسار عامّ الاسم عمدًا (لا "owner") — تقليل فرصة الاكتشاف العرضيّ من
    // متصفّح فضوليّ لسجلّ الروابط أو قائمة المسارات؛ الحماية الفعليّة تبقى
    // قواعد Firestore (isPlatformOwner) بصرف النظر عن اسم المسار (v1.26.1).
    path: 'sys-check',
    loadComponent: () => import('./pages/owner-login/owner-login').then((m) => m.OwnerLoginPage),
  },
  {
    path: 'sys',
    canActivate: [ownerGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/owner-dashboard/owner-dashboard').then((m) => m.OwnerDashboardPage),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./pages/owner-student-search/owner-student-search').then(
            (m) => m.OwnerStudentSearchPage,
          ),
      },
      {
        path: 'deleted',
        loadComponent: () =>
          import('./pages/owner-deleted-items/owner-deleted-items').then(
            (m) => m.OwnerDeletedItemsPage,
          ),
      },
      {
        path: 'teacher/:uid',
        loadComponent: () =>
          import('./pages/owner-teacher-detail/owner-teacher-detail').then(
            (m) => m.OwnerTeacherDetailPage,
          ),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'circles',
        loadComponent: () => import('./pages/circles/circles').then((m) => m.CirclesPage),
      },
      {
        path: 'schedule',
        loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
      },
      {
        path: 'sard',
        loadComponent: () =>
          import('./pages/sard-dashboard/sard-dashboard').then((m) => m.SardDashboardPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'activity-log',
        loadComponent: () =>
          import('./pages/activity-log/activity-log').then((m) => m.ActivityLogPage),
      },
      {
        path: 'circles/new',
        loadComponent: () =>
          import('./pages/circle-form/circle-form').then((m) => m.CircleFormPage),
      },
      {
        path: 'circle/:id/edit',
        loadComponent: () =>
          import('./pages/circle-form/circle-form').then((m) => m.CircleFormPage),
      },
      {
        path: 'students',
        loadComponent: () => import('./pages/students/students').then((m) => m.StudentsPage),
      },
      {
        path: 'students/new',
        loadComponent: () =>
          import('./pages/student-form/student-form').then((m) => m.StudentFormPage),
      },
      {
        path: 'circle/:id',
        loadComponent: () => import('./pages/circle/circle').then((m) => m.CirclePage),
      },
      {
        path: 'circle/:id/students',
        loadComponent: () =>
          import('./pages/circle-students/circle-students').then((m) => m.CircleStudentsPage),
      },
      {
        path: 'circle/:id/stats',
        loadComponent: () =>
          import('./pages/circle-stats/circle-stats').then((m) => m.CircleStatsPage),
      },
      {
        // اختبارات التجويد (حلقات التجويد فقط) — قائمة + إنشاء
        path: 'circle/:id/exams',
        loadComponent: () =>
          import('./pages/tajweed-exams/tajweed-exams').then((m) => m.TajweedExamsPage),
      },
      {
        // اختبار تجويد واحد — تفاصيل ودرجات وتقارير
        path: 'circle/:id/exams/:examId',
        loadComponent: () =>
          import('./pages/tajweed-exam/tajweed-exam').then((m) => m.TajweedExamPage),
      },
      {
        path: 'session/:id',
        loadComponent: () => import('./pages/session/session').then((m) => m.SessionPage),
      },
      {
        // التقييم اليوميّ — يُفتح من داخل الجلسة النشطة فقط
        path: 'session/:sessionId/evaluate/:studentId',
        loadComponent: () =>
          import('./pages/evaluation-form/evaluation-form').then((m) => m.EvaluationFormPage),
      },
      {
        path: 'student/:id',
        loadComponent: () => import('./pages/student/student').then((m) => m.StudentPage),
      },
      {
        path: 'student/:id/edit',
        loadComponent: () =>
          import('./pages/student-form/student-form').then((m) => m.StudentFormPage),
      },
      {
        path: 'student/:id/serd',
        loadComponent: () => import('./pages/serd/serd').then((m) => m.SerdPage),
      },
      {
        path: 'student/:id/exam',
        loadComponent: () => import('./pages/exam/exam').then((m) => m.ExamPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
