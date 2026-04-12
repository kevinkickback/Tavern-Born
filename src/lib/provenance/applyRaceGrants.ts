import { parseRaceSpells } from '@/lib/5etools/raceSpells'
import type { Item5e } from '@/types/5etools'
import { applyFeatGrantBlocks } from './applyFeatAndOptionalFeatureGrants'
import {
  applyProficiencyBlocks,
  type ProficiencyBlock,
  toProficiencyBlocks,
} from './applyProficiencyBlocks'
import { addAbilityBonus, addChoicePlaceholder, addGrant } from './ledger'
import { normalizeKey } from './normalization'
import { makeSourceTag } from './sourceLabels'
import type { ChoiceRecord, ProvenanceLedger } from './types'

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
): ProficiencyBlock[] {
  if (Array.isArray(languageProficiencies) && languageProficiencies.length > 0) {
    return languageProficiencies as ProficiencyBlock[]
  }
  // MPMM lineage races (lineage: "VRGR") encode languages as Common + one choice,
  // but omit explicit languageProficiencies blocks.
  if (typeof lineage === 'string') {
    return [{ common: true, anyStandard: 1 } as ProficiencyBlock]
  }
  return []
}

export function applyRaceSpellGrants(
  race: {
    additionalSpells?: import('@/types/5etools').RaceAdditionalSpells[]
  },
  totalCharacterLevel: number,
  ledger: ProvenanceLedger,
  tag: import('./types').SourceTag,
): ProvenanceLedger {
  let result = ledger
  const grants = parseRaceSpells(race.additionalSpells)
  for (const grant of grants) {
    if (grant.level > totalCharacterLevel) continue
    result = addGrant(result, 'spells', grant.spellName, tag)
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
    feats?: unknown[]
    additionalSpells?: import('@/types/5etools').RaceAdditionalSpells[]
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
        feats?: unknown[]
        additionalSpells?: import('@/types/5etools').RaceAdditionalSpells[]
        overwrite?: { ability?: boolean }
      }
    | undefined,
  ledger: ProvenanceLedger,
  resolveFilterOptions?: (domain: RaceFilterDomain, fromFilter: string) => string[],
  lineageAsiBlockIndex: 0 | 1 = 0,
  totalCharacterLevel = 1,
): ProvenanceLedger {
  let result = ledger
  const usesTashasLineageAsi = race.lineage === true || typeof race.lineage === 'string'

  const raceTag = makeSourceTag('race', race.name, 'fixed', race.source)

  result = applyProficiencyBlocks(
    result,
    'skills',
    toProficiencyBlocks(race.skillProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
  )

  result = applyProficiencyBlocks(
    result,
    'languages',
    getLineageLanguageBlocks(race.lineage, race.languageProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProficiencyBlocks(
    result,
    'tools',
    toProficiencyBlocks(race.toolProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProficiencyBlocks(
    result,
    'weapons',
    toProficiencyBlocks(race.weaponProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  result = applyProficiencyBlocks(
    result,
    'armor',
    toProficiencyBlocks(race.armorProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
    resolveFilterOptions,
  )

  // Apply race feat grants (e.g. Variant Human bonus feat, XPHB Human origin feat).
  result = applyFeatGrantBlocks(result, race.feats, 'race', race.name, race.source)

  // Apply race additional spells independently of ability score parsing.
  result = applyRaceSpellGrants(race, totalCharacterLevel, result, raceTag)

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

    // Apply subrace feat grants.
    result = applyFeatGrantBlocks(result, subrace.feats, 'subrace', subrace.name, subrace.source)

    // Apply subrace additional spells independently of ability score parsing.
    result = applyRaceSpellGrants(subrace, totalCharacterLevel, result, subraceTag)

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

    result = applyProficiencyBlocks(
      result,
      'skills',
      toProficiencyBlocks(subrace.skillProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProficiencyBlocks(
      result,
      'languages',
      toProficiencyBlocks(subrace.languageProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProficiencyBlocks(
      result,
      'tools',
      toProficiencyBlocks(subrace.toolProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProficiencyBlocks(
      result,
      'weapons',
      toProficiencyBlocks(subrace.weaponProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    result = applyProficiencyBlocks(
      result,
      'armor',
      toProficiencyBlocks(subrace.armorProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
  }

  return result
}
