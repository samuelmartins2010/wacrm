import type { CollectInputNodeConfig } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * D9: does a collect_input answer satisfy the node's validation?
 * - any / unset: any non-empty text
 * - email: one @, a dot in the domain, no spaces
 * - phone: 10–15 digits once formatting (+, spaces, (), -, .) is removed
 * - regex: must match; a missing or broken pattern rejects (the
 *   validator blocks those at save time, so this is only defensive)
 */
export function isValidCollectedInput(
  value: string,
  cfg: Pick<CollectInputNodeConfig, "validation" | "regex">,
): boolean {
  const v = value.trim();
  if (!v) return false;
  switch (cfg.validation) {
    case "email":
      return EMAIL.test(v);
    case "phone": {
      if (/[^\d\s+().-]/.test(v)) return false;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15;
    }
    case "regex": {
      if (!cfg.regex) return false;
      try {
        return new RegExp(cfg.regex).test(v);
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
}

/** Save-time check for a regex pattern: null when valid, else the reason. */
export function regexProblem(pattern: string | undefined): "missing" | "invalid" | null {
  if (!pattern || !pattern.trim()) return "missing";
  try {
    new RegExp(pattern);
    return null;
  } catch {
    return "invalid";
  }
}
