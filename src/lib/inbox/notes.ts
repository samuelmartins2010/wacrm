/**
 * Regras das notas internas (e da observação da transferência), iguais às
 * do banco (migration 058): até 2.000 caracteres e pelo menos um caractere
 * visível — espaço, quebra de linha e caracteres invisíveis não contam.
 */
export const NOTE_MAX_LENGTH = 2000

// Mesmo conjunto de _note_has_text: espaços Unicode, zero-width e BOM
// (por código, para não depender de escapes no fonte).
const INVISIBLE_RANGES: [number, number][] = [
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200d],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x2060],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
]

function isInvisible(ch: string): boolean {
  if (/\s/.test(ch)) return true
  const cp = ch.codePointAt(0) ?? 0
  return INVISIBLE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)
}

export function hasVisibleText(text: string): boolean {
  for (const ch of text) if (!isInvisible(ch)) return true
  return false
}

/** Texto aparado para enviar ao banco, ou null quando não há texto visível. */
export function normalizeNote(text: string): string | null {
  return hasVisibleText(text) ? text.trim() : null
}
