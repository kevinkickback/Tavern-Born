import { normalizeGenericToolChoice, normalizeKey } from '@/lib/provenance'
import type { ChoiceRecord } from '@/lib/provenance/types'

type ToolGenericKind = 'musical instrument' | "artisan's tools" | 'gaming set' | 'tool'

export type ToolChoiceSlot = {
  id: string
  choiceId: string
  label: string
  sourceName: string
  options: string[]
}

interface BuildToolSubtypeParams {
  itemsBase?: unknown[]
  items?: unknown[]
  allowedSources?: string[]
}

export function normalizeGenericToolKind(value: string): ToolGenericKind | null {
  const generic = normalizeGenericToolChoice(value)
  if (generic) return generic as ToolGenericKind

  const key = normalizeKey(value)
  if (key === 'anytool' || key === 'tool') return 'tool'

  return null
}

function getItemTypePrefix(type: unknown): string {
  if (typeof type !== 'string') return ''
  return type.split('|')[0] ?? ''
}

function addUniqueByNorm(list: string[], value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return list
  const exists = list.some((v) => normalizeKey(v) === normalizeKey(value))
  if (exists) return list
  return [...list, value]
}

export function hasProfInArray(arr: string[], name: string): boolean {
  const toVariants = (value: string): string[] => {
    const key = normalizeKey(value)
    const variants = new Set<string>([key])
    if (key.endsWith('ies') && key.length > 3) {
      variants.add(`${key.slice(0, -3)}y`)
    }
    if (key.endsWith('es') && key.length > 2) {
      variants.add(key.slice(0, -2))
    }
    if (key.endsWith('s') && key.length > 1) {
      variants.add(key.slice(0, -1))
    }
    variants.add(`${key}s`)
    variants.add(`${key}es`)
    return Array.from(variants)
  }

  const target = new Set(toVariants(name))
  return arr.some((value) => toVariants(value).some((variant) => target.has(variant)))
}

export function buildSkillDescriptions(rawSkills: unknown): Record<string, unknown[]> {
  const map: Record<string, unknown[]> = {}

  const addSkill = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const maybeSkill = value as { name?: unknown; entries?: unknown }
    if (typeof maybeSkill.name !== 'string') return
    if (!Array.isArray(maybeSkill.entries)) return
    map[maybeSkill.name.toLowerCase()] = maybeSkill.entries
  }

  if (Array.isArray(rawSkills)) {
    for (const skill of rawSkills) addSkill(skill)
  } else if (rawSkills && typeof rawSkills === 'object') {
    for (const skill of Object.values(rawSkills)) addSkill(skill)
  }

  return map
}

export function buildChoiceCounts(
  choices: ChoiceRecord[],
): Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number> {
  const counts: Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number> = {
    skills: 0,
    armor: 0,
    weapons: 0,
    tools: 0,
    languages: 0,
  }

  for (const choice of choices) {
    if (!(choice.domain in counts)) continue
    const key = choice.domain as keyof typeof counts
    counts[key] += Math.max(0, choice.chooseCount - choice.selected.length)
  }

  return counts
}

export function buildToolSubtypeOptionsByKind({
  itemsBase,
  items,
  allowedSources,
}: BuildToolSubtypeParams): Record<ToolGenericKind, string[]> {
  const fromBase = itemsBase ?? []
  const fromItems = items ?? []
  const allItems = [...fromBase, ...fromItems]
  const usableSources = allowedSources ?? []
  const hasSourceFilter = usableSources.length > 0

  const filterBySource = (sourceItems: unknown[]) =>
    sourceItems.filter((item) => {
      const typedItem = item as { source?: string }
      if (!hasSourceFilter) return true
      if (!typedItem?.source) return true
      return usableSources.includes(typedItem.source)
    })

  const collectByType = (sourceItems: unknown[], typePrefix: string): string[] => {
    const filtered = sourceItems.filter(
      (item) => getItemTypePrefix((item as { type?: unknown })?.type) === typePrefix,
    )

    let out: string[] = []
    for (const item of filtered) {
      out = addUniqueByNorm(out, (item as { name?: unknown })?.name)
    }

    return out.sort((a, b) => a.localeCompare(b))
  }

  const scopedItems = filterBySource(allItems)

  // Wondrous items (magical instruments like Horn of Silent Alarm, Instrument of Illusions,
  // Rhythm-Maker's Drum) share the INS type code with mundane instruments but are not valid
  // proficiency choices. Exclude them using the `wondrous` flag present on all magical items.
  const mundaneItems = allItems.filter((item) => !(item as { wondrous?: unknown }).wondrous)
  const scopedMundaneItems = filterBySource(mundaneItems)

  const scopedInstruments = collectByType(scopedMundaneItems, 'INS')
  const scopedArtisans = collectByType(scopedItems, 'AT')
  const scopedGaming = collectByType(scopedItems, 'GS')

  const allInstruments = collectByType(mundaneItems, 'INS')
  const allArtisans = collectByType(allItems, 'AT')
  const allGaming = collectByType(allItems, 'GS')

  const fromScopedOrAll = (scoped: string[], all: string[]) => (scoped.length > 0 ? scoped : all)

  const instruments = fromScopedOrAll(scopedInstruments, allInstruments)
  const artisans = fromScopedOrAll(scopedArtisans, allArtisans)
  const gaming = fromScopedOrAll(scopedGaming, allGaming)

  const allTools = Array.from(new Set([...instruments, ...artisans, ...gaming])).sort((a, b) =>
    a.localeCompare(b),
  )

  return {
    'musical instrument': instruments,
    "artisan's tools": artisans,
    'gaming set': gaming,
    tool: allTools,
  }
}

/** Returns true when a tool choice slot should be rendered as individual selectable pills. */
export function isArtisanToolSlot(slot: ToolChoiceSlot): boolean {
  return slot.label === "artisan's tools"
}

/**
 * Collects flat, sorted artisan tool option names from artisan slots.
 * Deduplicates by normalized key.
 */
export function buildArtisanToolNamesFromSlots(artisanSlots: ToolChoiceSlot[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const slot of artisanSlots) {
    for (const opt of slot.options) {
      const norm = normalizeKey(opt)
      if (!seen.has(norm)) {
        seen.add(norm)
        result.push(opt)
      }
    }
  }
  return result.sort((a, b) => a.localeCompare(b))
}

/**
 * Expands tool choice pools into concrete tool names so optional choices remain
 * visible even after a choice is filled.
 */
export function buildOptionalToolNamesFromChoices(
  choices: ChoiceRecord[],
  toolSubtypeOptionsByKind: Record<ToolGenericKind, string[]>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const addName = (name: string) => {
    const norm = normalizeKey(name)
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    result.push(name)
  }

  for (const choice of choices) {
    if (choice.domain !== 'tools') continue
    for (const token of choice.optionPool) {
      const kind = normalizeGenericToolKind(token)
      if (kind) {
        for (const name of toolSubtypeOptionsByKind[kind] ?? []) {
          addName(name)
        }
      } else {
        addName(token)
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b))
}

/** Deduplicates strings by normalised key, preserving first occurrence order. */
export function dedupeByNorm(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const norm = normalizeKey(item)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    result.push(item)
  }
  return result
}

/**
 * Returns `true` when there is at least one unfilled tool choice whose option
 * pool contains the given generic kind.
 */
export function hasUnresolvedChoiceForKind(choices: ChoiceRecord[], kind: string): boolean {
  return choices.some(
    (choice) =>
      choice.domain === 'tools' &&
      choice.selected.length < choice.chooseCount &&
      choice.optionPool.some((poolEntry) => normalizeGenericToolKind(poolEntry) === kind),
  )
}

interface BuildVisibleToolCandidatesParams {
  availableTools: string[]
  optionalToolNames: string[]
  artisanToolNames: string[]
  currentTools: string[]
  selectedToolNames: string[]
}

/**
 * Assembles the sorted, deduplicated list of tool names visible as pills,
 * filtering out abstract tokens and verbose placeholders.
 */
export function buildVisibleToolCandidates({
  availableTools,
  optionalToolNames,
  artisanToolNames,
  currentTools,
  selectedToolNames,
}: BuildVisibleToolCandidatesParams): string[] {
  const toolCandidates = dedupeByNorm([
    ...availableTools,
    ...optionalToolNames,
    ...artisanToolNames,
    ...currentTools,
    ...selectedToolNames,
  ]).sort((a, b) => a.localeCompare(b))

  return toolCandidates.filter((toolName) => {
    const genericKind = normalizeGenericToolKind(toolName)
    if (!genericKind) return true
    // Never render the abstract catch-all token as a pill.
    if (genericKind === 'tool') return false
    // Keep only canonical generic labels (e.g. "gaming set"), not verbose placeholders.
    return normalizeKey(toolName) === normalizeKey(genericKind)
  })
}

/**
 * Builds a Map from normalised artisan tool name to the choiceId of the first
 * artisan slot that accepts it.
 */
export function buildArtisanChoiceMap(artisanSlots: ToolChoiceSlot[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const slot of artisanSlots) {
    for (const opt of slot.options) {
      const norm = normalizeKey(opt)
      if (!map.has(norm)) {
        map.set(norm, slot.choiceId)
      }
    }
  }
  return map
}

/**
 * Collects distinct tool names that have been selected across all tool choice
 * records.
 */
export function getSelectedToolNames(choices: ChoiceRecord[]): string[] {
  return Array.from(
    new Set(
      choices.filter((choice) => choice.domain === 'tools').flatMap((choice) => choice.selected),
    ),
  )
}

interface BuildToolChoiceSlotsParams {
  choices: ChoiceRecord[]
  selectedTools: string[]
  toolSubtypeOptionsByKind: Record<ToolGenericKind, string[]>
}

export function buildToolChoiceSlots({
  choices,
  selectedTools,
  toolSubtypeOptionsByKind,
}: BuildToolChoiceSlotsParams): ToolChoiceSlot[] {
  const selectedToolNorms = new Set(selectedTools.map((name) => normalizeKey(name)))
  const slots: ToolChoiceSlot[] = []

  for (const choice of choices) {
    if (choice.domain !== 'tools') continue

    const kinds = Array.from(
      new Set(
        choice.optionPool
          .map((token) => normalizeGenericToolKind(token))
          .filter((kind): kind is ToolGenericKind => Boolean(kind)),
      ),
    )
    if (kinds.length === 0) continue

    const remaining = Math.max(0, choice.chooseCount - choice.selected.length)
    if (remaining === 0) continue

    const pool = Array.from(new Set(kinds.flatMap((kind) => toolSubtypeOptionsByKind[kind] ?? [])))
      .filter((name) => !selectedToolNorms.has(normalizeKey(name)))
      .sort((a, b) => a.localeCompare(b))

    const label = kinds.length === 1 ? kinds[0] : 'tool proficiency'

    for (let idx = 0; idx < remaining; idx++) {
      slots.push({
        id: `${choice.id}:${idx}`,
        choiceId: choice.id,
        label,
        sourceName: choice.sourceTag.sourceName,
        options: pool,
      })
    }
  }

  return slots
}
