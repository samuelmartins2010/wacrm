/**
 * D5 — one keyword rule for automations and flows:
 * - case and accents never matter;
 * - "contains" matches whole words (or a whole phrase of words);
 * - "exact" ignores punctuation and spaces around the text.
 */
export function normalizeKeywordText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function keywordMatches(text: string, keywords: unknown[], matchType: 'contains' | 'exact' | undefined): boolean {
  const t = normalizeKeywordText(text ?? '')
  if (!t) return false
  return keywords.some((raw) => {
    const k = normalizeKeywordText(String(raw ?? ''))
    if (!k) return false
    return matchType === 'exact' ? t === k : ` ${t} `.includes(` ${k} `)
  })
}
