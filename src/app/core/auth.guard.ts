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

/**
 * يمنع الوصول لصفحات لوحة المالك (v1.26.0) عن أيّ حساب غير حساب المالك —
 * حماية واجهة إضافيّة (تجربة مستخدم فقط)، الحماية الفعليّة الوحيدة هي قواعد
 * Firestore (isPlatformOwner) التي لا تعتمد على هذا الحارس إطلاقًا. حساب
 * مسجَّل دخول لكنّه ليس المالك يُعاد لصفحة دخول المالك (لا الرئيسيّة) — حتى
 * لا يظنّ أنّه وصل بالخطأ لمسار عاديّ.
 */
export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.readyPromise;
  if (auth.isLoggedIn() && auth.isOwnerAccount()) return true;
  return router.createUrlTree(['/owner-login']);
};
