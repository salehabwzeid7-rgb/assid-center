import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // انتقالات الشاشات (View Transitions) — جهة الانزلاق تُحسم في
      // `NavTransitionService` وتُنفّذ بأنماط `::view-transition-*` في styles.css.
      // المتصفّحات التي لا تدعم المواصفة تتجاهلها فيبقى التنقّل فوريًّا كما كان.
      // `skipInitialTransition` — لا انتقال عند أوّل رسمة فوق شاشة البدء.
      withViewTransitions({ skipInitialTransition: true }),
    ),
  ],
};
