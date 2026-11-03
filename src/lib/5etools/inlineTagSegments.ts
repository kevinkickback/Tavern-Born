/** Narrow adaptation of Renderer.splitByTags/_splitByPipeBase from 5etools
 * b9061583536101068b3a59d27e886d1fa664e366, js/render.js. Preserve nesting and
 * escaped pipes while retaining offsets; this does not render or execute tags. */
export function splitInlineTagFields(text: string): string[] {
  const fields: string[] = []
  let depth = 0,
    current = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '{' && ['@', '='].includes(text[index + 1])) depth++
    else if (char === '}' && depth) depth--
    if (char === '|' && depth === 0 && text[index - 1] !== '\\') {
      fields.push(current)
      current = ''
    } else current += char
  }
  if (current) fields.push(current)
  return fields
}

interface InlineSegment {
  text: string
  start: number
  end: number
  tag?: { name: string; fields: string[] }
  malformed?: boolean
}
export function splitInlineTagSegments(text: string): InlineSegment[] {
  const result: InlineSegment[] = []
  let depth = 0,
    start = 0
  const append = (end: number, isTag = false, malformed = false) => {
    if (end <= start) return
    const value = text.slice(start, end)
    const match = isTag && !malformed ? /^\{@([^\s}]+)\s+([\s\S]*)}$/.exec(value) : null
    result.push({
      text: value,
      start,
      end,
      ...(match ? { tag: { name: match[1], fields: splitInlineTagFields(match[2]) } } : {}),
      ...(malformed || (isTag && !match) ? { malformed: true } : {}),
    })
    start = end
  }
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '{' && ['@', '='].includes(text[index + 1])) {
      if (!depth) append(index)
      depth++
    } else if (text[index] === '}' && depth && --depth === 0) append(index + 1, true)
  }
  append(text.length, depth > 0, depth > 0)
  return result
}
