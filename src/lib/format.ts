/**
 * All console data is mocked against a fixed reference instant rather than
 * `Date.now()`. Relative timestamps must render identically on the server and
 * on the client, and a live clock would guarantee a hydration mismatch.
 */
export const REFERENCE_NOW = new Date("2026-07-28T14:32:00.000Z");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const numberFormatter = new Intl.NumberFormat("en-US");

/** "just now", "12m ago", "3h ago", "5d ago", then an absolute date. */
export function formatRelativeTime(iso: string, from: Date = REFERENCE_NOW) {
  const elapsed = from.getTime() - new Date(iso).getTime();

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;

  return dateFormatter.format(new Date(iso));
}

/** "820ms", "4.2s", "3m 08s", "1h 12m". */
export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.floor((ms % MINUTE) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDateTime(iso: string) {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "21.1M", "4.5K" — for stat tiles where precision costs more than it gives. */
export function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return compactFormatter.format(value);
}

/** USD with a sensible precision for the magnitude. */
export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${compactFormatter.format(value)}`;
  if (Math.abs(value) >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${value.toPrecision(3)}`;
}

/** Renders an arbitrary evidence value as text — never as raw JSON. */
export function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? formatNumber(value)
      : value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((entry) => formatEvidenceValue(entry)).join(", ");
  }

  if (typeof value === "object") {
    // Flatten one level into "key label" pairs rather than dumping an object.
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key.replace(/_/g, " ")} ${formatEvidenceValue(entry)}`)
      .join(" · ");
  }

  return String(value);
}

/** Shortens an address for display: 0x5d3a…ef34 */
export function shortenAddress(address: string | null | undefined, size = 6) {
  if (!address) return "—";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-4)}`;
}

/** Signed percentage, e.g. "+12.4%" / "-3.1%". */
export function formatDelta(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Builds an ISO string a given number of minutes before the reference instant. */
export function minutesAgo(minutes: number) {
  return new Date(REFERENCE_NOW.getTime() - minutes * MINUTE).toISOString();
}

export function hoursAgo(hours: number) {
  return minutesAgo(hours * 60);
}

export function daysAgo(days: number) {
  return minutesAgo(days * 60 * 24);
}
