import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// D3: time_based is hidden when creating; an old automation that uses it
// still shows its own type (with a warning) so it can be changed.
describe("trigger picker (D3)", () => {
  const src = readFileSync("src/components/automations/automation-builder.tsx", "utf8");
  it("filters time_based out unless it is the current type", () => {
    expect(src).toContain('TRIGGER_OPTIONS.filter((o) => o.value !== "time_based" || type === "time_based")');
  });
  it("shows the deprecation warning for time_based", () => {
    expect(src).toMatch(/type === "time_based"[\s\S]{0,200}timeBasedDeprecated/);
  });
});
