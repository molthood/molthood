/**
 * Where the console keeps its API key.
 *
 * `localStorage`, deliberately. The alternative is an httpOnly cookie, which
 * is genuinely safer against XSS — but it needs a session endpoint, a CSRF
 * defence, and a same-site deployment, none of which exist yet. Choosing the
 * cookie now would mean writing three things that only half work.
 *
 * The tradeoff is stated rather than hidden: a script running on this origin
 * can read the key. What limits the damage is on the server — a key is capped
 * at a daily analysis allowance and can be revoked, so a stolen one cannot run
 * up an unbounded bill.
 */

const STORAGE_KEY = "molthood.api_key";

/** Notifies every hook in the tab when the key changes. */
const CHANGE_EVENT = "molthood:credential";

export function readApiKey(): string | null {
  // Called during render on the server, where there is no storage at all.
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled outright, or blocked in a private context.
    // The console still works; it just cannot remember the key.
    return null;
  }
}

export function writeApiKey(key: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above — nothing to recover, and nothing worth interrupting for.
  }

  // `storage` only fires in *other* tabs, so this tab needs its own signal.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribes to key changes, in this tab and in others. */
export function onApiKeyChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The Authorization header, or nothing when no key is stored. */
export function authHeaders(): Record<string, string> {
  const key = readApiKey();
  return key ? { authorization: `Bearer ${key}` } : {};
}
