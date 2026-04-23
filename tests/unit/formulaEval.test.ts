import { describe, expect, test } from 'vitest'
import { safeEvalArithmetic } from '@/lib/calculations/formulaEval'

describe('safeEvalArithmetic', () => {
  describe('basic arithmetic', () => {
    test('addition', () => expect(safeEvalArithmetic('1+2')).toBe(3))
    test('subtraction', () => expect(safeEvalArithmetic('10-3')).toBe(7))
    test('multiplication', () => expect(safeEvalArithmetic('4*5')).toBe(20))
    test('division', () => expect(safeEvalArithmetic('10/4')).toBe(2.5))
    test('operator precedence: * before +', () => expect(safeEvalArithmetic('2+3*4')).toBe(14))
    test('parentheses override precedence', () => expect(safeEvalArithmetic('(2+3)*4')).toBe(20))
    test('nested parentheses', () => expect(safeEvalArithmetic('((2+3)*2)+1')).toBe(11))
    test('decimal literals', () => expect(safeEvalArithmetic('1.5+2.5')).toBe(4))
  })

  describe('whitespace handling', () => {
    test('ignores spaces', () => expect(safeEvalArithmetic('2 + 3')).toBe(5))
    test('ignores tabs and mixed whitespace', () => expect(safeEvalArithmetic(' 4 * 5 ')).toBe(20))
  })

  describe('unary negation', () => {
    test('negative literal', () => expect(safeEvalArithmetic('-5')).toBe(-5))
    test('negative in expression', () => expect(safeEvalArithmetic('10 + -3')).toBe(7))
    test('negative in parentheses', () => expect(safeEvalArithmetic('(-5)*2')).toBe(-10))
  })

  describe('math functions', () => {
    test('floor rounds down', () => expect(safeEvalArithmetic('floor(7/2)')).toBe(3))
    test('ceil rounds up', () => expect(safeEvalArithmetic('ceil(7/2)')).toBe(4))
    test('round rounds to nearest', () => expect(safeEvalArithmetic('round(2.5)')).toBe(3))
    test('floor of negative', () => expect(safeEvalArithmetic('floor(-1/2)')).toBe(-1))
    test('floor in larger expression', () => expect(safeEvalArithmetic('floor(5/2)+1')).toBe(3))
    test('nested floor(ceil(...))', () => expect(safeEvalArithmetic('floor(ceil(1.2))')).toBe(2))
    test('multiple functions in one expression', () =>
      expect(safeEvalArithmetic('floor(7/2)+ceil(3/2)')).toBe(5))
  })

  describe('rejection of unsafe input', () => {
    test('rejects alphabetic identifiers', () => {
      expect(() => safeEvalArithmetic('x+1')).toThrow()
    })
    test('rejects JavaScript builtins', () => {
      expect(() => safeEvalArithmetic('alert(1)')).toThrow()
    })
    test('rejects property access', () => {
      expect(() => safeEvalArithmetic('Math.PI')).toThrow()
    })
    test('rejects empty string', () => {
      expect(() => safeEvalArithmetic('')).toThrow()
    })
    test('rejects trailing operators', () => {
      expect(() => safeEvalArithmetic('2+')).toThrow()
    })
    test('rejects unclosed parenthesis', () => {
      expect(() => safeEvalArithmetic('(2+3')).toThrow()
    })
  })

  describe('non-finite results', () => {
    test('throws on division by zero', () => {
      expect(() => safeEvalArithmetic('1/0')).toThrow()
    })
  })
})
