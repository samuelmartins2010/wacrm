import { describe, expect, it } from "vitest";
import { triggerMatches } from "./engine";

const auto = (keywords: string[], match_type: "contains" | "exact", case_sensitive = false) =>
  ({ trigger_type: "keyword_match", trigger_config: { keywords, match_type, case_sensitive } }) as never;
const m = (a: never, text: string) => triggerMatches(a, { message_text: text });

describe("keyword matching (D5)", () => {
  it("ignores case and accents", () => {
    expect(m(auto(["preço"], "contains"), "Qual o PRECO?")).toBe(true);
    expect(m(auto(["PRECO"], "contains"), "qual o preço")).toBe(true);
  });
  it("'contains' matches whole words only", () => {
    expect(m(auto(["oi"], "contains"), "Oi, tudo bem?")).toBe(true);
    expect(m(auto(["oi"], "contains"), "foi ótimo")).toBe(false);
    expect(m(auto(["oi"], "contains"), "boicote")).toBe(false);
    expect(m(auto(["bom dia"], "contains"), "olá, bom dia!")).toBe(true);
    expect(m(auto(["bom dia"], "contains"), "bom diaa")).toBe(false);
  });
  it("'exact' ignores surrounding punctuation and spaces", () => {
    expect(m(auto(["sim"], "exact"), "  Sim!! ")).toBe(true);
    expect(m(auto(["sim"], "exact"), "sim, quero")).toBe(false);
    expect(m(auto(["quero comprar"], "exact"), "Quero   comprar.")).toBe(true);
  });
  it("legacy case_sensitive configs are treated the same way (D5 drops it)", () => {
    expect(m(auto(["Oi"], "contains", true), "oi")).toBe(true);
  });
  it("empty keyword never matches", () => {
    expect(m(auto(["  "], "contains"), "qualquer")).toBe(false);
  });
});
