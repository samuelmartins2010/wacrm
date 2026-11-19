import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { defaultPipelineSeed, formatDealDate } from "./default-pipeline";

const tr = (locale: "pt-BR" | "en", messages: object) =>
  createTranslator({ locale, messages, namespace: "Pipelines.defaultPipeline" as never }) as unknown as (k: string) => string;

describe("default pipeline seed follows the UI language", () => {
  it("pt-BR", () => {
    const seed = defaultPipelineSeed(tr("pt-BR", pt));
    expect(seed.name).toBe("Funil de vendas");
    expect(seed.stages.map((s) => s.name)).toEqual(["Novo lead", "Qualificado", "Proposta enviada", "Negociação", "Ganho"]);
    expect(seed.stages.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
  });
  it("en", () => {
    const seed = defaultPipelineSeed(tr("en", en));
    expect(seed.name).toBe("Sales Pipeline");
    expect(seed.stages.map((s) => s.name)).toEqual(["New Lead", "Qualified", "Proposal Sent", "Negotiation", "Won"]);
  });
});

describe("deal card date follows the UI language", () => {
  it("pt-BR vs en", () => {
    expect(formatDealDate("pt-BR", "2026-11-18T12:00:00Z", "UTC")).toBe("18 de nov. de 2026");
    expect(formatDealDate("en", "2026-11-18T12:00:00Z", "UTC")).toBe("Nov 18, 2026");
  });
});
