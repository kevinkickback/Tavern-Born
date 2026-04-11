import type { Item5e } from '@/types/5etools'
import { addAbilityBonus, addChoicePlaceholder, addGrant } from './ledger'
import { normalizeGenericToolChoice, normalizeKey } from './normalization'
import { makeSourceTag } from './sourceLabels'
import type { ChoiceRecord, ProvenanceLedger } from './types'

type ProfBlock = Record<
  string,
  | boolean
  | {
      choose?: { from?: string[]; fromFilter?: string; count?: number }
    }
  | number
>

type RaceFilterDomain = 'armor' | 'weapons'

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
  const isAllowedBySource = (item: { source?: string } | null | undefined) => {
    if (!hasSourceFilter) return true
    if (!item?.source) return true
    return allowedSources.includes(item.source)
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
    const armorPrefix =
      typeFilter === 'light armor'
        ? 'LA'
        : typeFilter === 'medium armor'
          ? 'MA'
          : typeFilter === 'heavy armor'
            ? 'HA'
            : typeFilter === 'shield'
              ? 'S'
              : ''

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

function getLineageLanguageBlocks(
  lineage: string | boolean | undefined,
  languageProficiencies: unknown[] | undefined,
): ProfBlock[] {
  if (Array.isArray(languageProficiencies) && languageProficiencies.length > 0) {
    return languageProficiencies as ProfBlock[]
  }
  // MPMM lineage races (lineage: "VRGR") encode languages as Common + one choice,
  // but omit explicit languageProficiencies blocks.
  if (typeof lineage === 'string') {
    return [{ common: true, anyStandard: 1 } as ProfBlock]
  }
  return []
}

function toProfBlocks(blocks: unknown[] | undefined): ProfBlock[] {
  return Array.isArray(blocks) ? (blocks as ProfBlock[]) : []
}

function applyProfBlocks(
  ledger: ProvenanceLedger,
  domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons',
  blocks: ProfBlock[],
  tag: import('./types').SourceTag,
  choiceIdPrefix: string,
  resolveFilterOptions?: (domain: RaceFilterDomain, fromFilter: string) => string[],
): ProvenanceLedger {
  let result = ledger
  let choiceIndex = 0
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose' || key === 'anyStandard') continue
      if (domain === 'tools') {
        const generic = normalizeGenericToolChoice(key)
        if (generic) {
          if (val === true || (typeof val === 'number' && val > 0)) {
            const choiceRecord: ChoiceRecord = {
              id: `${choiceIdPrefix}:${domain}:generic:${choiceIndex}`,
              domain,
              sourceTag: { ...tag, grantType: 'placeholder' },
              chooseCount: typeof val === 'number' && val > 0 ? val : 1,
              optionPool: [generic],
              selected: [],
              status: 'pending',
            }
            result = addChoicePlaceholder(result, choiceRecord)
            choiceIndex++
            continue
          }
        }
      }
      if (val === true) {
        result = addGrant(result, domain, key, tag)
      }
    }
    const anyStandard = (block as { anyStandard?: number }).anyStandard
    if (anyStandard) {
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:any:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: anyStandard,
        optionPool: [],
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
    }
    const choose = (
      block as {
        choose?: { from?: string[]; fromFilter?: string; count?: number }
      }
    ).choose
    if (choose) {
      const normalizedPool =
        domain === 'tools'
          ? (choose.from ?? []).map((entry) => normalizeGenericToolChoice(entry) ?? entry)
          : choose.fromFilter && (domain === 'armor' || domain === 'weapons')
            ? (resolveFilterOptions?.(domain, choose.fromFilter) ?? [])
            : (choose.from ?? [])
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:choose:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: choose.count ?? 1,
        optionPool: normalizedPool,
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
    }
  }
  return result
}

/**
 * Apply grants from a race (and optionally a subrace) to the provenance ledger.
 * Handles fixed proficiency grants, choice placeholders, and ability score bonuses.
 */
export function applyRaceGrants(
  race: {
    name: string
    source?: string
    lineage?: string | boolean
    skillProficiencies?: unknown[]
    languageProficiencies?: unknown[]
    toolProficiencies?: unknown[]
    weaponProficiencies?: unknown[]
    armorProficiencies?: unknown[]
    ability?: unknown[]
  },
  subrace:
    | {
        name: string
        source?: string
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        overwrite?: { ability?: boolean }
      }
    | undefined,
  ledger: ProvenanceLedger,
  resolveFilterOptions?: (domain: RaceFilterDomain, fromFilter: string) => string[],
  lineageAsiBlockIndex: 0 | 1 = 0,
): ProvenanceLedger {
  let result = ledger
  const usesTashasLineageAsi = race.lineage === true || typeof race.lineage === 'string'

  const raceTag = makeSourceTag('race', race.name, 'fixed', race.source)

  result = applyProfBlocks(
    result,
    'skills',
    toProfBlocks(race.skillProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
  )

  result = applyProfBlocks(
    result,
    'languages',
    getLineageLanguageBlocks(race.lineage, race.languageProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProfBlocks(
    result,
    'tools',
    (race.toolProficiencies ?? []) as ProfBlock[],
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProfBlocks(
    result,
    'weapons',
    (race.weaponProficiencies ?? []) as ProfBlock[],
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProfBlocks(
    result,
    'armor',
    (race.armorProficiencies ?? []) as ProfBlock[],
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  if (!usesTashasLineageAsi) {
    for (const block of race.ability ?? []) {
      const abilityBlock = block as Record<string, unknown>
      let choiceIndex = 0
      for (const [key, val] of Object.entries(abilityBlock)) {
        if (key === 'choose') {
          const choose = val as {
            from?: string[]
            count?: number
            amount?: number
          }
          const choiceRecord: ChoiceRecord = {
            id: `race:${normalizeKey(race.name)}:abilityBonuses:choose:${choiceIndex}`,
            domain: 'abilityBonuses',
            sourceTag: { ...raceTag, grantType: 'placeholder' },
            chooseCount: choose.count ?? 1,
            amount: choose.amount ?? 1,
            optionPool: choose.from ?? [],
            selected: [],
            status: 'pending',
          }
          result = addChoicePlaceholder(result, choiceRecord)
          choiceIndex++
        } else if (typeof val === 'number') {
          result = addAbilityBonus(result, {
            ability: key.toLowerCase(),
            value: val,
            sourceTag: raceTag,
          })
        }
      }
    }
  }

  // Lineage races: synthesize Tasha ASI choice.
  const abilityNames = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ]
  if (usesTashasLineageAsi) {
    const lineageAmounts = lineageAsiBlockIndex === 1 ? [1, 1, 1] : [2, 1]
    for (let i = 0; i < lineageAmounts.length; i++) {
      const choiceRecord: ChoiceRecord = {
        id: `race:${normalizeKey(race.name)}:abilityBonuses:choose:${i}`,
        domain: 'abilityBonuses',
        sourceTag: { ...raceTag, grantType: 'placeholder' },
        chooseCount: 1,
        amount: lineageAmounts[i],
        optionPool: abilityNames,
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
    }
  }

  if (subrace) {
    const subraceTag = makeSourceTag('subrace', subrace.name, 'fixed', subrace.source)
    const replace = subrace.overwrite?.ability === true

    if (replace) {
      // Remove parent race ability bonuses and apply subrace's
      result = {
        ...result,
        abilityBonuses: result.abilityBonuses.filter(
          (r) => r.sourceTag.sourceType !== 'race' || r.sourceTag.sourceName !== race.name,
        ),
        choices: result.choices.filter(
          (c) =>
            !(
              c.domain === 'abilityBonuses' &&
              c.sourceTag.sourceType === 'race' &&
              c.sourceTag.sourceName === race.name
            ),
        ),
      }
    }

    for (const block of subrace.ability ?? []) {
      const abilityBlock = block as Record<string, unknown>
      let choiceIndex = 0
      for (const [key, val] of Object.entries(abilityBlock)) {
        if (key === 'choose') {
          const choose = val as {
            from?: string[]
            count?: number
            amount?: number
          }
          const choiceRecord: ChoiceRecord = {
            id: `subrace:${normalizeKey(subrace.name)}:abilityBonuses:choose:${choiceIndex}`,
            domain: 'abilityBonuses',
            sourceTag: { ...subraceTag, grantType: 'placeholder' },
            chooseCount: choose.count ?? 1,
            amount: choose.amount ?? 1,
            optionPool: choose.from ?? [],
            selected: [],
            status: 'pending',
          }
          result = addChoicePlaceholder(result, choiceRecord)
          choiceIndex++
        } else if (typeof val === 'number') {
          result = addAbilityBonus(result, {
            ability: key.toLowerCase(),
            value: val,
            sourceTag: subraceTag,
          })
        }
      }
    }

    result = applyProfBlocks(
      result,
      'skills',
      toProfBlocks(subrace.skillProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProfBlocks(
      result,
      'languages',
      toProfBlocks(subrace.languageProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProfBlocks(
      result,
      'tools',
      (subrace.toolProficiencies ?? []) as ProfBlock[],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProfBlocks(
      result,
      'weapons',
      (subrace.weaponProficiencies ?? []) as ProfBlock[],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProfBlocks(
      result,
      'armor',
      (subrace.armorProficiencies ?? []) as ProfBlock[],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
  }

  return result
}
