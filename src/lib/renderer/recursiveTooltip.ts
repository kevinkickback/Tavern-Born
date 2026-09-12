import { renderEntry } from '@/lib/renderer'
import type { Spell5e } from '@/types/5etools'

export interface TooltipEntityLike {
  name?: string
  shortName?: string
  source?: string
  page?: number
  entries?: unknown[]
  className?: string
  classSource?: string
  subclassShortName?: string
  subclassSource?: string
}

export interface RecursiveReference {
  kind: string
  name: string
  source?: string
  className?: string
  classSource?: string
  subclassName?: string
  subclassSource?: string
}

export interface RecursiveTooltipData {
  title: string
  subtitle?: string
  html?: string
}

export interface RecursiveHintState extends RecursiveTooltipData {
  x: number
  y: number
  triggerElement: HTMLElement
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
  trapHazards: Map<string, TooltipEntityLike>
  rewards: Map<string, TooltipEntityLike>
  classFeatures: Map<string, TooltipEntityLike>
  subclasses: Map<string, TooltipEntityLike>
  subclassFeatures: Map<string, TooltipEntityLike>
}

export interface RecursiveTooltipCollections {
  spells?: readonly unknown[]
  items?: readonly unknown[]
  itemsBase?: readonly unknown[]
  feats?: readonly unknown[]
  races?: readonly unknown[]
  classes?: readonly unknown[]
  backgrounds?: readonly unknown[]
  optionalfeatures?: readonly unknown[]
  actions?: readonly unknown[]
  conditions?: readonly unknown[]
  deities?: readonly unknown[]
  skills?: readonly unknown[]
  senses?: readonly unknown[]
  variantrules?: readonly unknown[]
  languages?: readonly unknown[]
  trapHazards?: readonly unknown[]
  rewards?: readonly unknown[]
  classFeatures?: readonly unknown[]
}

export function getEntityKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`.toLowerCase()
}

export function resolveRecursiveEntity<T>(
  entities: Map<string, T>,
  name: string,
  source?: string,
): T | undefined {
  return entities.get(getEntityKey(name, source))
}

function getClassScopedKey(
  name: string,
  source?: string,
  className?: string,
  classSource?: string,
): string {
  return `${getEntityKey(name, source)}|${className ?? ''}|${classSource ?? ''}`.toLowerCase()
}

function getSubclassScopedKey(
  name: string,
  source?: string,
  className?: string,
  classSource?: string,
  subclassName?: string,
  subclassSource?: string,
): string {
  return `${getClassScopedKey(name, source, className, classSource)}|${subclassName ?? ''}|${subclassSource ?? ''}`.toLowerCase()
}

function buildNameMap<T extends TooltipEntityLike>(items: readonly T[] = []): Map<string, T> {
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

function asTooltipEntities(collection: readonly unknown[] | undefined): TooltipEntityLike[] {
  return (collection ?? []).filter(
    (entity): entity is TooltipEntityLike => typeof entity === 'object' && entity !== null,
  )
}

function buildScopedFeatureMap(
  items: readonly TooltipEntityLike[],
  includeSubclass: boolean,
): Map<string, TooltipEntityLike> {
  const map = buildNameMap(items)
  for (const item of items) {
    if (!item.name) continue
    const key = includeSubclass
      ? getSubclassScopedKey(
          item.name,
          item.source,
          item.className,
          item.classSource,
          item.subclassShortName,
          item.subclassSource,
        )
      : getClassScopedKey(item.name, item.source, item.className, item.classSource)
    if (!map.has(key)) map.set(key, item)
  }
  return map
}

function buildSubclassMap(items: readonly TooltipEntityLike[]): Map<string, TooltipEntityLike> {
  const map = buildScopedFeatureMap(items, false)
  for (const item of items) {
    const shortName = item.shortName?.trim()
    if (!shortName || shortName === item.name) continue

    const sourceKey = getEntityKey(shortName, item.source)
    if (!map.has(sourceKey)) map.set(sourceKey, item)

    const nameKey = getEntityKey(shortName)
    if (!map.has(nameKey)) map.set(nameKey, item)

    const scopedKey = getClassScopedKey(shortName, item.source, item.className, item.classSource)
    if (!map.has(scopedKey)) map.set(scopedKey, item)
  }
  return map
}

function getNestedClassEntities(classes: readonly TooltipEntityLike[]): {
  subclasses: TooltipEntityLike[]
  subclassFeatures: TooltipEntityLike[]
} {
  const subclasses: TooltipEntityLike[] = []
  const subclassFeatures: TooltipEntityLike[] = []

  for (const classEntity of classes) {
    const nested = (classEntity as { subclasses?: unknown[] }).subclasses
    if (!Array.isArray(nested)) continue

    for (const value of nested) {
      if (!value || typeof value !== 'object') continue
      const subclass = value as TooltipEntityLike & {
        shortName?: string
        levelFeatures?: Array<{ features?: unknown[] }>
        subclassFeatures?: unknown[]
      }
      const normalizedSubclass: TooltipEntityLike = {
        ...subclass,
        className: subclass.className ?? classEntity.name,
        classSource: subclass.classSource ?? classEntity.source,
      }
      subclasses.push(normalizedSubclass)

      const candidates = [
        ...(subclass.subclassFeatures ?? []),
        ...(subclass.levelFeatures ?? []).flatMap((group) => group.features ?? []),
      ]
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue
        const feature = candidate as TooltipEntityLike
        subclassFeatures.push({
          ...feature,
          className: feature.className ?? normalizedSubclass.className,
          classSource: feature.classSource ?? normalizedSubclass.classSource,
          subclassShortName:
            feature.subclassShortName ?? subclass.shortName ?? normalizedSubclass.name,
          subclassSource: feature.subclassSource ?? normalizedSubclass.source,
        })
      }
    }
  }

  return { subclasses, subclassFeatures }
}

export function buildRecursiveLookup(collections: RecursiveTooltipCollections): RecursiveLookup {
  const classes = asTooltipEntities(collections.classes)
  const nestedClassEntities = getNestedClassEntities(classes)
  return {
    spells: buildNameMap(asTooltipEntities(collections.spells) as Spell5e[]),
    items: buildNameMap([
      ...asTooltipEntities(collections.items),
      ...asTooltipEntities(collections.itemsBase),
    ]),
    feats: buildNameMap(asTooltipEntities(collections.feats)),
    races: buildNameMap(asTooltipEntities(collections.races)),
    classes: buildNameMap(classes),
    backgrounds: buildNameMap(asTooltipEntities(collections.backgrounds)),
    optionalfeatures: buildNameMap(asTooltipEntities(collections.optionalfeatures)),
    actions: buildNameMap(asTooltipEntities(collections.actions)),
    conditions: buildNameMap(asTooltipEntities(collections.conditions)),
    deities: buildNameMap(asTooltipEntities(collections.deities)),
    skills: buildNameMap(asTooltipEntities(collections.skills)),
    senses: buildNameMap(asTooltipEntities(collections.senses)),
    variantrules: buildNameMap(asTooltipEntities(collections.variantrules)),
    languages: buildNameMap(asTooltipEntities(collections.languages)),
    trapHazards: buildNameMap(asTooltipEntities(collections.trapHazards)),
    rewards: buildNameMap(asTooltipEntities(collections.rewards)),
    classFeatures: buildScopedFeatureMap(asTooltipEntities(collections.classFeatures), false),
    subclasses: buildSubclassMap(nestedClassEntities.subclasses),
    subclassFeatures: buildScopedFeatureMap(nestedClassEntities.subclassFeatures, true),
  }
}

export function parseRecursiveReference(
  rawTitle: string,
  fallbackName: string,
  hoverType?: string,
  hoverName?: string,
  hoverSource?: string,
  hoverClassName?: string,
  hoverClassSource?: string,
  hoverSubclassName?: string,
  hoverSubclassSource?: string,
): RecursiveReference {
  if (hoverName?.trim()) {
    return {
      kind: hoverType?.trim().toLowerCase() || 'note',
      name: hoverName.trim(),
      source: hoverSource?.trim() || undefined,
      className: hoverClassName?.trim() || undefined,
      classSource: hoverClassSource?.trim() || undefined,
      subclassName: hoverSubclassName?.trim() || undefined,
      subclassSource: hoverSubclassSource?.trim() || undefined,
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
    trap: 'trapHazards',
    hazard: 'trapHazards',
    reward: 'rewards',
    classfeature: 'classFeatures',
    subclass: 'subclasses',
    subclassfeature: 'subclassFeatures',
  }
  return aliases[normalized] ?? normalized
}

function getPreviewHtml(
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
    const spell = resolveRecursiveEntity(lookup.spells, reference.name, reference.source)
    if (!spell) return simpleFallback

    const levelStr = formatSpellLevel ? formatSpellLevel(spell.level) : `Level ${spell.level}`
    const schoolStr = getSchoolName ? getSchoolName(spell.school) : spell.school

    return {
      title: spell.name,
      subtitle: `${levelStr} ${schoolStr}${spell.source ? ` • ${spell.source}` : ''}`,
      html: getPreviewHtml(spell.entries),
    }
  }

  const normalizedKind = normalizeKind(reference.kind)
  if (
    normalizedKind === 'classFeatures' ||
    normalizedKind === 'subclasses' ||
    normalizedKind === 'subclassFeatures'
  ) {
    const entityMap = lookup[normalizedKind]
    const scopedKey =
      normalizedKind === 'subclassFeatures'
        ? getSubclassScopedKey(
            reference.name,
            reference.source,
            reference.className,
            reference.classSource,
            reference.subclassName,
            reference.subclassSource,
          )
        : getClassScopedKey(
            reference.name,
            reference.source,
            reference.className,
            reference.classSource,
          )
    const entity =
      entityMap.get(scopedKey) ??
      resolveRecursiveEntity(entityMap, reference.name, reference.source)
    if (!entity) return simpleFallback

    const label =
      normalizedKind === 'classFeatures'
        ? 'Class Feature'
        : normalizedKind === 'subclassFeatures'
          ? 'Subclass Feature'
          : 'Subclass'
    return {
      title: entity.name ?? reference.name,
      subtitle: `${label}${entity.source ? ` • ${entity.source}` : ''}${entity.page ? ` p. ${entity.page}` : ''}`,
      html: getPreviewHtml(entity.entries),
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
    trapHazards: lookup.trapHazards,
    rewards: lookup.rewards,
  }

  const entityMap = mapByKind[normalizedKind]
  const entity = entityMap
    ? resolveRecursiveEntity(entityMap, reference.name, reference.source)
    : undefined
  if (!entity) return simpleFallback

  const kindLabels: Record<string, string> = {
    items: 'Item',
    feats: 'Feat',
    races: 'Race',
    classes: 'Class',
    backgrounds: 'Background',
    optionalfeatures: 'Optional Feature',
    actions: 'Action',
    conditions: 'Condition',
    deities: 'Deity',
    skills: 'Skill',
    senses: 'Sense',
    variantrules: 'Variant Rule',
    languages: 'Language',
    trapHazards: 'Trap or Hazard',
    rewards: 'Reward',
  }

  return {
    title: entity.name ?? reference.name,
    subtitle: `${kindLabels[normalizedKind] ?? normalizedKind}${entity.source ? ` • ${entity.source}` : ''}${entity.page ? ` p. ${entity.page}` : ''}`,
    html: getPreviewHtml(entity.entries),
  }
}

export function getRecursiveHintPosition(
  target: HTMLElement,
  hasBody: boolean,
): { x: number; y: number } {
  const rect = target.getBoundingClientRect()
  const container = target.closest('[data-recursive-tooltip-depth]') as HTMLElement | null

  const containerRect = container?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }
  const tooltipWidthEstimate = 320
  const tooltipHeightEstimate = hasBody ? 220 : 88
  const gap = 8
  const margin = 8
  const overlapStagger = 24
  const rightFits = containerRect.right + gap + tooltipWidthEstimate <= window.innerWidth - margin
  const leftFits = containerRect.left - gap - tooltipWidthEstimate >= margin
  const viewportX = rightFits
    ? containerRect.right + gap
    : leftFits
      ? containerRect.left - gap - tooltipWidthEstimate
      : Math.max(
          margin,
          Math.min(
            containerRect.left + overlapStagger,
            window.innerWidth - tooltipWidthEstimate - margin,
          ),
        )
  const x = viewportX - containerRect.left

  const overlapsParent =
    viewportX < containerRect.right && viewportX + tooltipWidthEstimate > containerRect.left
  const centeredViewportY = rect.top + rect.height / 2 - tooltipHeightEstimate / 2
  const staggeredViewportY = overlapsParent
    ? Math.max(centeredViewportY, containerRect.top + overlapStagger)
    : centeredViewportY
  const viewportY = Math.max(
    margin,
    Math.min(staggeredViewportY, window.innerHeight - tooltipHeightEstimate - margin),
  )
  const y = viewportY - containerRect.top

  return { x, y }
}

export function markRecursiveTooltipReferences(html: string): string {
  return html
    .replace(/<span([^>]*)>/g, (match, attributes: string) => {
      if (!/\sdata-hover-type="[^"]+"/.test(attributes)) return match
      const title = /\stitle="([^"]+)"/.exec(attributes)?.[1]
      if (!title) return match
      const withoutTitle = attributes.replace(/\stitle="[^"]+"/, '')
      return `<span${withoutTitle} data-recursive-title="${title}" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false">`
    })
    .replace(/\scursor-help/g, ' cursor-help underline decoration-dotted underline-offset-2')
}

export function getEntryWithHoverTitles(entry: unknown): string {
  return markRecursiveTooltipReferences(renderEntry(entry) ?? '')
}
