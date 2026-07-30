import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error tracking.
 *
 * The DSN is public by necessity — it ships in the bundle, which is what a
 * `NEXT_PUBLIC_` variable means. That is fine and by design: a DSN authorises
 * *sending* events, not reading them.
 *
 * What is not fine is what a browser event carries by default. The console
 * shows addresses somebody analysed, and those sit in the URL and in the DOM.
 * So the URL is reduced to its route and replays are off entirely — a session
 * recording of this console is a recording of somebody's portfolio.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  tracesSampleRate: 0.1,
  // Off deliberately, not left at a default.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = scrub(event.request.url);
    }
    if (event.request) delete event.request.cookies;
    for (const crumb of event.breadcrumbs ?? []) {
      if (typeof crumb.message === "string") crumb.message = scrub(crumb.message);
    }
    return event;
  },
});

/** `/executions/0xabc…` becomes `/executions/{address}`. */
function scrub(value: string): string {
  return value
    .replace(/0x[a-fA-F0-9]{6,}/g, "{address}")
    .replace(/\b[a-f0-9]{32}\b/g, "{id}")
    .split("?")[0];
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
