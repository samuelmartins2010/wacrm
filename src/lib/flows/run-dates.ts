/**
 * F9: dates in /flows/[id]/runs follow the UI language (before, date-fns
 * printed English month names and 12h clocks for pt-BR users).
 * `timeZone` is only passed by tests; the browser's zone is used otherwise.
 */
export function formatRunStarted(locale: string, iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

export function formatEventTime(locale: string, iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: locale.startsWith("en") ? "h12" : "h23",
    timeZone,
  }).format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/** "há 2 horas" / "2 hours ago". */
export function formatSince(locale: string, iso: string, now: Date = new Date()): string {
  const secs = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size || unit === "second") return rtf.format(Math.round(secs / size), unit);
  }
  return rtf.format(0, "second");
}

/** "2 horas" / "40 seconds": how long a run lasted, largest whole unit. */
export function formatDuration(locale: string, startIso: string, endIso: string): string {
  const secs = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  const [unit, size] = UNITS.find(([, s]) => secs >= s) ?? UNITS[UNITS.length - 1];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(Math.floor(secs / size));
}
