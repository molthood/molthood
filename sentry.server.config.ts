import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error tracking for the console's own rendering.
 *
 * Distinct from the backend's Sentry project: this reports Next.js failures —
 * a page that threw, a build-time fetch that broke. Analysis errors belong to
 * the API and are reported there, with their own scrubbing.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
