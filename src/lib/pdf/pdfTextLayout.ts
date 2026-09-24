import type { PDFFont } from '@cantoo/pdf-lib'

export interface PdfTextBounds {
  min: number
  max: number
  multiline?: boolean
}

/** Match PDF word boundaries using a binary search, avoiding quadratic paragraph scanning. */
function wrapPdfText(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
  maxLines = Infinity,
): string[] {
  const lines: string[] = []
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) {
      lines.push('')
      if (lines.length >= maxLines) return lines
      continue
    }
    const ends = [...paragraph.matchAll(/\s+/g)].map((match) => match.index)
    ends.push(paragraph.length)
    let start = 0
    let first = 0
    while (start < paragraph.length) {
      while (ends[first] <= start) first++
      let low = first
      let high = ends.length - 1
      let best = -1
      while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        if (font.widthOfTextAtSize(paragraph.slice(start, ends[middle]), size) < width) {
          best = middle
          low = middle + 1
        } else high = middle - 1
      }
      const end = ends[best < 0 ? first : best]
      lines.push(paragraph.slice(start, end))
      if (lines.length >= maxLines) return lines
      start = end
      while (start < paragraph.length && /\s/.test(paragraph[start])) start++
    }
  }
  return lines
}

/** Use the appearance provider's padding, font metrics, wrapping and line height. */
export function fitPdfText(
  value: string,
  font: PDFFont,
  width: number,
  height: number,
  bounds: PdfTextBounds,
  borderWidth = 0,
): { text: string; fontSize: number; truncated: boolean } {
  const availableWidth = Math.max(1, width - 2 * (borderWidth + 1))
  const availableHeight = Math.max(1, height - 2 * (borderWidth + 1))
  const capacityAt = (size: number) =>
    bounds.multiline
      ? Math.max(0, Math.floor(availableHeight / (font.heightAtSize(size) * 1.2)))
      : 1
  for (let size = bounds.max; size >= bounds.min; size -= 0.25) {
    if (!bounds.multiline) {
      const text = value.replace(/[\r\n]+/g, ' ')
      if (
        font.widthOfTextAtSize(text, size) < availableWidth &&
        font.heightAtSize(size, { descender: false }) <= availableHeight
      )
        return { text, fontSize: size, truncated: false }
      continue
    }
    const capacity = capacityAt(size)
    const lines = wrapPdfText(value, font, size, availableWidth, capacity + 1)
    if (
      lines.length <= capacity &&
      lines.every((line) => font.widthOfTextAtSize(line, size) < availableWidth)
    ) {
      // Pre-wrap long paragraphs so appearance generation does not repeat an expensive scan.
      return {
        text: value.length > 1000 ? lines.join('\n') : value,
        fontSize: size,
        truncated: false,
      }
    }
  }
  const capacity = Math.max(1, capacityAt(bounds.min))
  const lines = wrapPdfText(value, font, bounds.min, availableWidth, capacity + 1)
  const shorten = (text: string, force = false) => {
    if (!force && font.widthOfTextAtSize(text, bounds.min) < availableWidth) return text
    let low = 0
    let high = text.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (
        font.widthOfTextAtSize(`${text.slice(0, middle).trimEnd()}...`, bounds.min) < availableWidth
      )
        low = middle
      else high = middle - 1
    }
    return `${text.slice(0, low).trimEnd()}...`
  }
  const kept = lines
    .slice(0, capacity)
    .map((line, index) => shorten(line, index === capacity - 1 && lines.length > capacity))
  return { text: kept.join('\n'), fontSize: bounds.min, truncated: true }
}
