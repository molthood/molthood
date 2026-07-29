/**
 * Console chrome identity.
 *
 * Authentication is not implemented, so there is no real signed-in user. These
 * values label the interface only — nothing here is presented as chain data or
 * as a platform metric.
 */

export const currentUser = {
  name: "Local Operator",
  handle: "@operator",
  email: "operator@molthood.local",
  role: "Workspace owner",
  initials: "LO",
} as const;

export const workspace = {
  name: "Molthood Workspace",
  plan: "Local development",
  network: "Robinhood Chain",
} as const;
