// ============================================================
// CPF/CNPJ validation and normalization.
//
// Why a real checksum and not just a digit-count check
//   A required field that only checks "11 or 14 digits" would
//   happily accept "00000000000" or "11111111111" as valid — both
//   pass length but are not real documents. That defeats the
//   point of making the field required. The checksum below is the
//   standard Receita Federal algorithm for both CPF and CNPJ.
// ============================================================

export type DocumentType = 'cpf' | 'cnpj'

/** Strip everything but digits. */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '')
}

function isAllSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits)
}

export function isValidCPF(value: string): boolean {
  const cpf = normalizeDocument(value)
  if (cpf.length !== 11 || isAllSameDigit(cpf)) return false

  const nums = cpf.split('').map(Number)

  let sum = 0
  for (let i = 0; i < 9; i++) sum += nums[i] * (10 - i)
  let rem = sum % 11
  const dv1 = rem < 2 ? 0 : 11 - rem
  if (dv1 !== nums[9]) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += nums[i] * (11 - i)
  rem = sum % 11
  const dv2 = rem < 2 ? 0 : 11 - rem
  if (dv2 !== nums[10]) return false

  return true
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = normalizeDocument(value)
  if (cnpj.length !== 14 || isAllSameDigit(cnpj)) return false

  const nums = cnpj.split('').map(Number)
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  let sum = w1.reduce((acc, w, i) => acc + w * nums[i], 0)
  let rem = sum % 11
  const dv1 = rem < 2 ? 0 : 11 - rem
  if (dv1 !== nums[12]) return false

  sum = w2.reduce((acc, w, i) => acc + w * nums[i], 0)
  rem = sum % 11
  const dv2 = rem < 2 ? 0 : 11 - rem
  if (dv2 !== nums[13]) return false

  return true
}

/**
 * Validates a document of unknown type (auto-detects CPF vs CNPJ
 * by digit count). Returns the type on success, null on failure —
 * failure includes "wrong length" as well as "right length, wrong
 * checksum".
 */
export function validateDocument(value: string): DocumentType | null {
  const digits = normalizeDocument(value)
  if (digits.length === 11) return isValidCPF(digits) ? 'cpf' : null
  if (digits.length === 14) return isValidCNPJ(digits) ? 'cnpj' : null
  return null
}

/** Format digits-only document for display: CPF as 000.000.000-00, CNPJ as 00.000.000/0000-00. */
export function formatDocument(digits: string): string {
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return digits
}
