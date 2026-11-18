import { describe, expect, it } from "vitest";
import { getPageTitleKey } from "./header-title";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";

describe("header title (F9)", () => {
  it("/flows and its sub-pages show Flows, not Dashboard", () => {
    expect(getPageTitleKey("/flows")).toBe("flows");
    expect(getPageTitleKey("/flows/abc/runs")).toBe("flows");
  });
  it("has the flows title in both languages", () => {
    expect((pt as { Header: Record<string, string> }).Header.flows).toBe("Fluxos");
    expect((en as { Header: Record<string, string> }).Header.flows).toBe("Flows");
  });
  it("the activation 422 sentence exists in both languages", () => {
    const k = (m: unknown) => (m as { Flows: { api: Record<string, string> } }).Flows.api.activateBlocked;
    expect(k(pt)).toMatch(/ativar/i);
    expect(k(en)).toMatch(/activate/i);
  });
});
