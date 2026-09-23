import type { PDFFont } from '@cantoo/pdf-lib'

export type Official2024FontBounds = { min: number; max: number; multiline?: boolean }

/** Conservative thresholds for warning before visually abbreviated prose is exported. */
export const OFFICIAL_2024_PROSE_WARNING_LIMITS = {
  Text_55: { label: 'Weapon training', maxChars: 200 },
  Text_56: { label: 'Tool training', maxChars: 130 },
  Text_57: { label: 'Class features (left)', maxChars: 850 },
  Text_58: { label: 'Class features (right)', maxChars: 850 },
  Text_59: { label: 'Species traits', maxChars: 700 },
  Text_60: { label: 'Feats', maxChars: 700 },
  Text_88: { label: 'Appearance', maxChars: 220 },
  Text_89: { label: 'Backstory', maxChars: 600 },
  Text_90: { label: 'Equipment', maxChars: 350, maxLines: 18 },
  Text_91: { label: 'Languages', maxChars: 120 },
} as const

/** The official 2024 artwork has much larger printed cells than the overlaid form's defaults. */
export function getOfficial2024FontBounds(name: string): Official2024FontBounds | null {
  const id = Number(/^Text_(\d+)$/.exec(name)?.[1])
  if (!Number.isInteger(id) || id < 1 || id > 230) return null
  if (id === 1) return { min: 8.5, max: 9.5 }
  if (id <= 3) return { min: 8, max: 8.5 }
  if (id <= 5) return { min: 7.5, max: 9 }
  if (id === 7) return { min: 6.5, max: 8.5 } // Six-digit XP in a narrow oval.
  if (id === 8) return { min: 10.5, max: 11.5 } // Armor Class shield.
  if (id === 9) return { min: 9.5, max: 10.5 } // Current Hit Points.
  if (id <= 13) return { min: 8.5, max: 9.5 }
  if (id <= 30) return { min: 9.5, max: 11.5 }
  if (id <= 54) return { min: 7.5, max: 8.5 }
  if (id <= 60) return { min: 7.5, max: 9, multiline: true }
  if (id <= 84) return { min: 7.5, max: 9 }
  if (id <= 87) return { min: 10, max: 12 }
  if (id <= 90) return { min: 7.5, max: 9, multiline: true }
  if (id === 91) return { min: 8, max: 9, multiline: true }
  if (id <= 211) return { min: 7, max: 8.5 }
  if (id <= 214) return { min: 8, max: 9.5 }
  if (id <= 219) return { min: 8.5, max: 10 }
  if (id <= 228) return { min: 8, max: 9.5 }
  return { min: 8, max: 10 }
}

function textWidth(font: PDFFont, value: string, size: number) {
  try {
    return font.widthOfTextAtSize(value, size)
  } catch {
    return value.length * size * 0.55
  }
}

function shortenLine(value: string, font: PDFFont, size: number, width: number) {
  if (textWidth(font, value, size) <= width) return value
  let end = value.length
  while (end > 0 && textWidth(font, `${value.slice(0, end).trimEnd()}...`, size) > width) {
    end -= 1
  }
  return `${value.slice(0, end).trimEnd()}...`
}

function wrapLines(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(font, next, size) <= width) {
        line = next
      } else {
        if (line) lines.push(line)
        line = word
        while (line.length > 1 && textWidth(font, line, size) > width) {
          let end = 1
          while (end < line.length && textWidth(font, line.slice(0, end + 1), size) <= width) {
            end += 1
          }
          lines.push(line.slice(0, end))
          line = line.slice(end)
        }
      }
    }
    lines.push(line)
  }
  return lines
}

/** Fit each AcroForm appearance to its printed cell, retaining a readable floor. */
export function fitOfficial2024Text(
  name: string,
  value: string,
  font: PDFFont,
  width: number,
  height: number,
): { text: string; fontSize: number } | null {
  const bounds = getOfficial2024FontBounds(name)
  if (!bounds || !value) return null
  const availableWidth = Math.max(1, width - 1)
  const availableHeight = Math.max(1, height - 2)
  const id = Number(name.slice(5))
  // These are lists, not paragraphs; spare blank lines otherwise hide later entries.
  const normalized = [57, 58, 59, 60, 88, 89, 90].includes(id)
    ? value.replace(/\n{2,}/g, '\n')
    : value

  for (let size = bounds.max; size >= bounds.min; size -= 0.25) {
    const fontSize = Math.round(size * 100) / 100
    if (!bounds.multiline) {
      if (textWidth(font, normalized, fontSize) <= availableWidth) {
        return { text: normalized, fontSize }
      }
    } else {
      const capacity = Math.max(1, Math.floor(availableHeight / (fontSize * 1.2)))
      if (wrapLines(normalized, font, fontSize, availableWidth).length <= capacity) {
        return { text: normalized, fontSize }
      }
    }
  }

  if (!bounds.multiline) {
    return {
      text: shortenLine(normalized, font, bounds.min, availableWidth),
      fontSize: bounds.min,
    }
  }
  const capacity = Math.max(1, Math.floor(availableHeight / (bounds.min * 1.2)))
  const lines = wrapLines(normalized, font, bounds.min, availableWidth)
  const kept = lines.slice(0, capacity)
  kept[kept.length - 1] = shortenLine(
    `${kept[kept.length - 1]}...`,
    font,
    bounds.min,
    availableWidth,
  )
  return { text: kept.join('\n'), fontSize: bounds.min }
}
