import { describe, expect, test } from 'vitest'
import { safeEvalArithmetic } from '@/lib/calculations/formulaEval'

describe('safeEvalArithmetic', () => {
  test.each([
    ['1+2', 3],
    ['10-3', 7],
    ['4*5', 20],
    ['10/4', 2.5],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['((2+3)*2)+1', 11],
    ['1.5+2.5', 4],
    ['2 + 3', 5],
    [' 4 * 5 ', 20],
    ['-5', -5],
    ['10 + -3', 7],
    ['(-5)*2', -10],
    ['floor(7/2)', 3],
    ['ceil(7/2)', 4],
    ['round(2.5)', 3],
    ['floor(-1/2)', -1],
    ['floor(5/2)+1', 3],
    ['floor(ceil(1.2))', 2],
    ['floor(7/2)+ceil(3/2)', 5],
  ])('evaluates %s as %s', (expression, expected) => {
    expect(safeEvalArithmetic(expression)).toBe(expected)
  })

  test.each([
    'x+1',
    'alert(1)',
    'Math.PI',
    '',
    '2+',
    '(2+3',
    '1/0',
  ])('rejects unsafe or invalid expression %j', (expression) => {
    expect(() => safeEvalArithmetic(expression)).toThrow()
  })
})
