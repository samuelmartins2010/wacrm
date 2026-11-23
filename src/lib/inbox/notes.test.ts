import { describe, expect, it } from 'vitest'
import { NOTE_MAX_LENGTH, hasVisibleText, normalizeNote } from './notes'

// Mesma regra do banco (058, _note_has_text + btrim): a tela não deixa
// salvar o que o banco recusaria.
describe('notas internas', () => {
  it('limite de 2.000 caracteres', () => {
    expect(NOTE_MAX_LENGTH).toBe(2000)
  })

  it('só espaço, quebra de linha ou caractere invisível não conta como texto', () => {
    expect(hasVisibleText('')).toBe(false)
    expect(hasVisibleText('  \n\t ')).toBe(false)
    expect(hasVisibleText(' 　​﻿')).toBe(false)
    expect(hasVisibleText(' ok ')).toBe(true)
  })

  it('normalizeNote apara as pontas e devolve null sem texto visível', () => {
    expect(normalizeNote('  ligar amanhã \n')).toBe('ligar amanhã')
    expect(normalizeNote(' ​ ')).toBe(null)
  })
})
