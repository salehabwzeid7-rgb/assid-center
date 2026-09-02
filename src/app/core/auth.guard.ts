import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/** يمنع الوصول للشاشات المحمية قبل تسجيل الدخول */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.readyPromise;
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/** يحوّل المستخدم المسجَّل بعيدًا عن شاشة الدخول */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.readyPromise;
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
