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
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'circles/new',
        loadComponent: () => import('./pages/circle-form/circle-form').then((m) => m.CircleFormPage),
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
        path: 'circle/:id/attendance',
        loadComponent: () => import('./pages/attendance/attendance').then((m) => m.AttendancePage),
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
