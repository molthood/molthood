/**
 * Surfaces that exist in the codebase but are not open to the public yet.
 *
 * A flag rather than a deletion, and rather than a branch. Every dashboard
 * page, component and route stays exactly where it is and keeps compiling and
 * type-checking with the rest of the product — which is what stops it rotting
 * while it waits. Flipping one environment variable brings it back; nothing
 * has to be rebuilt or remembered.
 *
 * Read on the server. `NEXT_PUBLIC_` is deliberately absent: this decides what
 * a request is allowed to see, so it is not the browser's to assert.
 */

/** Default off. A surface opens when somebody decides it is ready, not by drift. */
export const DASHBOARD_ENABLED = process.env.DASHBOARD_ENABLED === "true";
