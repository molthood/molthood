export async function register() {
  // Imported lazily so the edge runtime does not pull in the Node build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
