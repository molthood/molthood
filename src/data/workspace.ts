/**
 * Console chrome identity.
 *
 * There is no authentication yet, so there is no signed-in user — and the
 * console says so rather than displaying one. The previous values ("Local
 * Operator", plan "Local development") were placeholders that shipped to
 * production and read as an unfinished build to every visitor arriving from
 * the landing page.
 *
 * Nothing here is chain data or a platform metric. When accounts exist, this
 * module is replaced by the session; nothing else should need to change.
 */

export const currentUser = {
  name: "Guest",
  handle: "@guest",
  email: "No account — analyses are scoped to your API key",
  role: "Unauthenticated",
  initials: "G",
} as const;

export const workspace = {
  name: "Molthood Console",
  plan: "Robinhood Chain",
  network: "Robinhood Chain",
} as const;
