import { getConcreteToolProficiencyName } from '@/lib/5etools/concreteToolProficiencies'
import { getItemTypeCodes } from '@/lib/calculations/itemClassification'
import {
  getRacialSourceDisplayName,
  type RaceDisplaySelection,
} from '@/lib/calculations/raceDisplay'
import {
  canChooseConcreteTool,
  getGenericToolKind,
  getToolChoiceBranches,
  type ToolGenericKind,
} from '@/lib/character/toolProficiencyChoices'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ChoiceRecord } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'

export type ToolChoiceSlot = {
  id: string
  label: string
  sourceName: string
  source?: string
  remaining: number
  options: string[]
}

interface BuildToolSubtypeParams {
  itemsBase?: unknown[]
  items?: unknown[]
  allowedSources?: string[]
}

export { getGenericToolKind as normalizeGenericToolKind }

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
    const selected =
      choice.domain === 'tools'
        ? choice.selected.filter((name) => !getGenericToolKind(name)).length
        : choice.selected.length
    counts[key] += Math.max(0, choice.chooseCount - selected)
  }

  return counts
}

/**
 * Returns the display label for a weapon category grant key (e.g. `"simple"`,
 * `"martial weapons"`, `"simple melee"`) or `null` if the key is not a
 * recognised weapon category.
 */
export function formatWeaponCategoryLabel(key: string): string | null {
  const k = key.toLowerCase()
  const cat = k.includes('simple') ? 'Simple' : k.includes('martial') ? 'Martial' : null
  if (!cat) return null
  if (k.includes('melee')) return `All ${cat} Melee Weapons`
  if (k.includes('ranged')) return `All ${cat} Ranged Weapons`
  return `All ${cat} Weapons`
}

export function buildToolSubtypeOptionsByKind({
  itemsBase,
  items,
  allowedSources,
}: BuildToolSubtypeParams): Record<ToolGenericKind, string[]> {
  const pools: Record<ToolGenericKind, string[]> = {
    'musical instrument': [],
    "artisan's tools": [],
    'gaming set': [],
    tool: [],
  }
  for (const value of [...(itemsBase ?? []), ...(items ?? [])]) {
    if (!value || typeof value !== 'object') continue
    const item = value as Item5e
    if (allowedSources && !allowedSources.includes(item.source)) continue
    if (!getConcreteToolProficiencyName(item) || getGenericToolKind(item.name)) continue
    pools.tool.push(item.name)
    const codes = getItemTypeCodes(item.type)
    if (codes.includes('INS')) pools['musical instrument'].push(item.name)
    if (codes.includes('AT')) pools["artisan's tools"].push(item.name)
    if (codes.includes('GS')) pools['gaming set'].push(item.name)
  }
  for (const key of Object.keys(pools) as ToolGenericKind[]) {
    pools[key] = dedupeByNorm(pools[key]).sort((a, b) => a.localeCompare(b))
  }
  return pools
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
    for (const token of getToolChoiceBranches(choice)) {
      const kind = getGenericToolKind(token)
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

interface BuildVisibleToolCandidatesParams {
  availableTools: string[]
  optionalToolNames: string[]
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
  currentTools,
  selectedToolNames,
}: BuildVisibleToolCandidatesParams): string[] {
  const toolCandidates = dedupeByNorm([
    ...availableTools,
    ...optionalToolNames,
    ...currentTools,
    ...selectedToolNames,
  ]).sort((a, b) => a.localeCompare(b))

  const saved = new Set(selectedToolNames.map(normalizeKey))
  return toolCandidates.filter((name) => {
    const key = normalizeKey(name)
    return saved.has(key) || (!getGenericToolKind(name) && !/^choose \d+$/.test(key))
  })
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
  selection?: RaceDisplaySelection | null
  selectedTools: string[]
  toolSubtypeOptionsByKind: Record<ToolGenericKind, string[]>
  retainedToolSubtypeOptionsByKind?: Record<ToolGenericKind, string[]>
}

export function buildToolChoiceSlots({
  choices,
  selection,
  selectedTools,
  toolSubtypeOptionsByKind,
  retainedToolSubtypeOptionsByKind,
}: BuildToolChoiceSlotsParams): ToolChoiceSlot[] {
  const selectedToolNorms = new Set(selectedTools.map((name) => normalizeKey(name)))
  const slots: ToolChoiceSlot[] = []

  for (const choice of choices) {
    if (choice.domain !== 'tools') continue

    const remaining = choice.chooseCount - choice.selected.length
    if (remaining <= 0) continue
    const label =
      choice.optionPool.length === 1
        ? (getGenericToolKind(choice.optionPool[0]) ?? 'tool proficiency')
        : 'tool proficiency'
    slots.push({
      id: choice.id,
      label,
      sourceName: getRacialSourceDisplayName(selection, choice.sourceTag),
      source: choice.sourceTag.sourceRef,
      remaining,
      options: toolSubtypeOptionsByKind.tool.filter(
        (name) =>
          !selectedToolNorms.has(normalizeKey(name)) &&
          canChooseConcreteTool(
            choice,
            name,
            toolSubtypeOptionsByKind,
            retainedToolSubtypeOptionsByKind,
          ),
      ),
    })
  }

  return slots
}
