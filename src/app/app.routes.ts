import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
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
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
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
        path: 'session/:id',
        loadComponent: () => import('./pages/session/session').then((m) => m.SessionPage),
      },
      {
        path: 'session/:sessionId/recite/:studentId',
        loadComponent: () =>
          import('./pages/recitation-form/recitation-form').then((m) => m.RecitationFormPage),
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
        path: 'student/:id/recitation',
        loadComponent: () =>
          import('./pages/recitation-form/recitation-form').then((m) => m.RecitationFormPage),
      },
      {
        path: 'student/:id/evaluation',
        loadComponent: () =>
          import('./pages/evaluation-form/evaluation-form').then((m) => m.EvaluationFormPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
