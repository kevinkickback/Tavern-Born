import { renderEntry } from '@/lib/renderer'
import type { Spell5e } from '@/types/5etools'

export interface TooltipEntityLike {
  name?: string
  source?: string
  page?: number
  entries?: unknown[]
}

export interface RecursiveReference {
  kind: string
  name: string
  source?: string
}

export interface RecursiveTooltipData {
  title: string
  subtitle?: string
  html?: string
}

export interface RecursiveHintState extends RecursiveTooltipData {
  x: number
  y: number
}

export interface RecursiveLookup {
  spells: Map<string, Spell5e>
  items: Map<string, TooltipEntityLike>
  feats: Map<string, TooltipEntityLike>
  races: Map<string, TooltipEntityLike>
  classes: Map<string, TooltipEntityLike>
  backgrounds: Map<string, TooltipEntityLike>
  optionalfeatures: Map<string, TooltipEntityLike>
  actions: Map<string, TooltipEntityLike>
  conditions: Map<string, TooltipEntityLike>
  deities: Map<string, TooltipEntityLike>
  skills: Map<string, TooltipEntityLike>
  senses: Map<string, TooltipEntityLike>
  variantrules: Map<string, TooltipEntityLike>
  languages: Map<string, TooltipEntityLike>
}

export function getEntityKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`.toLowerCase()
}

export function buildNameMap<T extends TooltipEntityLike>(items: T[] = []): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    const name = item?.name?.trim()
    if (!name) continue

    const source = item.source?.trim()
    const withSource = getEntityKey(name, source)
    if (!map.has(withSource)) {
      map.set(withSource, item)
    }

    const withoutSource = getEntityKey(name)
    if (!map.has(withoutSource)) {
      map.set(withoutSource, item)
    }
  }
  return map
}

export function parseRecursiveReference(
  rawTitle: string,
  fallbackName: string,
  hoverType?: string,
  hoverName?: string,
  hoverSource?: string,
): RecursiveReference {
  if (hoverName?.trim()) {
    return {
      kind: hoverType?.trim().toLowerCase() || 'note',
      name: hoverName.trim(),
      source: hoverSource?.trim() || undefined,
    }
  }

  const match = /^([^:]+):\s*(.+)$/.exec(rawTitle)
  if (!match) {
    return {
      kind: 'note',
      name: fallbackName.trim() || rawTitle.trim(),
    }
  }

  return {
    kind: match[1].trim().toLowerCase(),
    name: match[2].trim(),
  }
}

export function normalizeKind(kind: string): string {
  const normalized = kind.trim().toLowerCase()
  const aliases: Record<string, string> = {
    condition: 'conditions',
    status: 'conditions',
    action: 'actions',
    deity: 'deities',
    skill: 'skills',
    sense: 'senses',
    variantrule: 'variantrules',
    language: 'languages',
    item: 'items',
    feat: 'feats',
    race: 'races',
    class: 'classes',
    background: 'backgrounds',
    optionalfeature: 'optionalfeatures',
    optfeature: 'optionalfeatures',
  }
  return aliases[normalized] ?? normalized
}

export function getPreviewHtml(
  entries: unknown[] | undefined,
  formatSpellInfo?: (entry: unknown) => string,
): string | undefined {
  if (!entries?.length) return undefined
  const formatter = formatSpellInfo || ((entry: unknown) => getEntryWithHoverTitles(entry))
  return entries.slice(0, 2).map(formatter).join('')
}

export function getRecursiveTooltipData(
  reference: RecursiveReference,
  lookup: RecursiveLookup,
  rawTitle: string,
  formatSpellLevel?: (level: number) => string,
  getSchoolName?: (school: string) => string,
): RecursiveTooltipData {
  const simpleFallback: RecursiveTooltipData = {
    title: reference.name,
    subtitle: rawTitle,
  }

  if (!reference.name) return simpleFallback

  if (normalizeKind(reference.kind) === 'spell') {
    const spell =
      lookup.spells.get(getEntityKey(reference.name, reference.source)) ??
      lookup.spells.get(getEntityKey(reference.name))
    if (!spell) return simpleFallback

    const levelStr = formatSpellLevel ? formatSpellLevel(spell.level) : `Level ${spell.level}`
    const schoolStr = getSchoolName ? getSchoolName(spell.school) : spell.school

    return {
      title: spell.name,
      subtitle: `${levelStr} ${schoolStr}${spell.source ? ` • ${spell.source}` : ''}`,
      html: getPreviewHtml(spell.entries),
    }
  }

  const mapByKind: Record<string, Map<string, TooltipEntityLike> | undefined> = {
    items: lookup.items,
    feats: lookup.feats,
    races: lookup.races,
    classes: lookup.classes,
    backgrounds: lookup.backgrounds,
    optionalfeatures: lookup.optionalfeatures,
    actions: lookup.actions,
    conditions: lookup.conditions,
    deities: lookup.deities,
    skills: lookup.skills,
    senses: lookup.senses,
    variantrules: lookup.variantrules,
    languages: lookup.languages,
  }

  const normalizedKind = normalizeKind(reference.kind)
  const entityMap = mapByKind[normalizedKind]
  const entity =
    entityMap?.get(getEntityKey(reference.name, reference.source)) ??
    entityMap?.get(getEntityKey(reference.name))
  if (!entity) return simpleFallback

  return {
    title: entity.name ?? reference.name,
    subtitle: `${normalizedKind.charAt(0).toUpperCase()}${normalizedKind.slice(1)}${entity.source ? ` • ${entity.source}` : ''}${entity.page ? ` p. ${entity.page}` : ''}`,
    html: getPreviewHtml(entity.entries),
  }
}

export function getRecursiveHintPosition(
  target: HTMLElement,
  hasBody: boolean,
): {
  x: number
  y: number
} {
  // Get viewport-relative coordinates of the hovered element
  const rect = target.getBoundingClientRect()

  // Find the TooltipContent container (nearest positioned ancestor)
  let container = target.offsetParent as HTMLElement | null
  while (container && !container.classList.contains('[&_p]:my-0.5')) {
    container = container.offsetParent as HTMLElement | null
  }

  // If we can't find the container, look for any data-* attributes or class patterns
  if (!container) {
    container = target.closest('[role="tooltip"]') as HTMLElement | null
  }
  if (!container) {
    container = target.closest('div[class*="shadow-xl"]') as HTMLElement | null
  }

  // Get the container's viewport-relative position
  const containerRect = container?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }

  // Convert element coordinates to be relative to container
  const elementRelX = rect.left - containerRect.left
  const elementRelY = rect.top - containerRect.top

  const tooltipWidthEstimate = 300
  const tooltipHeightEstimate = hasBody ? 220 : 88
  const gap = 8

  // Position to the right of the hovered text, or left if no space
  const containerWidth = containerRect.right - containerRect.left
  const rightCandidate = rect.right - containerRect.left + gap
  const leftCandidate = elementRelX - tooltipWidthEstimate - gap

  let x = rightCandidate
  if (rightCandidate + tooltipWidthEstimate > containerWidth && leftCandidate >= 0) {
    x = leftCandidate
  } else if (rightCandidate + tooltipWidthEstimate > containerWidth) {
    x = Math.max(0, containerWidth - tooltipWidthEstimate - 4)
  }

  // Position below or above the hovered text
  const centeredY = elementRelY + rect.height / 2 - tooltipHeightEstimate / 2
  const preferredDown = rect.bottom - containerRect.top + gap
  const preferredUp = elementRelY - tooltipHeightEstimate - gap
  const containerHeight = containerRect.bottom - containerRect.top

  const y = Math.max(
    0,
    Math.min(
      centeredY,
      preferredDown + tooltipHeightEstimate <= containerHeight ? preferredDown : preferredUp,
    ),
  )

  return { x, y }
}

// Local helper for transforming entry HTML with recursive title tracking
export function getEntryWithHoverTitles(entry: unknown): string {
  const html = renderEntry(entry) ?? ''
  return html
    .replace(
      /\stitle="([^"]+)"((?:\sdata-hover-type="[^"]*")?)(?:\sdata-hover-name="([^"]*)")?((?:\sdata-hover-source="[^"]*")?)/g,
      (_match, title, maybeType = '', hoverName = '', maybeSource = '') =>
        ` title="${title}" data-recursive-title="${title}"${maybeType}${hoverName ? ` data-hover-name="${hoverName}"` : ''}${maybeSource}`,
    )
    .replace(/\scursor-help/g, ' cursor-help underline decoration-dotted underline-offset-2')
}
