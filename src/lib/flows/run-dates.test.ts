import { describe, expect, it } from "vitest";
import { formatDuration, formatEventTime, formatRunStarted, formatSince } from "./run-dates";

const iso = "2026-11-18T14:05:09Z";

describe("run viewer dates follow the UI language (F9)", () => {
  it("started-at", () => {
    expect(formatRunStarted("pt-BR", iso, "UTC")).toBe("18 de nov. de 2026, 14:05");
    expect(formatRunStarted("en", iso, "UTC")).toBe("Nov 18, 2026, 2:05 PM");
  });
  it("event time is 24h in pt-BR", () => {
    expect(formatEventTime("pt-BR", iso, "UTC")).toBe("14:05:09");
  });
  it("relative time", () => {
    const now = new Date("2026-11-18T16:05:09Z");
    expect(formatSince("pt-BR", iso, now)).toBe("há 2 horas");
    expect(formatSince("en", iso, now)).toBe("2 hours ago");
  });
});

describe("run duration (started → ended) in the UI language (F9)", () => {
  it("uses the largest whole unit", () => {
    expect(formatDuration("pt-BR", "2026-11-18T14:00:00Z", "2026-11-18T16:30:00Z")).toBe("2 horas");
    expect(formatDuration("en", "2026-11-18T14:00:00Z", "2026-11-18T14:00:40Z")).toBe("40 seconds");
    expect(formatDuration("pt-BR", "2026-11-18T14:00:00Z", "2026-11-18T14:01:00Z")).toBe("1 minuto");
  });
});
