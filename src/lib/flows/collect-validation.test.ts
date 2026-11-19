import { describe, expect, it } from "vitest";
import { isValidCollectedInput } from "./collect-validation";

describe("isValidCollectedInput (D9)", () => {
  it("any / missing validation accepts non-empty text", () => {
    expect(isValidCollectedInput("qualquer coisa", {})).toBe(true);
    expect(isValidCollectedInput("x", { validation: "any" })).toBe(true);
  });
  it("email", () => {
    expect(isValidCollectedInput("ana@empresa.com.br", { validation: "email" })).toBe(true);
    for (const bad of ["Carla", "ana@", "@x.com", "ana@x", "ana silva@x.com"]) {
      expect(isValidCollectedInput(bad, { validation: "email" })).toBe(false);
    }
  });
  it("phone: 10 to 15 digits, formatting allowed", () => {
    expect(isValidCollectedInput("+55 (11) 99999-0000", { validation: "phone" })).toBe(true);
    expect(isValidCollectedInput("11 3333-4444", { validation: "phone" })).toBe(true);
    for (const bad of ["123", "meu telefone", "12345678901234567"]) {
      expect(isValidCollectedInput(bad, { validation: "phone" })).toBe(false);
    }
  });
  it("regex", () => {
    expect(isValidCollectedInput("AB-1234", { validation: "regex", regex: "^[A-Z]{2}-\\d{4}$" })).toBe(true);
    expect(isValidCollectedInput("ab1234", { validation: "regex", regex: "^[A-Z]{2}-\\d{4}$" })).toBe(false);
  });
  it("a broken or missing regex rejects instead of accepting everything", () => {
    expect(isValidCollectedInput("x", { validation: "regex", regex: "[" })).toBe(false);
    expect(isValidCollectedInput("x", { validation: "regex" })).toBe(false);
  });
});
