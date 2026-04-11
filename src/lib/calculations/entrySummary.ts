import { renderEntry } from '@/lib/renderer'

interface SummaryEntity {
  entries?: unknown[]
  fluffEntries?: unknown[]
  fluff?: {
    entries?: unknown[]
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractStrings(value: unknown, output: string[], depth = 0): void {
  if (depth > 4 || value == null) return

  if (typeof value === 'string') {
    const rendered = stripHtml(renderEntry(value))
    if (rendered.length > 0) output.push(rendered)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractStrings(item, output, depth + 1)
      if (output.length >= 20) return
    }
    return
  }

  if (typeof value === 'object') {
    const entry = value as {
      entries?: unknown[]
      entry?: unknown
      items?: unknown[]
    }

    if (entry.entries) extractStrings(entry.entries, output, depth + 1)
    if (entry.entry) extractStrings(entry.entry, output, depth + 1)
    if (entry.items) extractStrings(entry.items, output, depth + 1)
  }
}

function truncateSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const sentenceEnd = text.search(/[.!?](\s|$)/)
  if (sentenceEnd > 0 && sentenceEnd <= maxLength) {
    return text.slice(0, sentenceEnd + 1).trim()
  }
  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxLength).trim()}...`
}

export function getEntitySummary(
  entity: SummaryEntity | undefined,
  maxLength = 220,
): string | null {
  if (!entity) return null

  const primary: string[] = []
  extractStrings(entity.entries, primary)

  const primaryBest = primary.find((s) => s.length >= 40) ?? primary[0]
  if (primaryBest) return truncateSummary(primaryBest, maxLength)

  const fluff: string[] = []
  extractStrings(entity.fluffEntries, fluff)
  extractStrings(entity.fluff?.entries, fluff)
  const fluffBest = fluff.find((s) => s.length >= 40) ?? fluff[0]

  return fluffBest ? truncateSummary(fluffBest, maxLength) : null
}

export function getClassSummary(
  entity: SummaryEntity | undefined,
  maxLength = 1000,
): string | null {
  if (!entity) return null

  const fluff: string[] = []
  extractStrings(entity.fluffEntries, fluff)
  extractStrings(entity.fluff?.entries, fluff)
  const fluffBest = fluff.find((s) => s.length >= 40) ?? fluff[0]
  if (fluffBest) return truncateSummary(fluffBest, maxLength)

  return getEntitySummary(entity, maxLength)
}

export function getRaceSummary(entity: SummaryEntity | undefined, maxLength = 1000): string | null {
  if (!entity) return null

  const fluff: string[] = []
  extractStrings(entity.fluffEntries, fluff)
  extractStrings(entity.fluff?.entries, fluff)
  const fluffBest = fluff.find((s) => s.length >= 40) ?? fluff[0]
  if (fluffBest) return truncateSummary(fluffBest, maxLength)

  return getEntitySummary(entity, maxLength)
}
