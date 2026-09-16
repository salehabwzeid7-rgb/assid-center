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
 * Firestore (isPlatformOwner) التي لا تعتمد على هذا الحارس إطلاقًا.
 *
 * عزل صارم (v1.26.1): معلّم عاديّ مسجَّل دخول بالفعل يصل هنا بالخطأ/الفضول
 * يُعاد **لصفحته الرئيسيّة العاديّة بصمت** (لا لصفحة دخول منفصلة) — حتى لا
 * تعطيه أيّ إشارة بوجود طبقة مصادقة أخرى مختلفة عن حسابه. صفحة دخول المالك
 * (`/sys-check`) لا تظهر إلّا لزائر غير مسجَّل دخول إطلاقًا، أو للمالك نفسه.
 */
export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.readyPromise;
  if (auth.isLoggedIn() && auth.isOwnerAccount()) return true;
  if (auth.isLoggedIn()) return router.createUrlTree(['/']);
  return router.createUrlTree(['/sys-check']);
};
