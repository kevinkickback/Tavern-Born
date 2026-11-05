import { ARMOR_CATEGORY_LABEL_TO_CODE } from '@/lib/5etools/rulesetMetadata'
import type { Item5e } from '@/types/5etools'
import { normalizeKey } from './normalization'

export type RaceFilterDomain = 'armor' | 'weapons'

export interface RaceGrantOptionContext {
  items?: Item5e[]
  itemsBase?: Item5e[]
  allowedSources?: string[]
}

function addUniqueNames(list: string[], value: string): string[] {
  if (!value.trim()) return list
  if (list.some((entry) => normalizeKey(entry) === normalizeKey(value))) {
    return list
  }
  return [...list, value]
}

function getArmorTypePrefix(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  return value.split('|')[0] ?? ''
}

export function resolveRaceGrantFilterOptions(
  domain: RaceFilterDomain,
  fromFilter: string,
  context: RaceGrantOptionContext,
): string[] {
  const allowedSources = context.allowedSources ?? []
  const hasSourceFilter = allowedSources.length > 0
  const enabledSources = new Set(allowedSources.map((source) => source.toUpperCase()))
  const isAllowedBySource = (item: { source?: string } | null | undefined) => {
    if (!hasSourceFilter) return true
    if (!item?.source) return true
    return enabledSources.has(item.source.toUpperCase())
  }

  const criteria = new Map(
    fromFilter
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value = ''] = part.split('=')
        return [normalizeKey(key), normalizeKey(value)] as const
      }),
  )

  const typeFilter = criteria.get('type') ?? ''
  const wantsMundane = criteria.get('miscellaneous') === 'mundane'
  const basePool = wantsMundane
    ? (context.itemsBase ?? [])
    : [...(context.itemsBase ?? []), ...(context.items ?? [])]
  const filteredPool = basePool.filter(isAllowedBySource)

  let results: string[] = []

  if (domain === 'weapons') {
    const weaponCategory =
      typeFilter === 'martial weapon' ? 'martial' : typeFilter === 'simple weapon' ? 'simple' : ''

    for (const item of filteredPool) {
      if (!item?.name) continue
      if (weaponCategory && normalizeKey(item.weaponCategory ?? '') !== weaponCategory) {
        continue
      }
      results = addUniqueNames(results, item.name)
    }
  }

  if (domain === 'armor') {
    const armorPrefix = ARMOR_CATEGORY_LABEL_TO_CODE[typeFilter] ?? ''

    for (const item of filteredPool) {
      if (!item?.name) continue
      if (armorPrefix && getArmorTypePrefix(item.type) !== armorPrefix) {
        continue
      }
      results = addUniqueNames(results, item.name)
    }
  }

  return results.sort((left, right) => left.localeCompare(right))
}
