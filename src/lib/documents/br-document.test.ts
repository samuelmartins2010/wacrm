import { describe, it, expect } from 'vitest'
import {
  isValidCPF,
  isValidCNPJ,
  validateDocument,
  normalizeDocument,
  formatDocument,
} from './br-document'

describe('normalizeDocument', () => {
  it('strips punctuation, keeping only digits', () => {
    expect(normalizeDocument('529.982.247-25')).toBe('52998224725')
    expect(normalizeDocument('11.222.333/0001-81')).toBe('11222333000181')
  })
})

describe('isValidCPF', () => {
  it('accepts a real valid CPF (with or without punctuation)', () => {
    expect(isValidCPF('52998224725')).toBe(true)
    expect(isValidCPF('529.982.247-25')).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidCPF('123')).toBe(false)
  })

  it('rejects all-same-digit sequences', () => {
    expect(isValidCPF('11111111111')).toBe(false)
    expect(isValidCPF('00000000000')).toBe(false)
  })

  it('rejects a valid-length number with a bad check digit', () => {
    expect(isValidCPF('52998224700')).toBe(false)
  })
})

describe('isValidCNPJ', () => {
  it('accepts a real valid CNPJ (with or without punctuation)', () => {
    expect(isValidCNPJ('11222333000181')).toBe(true)
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidCNPJ('123')).toBe(false)
  })

  it('rejects all-same-digit sequences', () => {
    expect(isValidCNPJ('11111111111111')).toBe(false)
  })

  it('rejects a valid-length number with a bad check digit', () => {
    expect(isValidCNPJ('11222333000199')).toBe(false)
  })
})

describe('validateDocument', () => {
  it('detects and validates CPF', () => {
    expect(validateDocument('52998224725')).toBe('cpf')
  })

  it('detects and validates CNPJ', () => {
    expect(validateDocument('11222333000181')).toBe('cnpj')
  })

  it('returns null for invalid documents of either length', () => {
    expect(validateDocument('11111111111')).toBeNull()
    expect(validateDocument('11111111111111')).toBeNull()
  })

  it('returns null for a length that is neither 11 nor 14', () => {
    expect(validateDocument('123456')).toBeNull()
  })
})

describe('formatDocument', () => {
  it('formats an 11-digit CPF', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25')
  })

  it('formats a 14-digit CNPJ', () => {
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81')
  })
})
