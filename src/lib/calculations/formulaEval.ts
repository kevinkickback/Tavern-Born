/**
 * Evaluate a simple arithmetic expression containing only numbers, +, -, *, /,
 * parentheses, and the functions floor/ceil/round.
 */
export function safeEvalArithmetic(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '')
  const withoutFns = cleaned.replace(/floor|ceil|round/g, '')

  if (!/^[\d.+\-*/()]+$/.test(withoutFns)) {
    throw new Error(`Rejected non-arithmetic expression: ${expr}`)
  }

  let pos = 0

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < cleaned.length && (cleaned[pos] === '+' || cleaned[pos] === '-')) {
      const op = cleaned[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < cleaned.length && (cleaned[pos] === '*' || cleaned[pos] === '/')) {
      const op = cleaned[pos++]
      const right = parseFactor()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function parseFactor(): number {
    for (const fn of ['floor', 'ceil', 'round'] as const) {
      if (cleaned.startsWith(fn, pos)) {
        pos += fn.length
        if (cleaned[pos] !== '(') throw new Error(`Expected '(' after ${fn}`)
        pos++
        const inner = parseExpr()
        if (cleaned[pos] !== ')') throw new Error(`Expected ')' after ${fn}(...)`)
        pos++
        return Math[fn](inner)
      }
    }

    if (cleaned[pos] === '(') {
      pos++
      const val = parseExpr()
      if (cleaned[pos] !== ')') throw new Error("Expected closing ')'")
      pos++
      return val
    }

    if (cleaned[pos] === '-') {
      pos++
      return -parseFactor()
    }

    const start = pos
    while (pos < cleaned.length && /[\d.]/.test(cleaned[pos])) pos++
    if (pos === start) {
      throw new Error(`Unexpected token at position ${pos}: '${cleaned[pos]}'`)
    }
    return Number.parseFloat(cleaned.slice(start, pos))
  }

  const result = parseExpr()
  if (pos !== cleaned.length) {
    throw new Error(`Unexpected trailing input: '${cleaned.slice(pos)}'`)
  }
  return result
}
