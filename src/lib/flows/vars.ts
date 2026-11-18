/** `{{vars.key}}`, with optional spaces inside the braces (F4). */
export const VAR_PATTERN = /\{\{\s*vars\.([a-zA-Z0-9_]+)\s*\}\}/g;

/** Replace every {{vars.key}} with the run's value; missing → "". */
export function interpolateVars(template: string | undefined, vars: Record<string, unknown>): string {
  if (!template) return "";
  return template.replace(VAR_PATTERN, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Variable keys referenced in a text. */
export function referencedVars(text: string | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(VAR_PATTERN), (m) => m[1]);
}
