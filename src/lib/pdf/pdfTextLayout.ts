import { layoutMultilineText, type PDFFont, TextAlignment } from '@cantoo/pdf-lib'

export interface PdfTextBounds {
  min: number
  max: number
  multiline?: boolean
}

/** Use the same padding, font metrics and word wrapping as pdf-lib's appearance provider. */
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
  const layout = (size: number) =>
    layoutMultilineText(value, {
      alignment: TextAlignment.Left,
      fontSize: size,
      font,
      bounds: { x: 0, y: 0, width: availableWidth, height: availableHeight },
    })
  for (let size = bounds.max; size >= bounds.min; size -= 0.25) {
    const lines = layout(size).lines
    if (
      lines.every((line) => line.width < availableWidth && line.y >= 0) &&
      (bounds.multiline || lines.length === 1)
    ) {
      return { text: value, fontSize: size, truncated: false }
    }
  }

  const { lines, lineHeight } = layout(bounds.min)
  const capacity = bounds.multiline ? Math.max(1, Math.floor(availableHeight / lineHeight)) : 1
  const shorten = (text: string) => {
    if (font.widthOfTextAtSize(text, bounds.min) < availableWidth) return text
    let prefix = text
    while (prefix && font.widthOfTextAtSize(`${prefix}...`, bounds.min) >= availableWidth) {
      prefix = prefix.slice(0, -1).trimEnd()
    }
    return `${prefix}...`
  }
  const kept = lines.slice(0, capacity).map((line) => shorten(line.text))
  if (lines.length > capacity) kept[kept.length - 1] = shorten(`${kept[kept.length - 1]}...`)
  return { text: kept.join('\n'), fontSize: bounds.min, truncated: true }
}
