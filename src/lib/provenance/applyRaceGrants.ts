import { parseRaceSpells } from '@/lib/5etools/raceSpells'
import { getRaceAbilityData } from '@/lib/calculations/abilityScores'
import { ARMOR_CATEGORY_LABEL_TO_CODE } from '@/lib/calculations/armorClass'
import {
  deriveEffectiveRaceLanguageBlocks,
  deriveEffectiveSubraceLanguageBlocks,
} from '@/lib/calculations/languageOrigin'
import { getRaceSelectionParent } from '@/lib/calculations/raceSelection'
import type { Item5e } from '@/types/5etools'
import { applyFeatGrantBlocks } from './applyFeatAndOptionalFeatureGrants'
import {
  applyProficiencyBlocks,
  type ProficiencyBlock,
  toProficiencyBlocks,
} from './applyProficiencyBlocks'
import { addAbilityBonus, addSpellGrant } from './ledger'
import { normalizeKey } from './normalization'
import { makeRaceAbilityChoiceId } from './raceAbilityChoiceIdentity'
import { getSelectedRaceAbilityChoices, isSelectedRaceOwner } from './raceOwnership'
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

export function applyRaceSpellGrants(
  race: {
    additionalSpells?: import('@/types/5etools').RaceAdditionalSpells[]
  },
  totalCharacterLevel: number,
  ledger: ProvenanceLedger,
  tag: import('./types').SpellSourceTag,
): ProvenanceLedger {
  let result = ledger
  const grants = parseRaceSpells(race.additionalSpells)
  for (const grant of grants) {
    if (grant.level > totalCharacterLevel) continue
    result = addSpellGrant(result, grant.spellName, tag)
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
    _tavernBornFlexibleAsi?: boolean
    _tavernBornSuppressFlexibleAsi?: boolean
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
        lineage?: string | boolean
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
        additionalSpells?: import('@/types/5etools').RaceAdditionalSpells[]
        overwrite?: { ability?: boolean }
        _isVersion?: unknown
      }
    | undefined,
  ledger: ProvenanceLedger,
  resolveFilterOptions?: (domain: RaceFilterDomain, fromFilter: string) => string[],
  lineageAsiBlockIndex: 0 | 1 = 0,
  totalCharacterLevel = 1,
  options?: {
    suppressLanguageGrants?: boolean
    suppressSpellGrants?: boolean
    suppressAbilityGrants?: boolean
  },
): ProvenanceLedger {
  race = getRaceSelectionParent(race, subrace)
  let result = ledger
  const raceTag = makeSourceTag('race', race.name, 'fixed', race.source)

  result = applyProficiencyBlocks(
    result,
    'skills',
    toProficiencyBlocks(race.skillProficiencies),
    raceTag,
    `race:${normalizeKey(race.name)}`,
  )

  if (!options?.suppressLanguageGrants) {
    result = applyProficiencyBlocks(
      result,
      'languages',
      deriveEffectiveRaceLanguageBlocks(race) as ProficiencyBlock[],
      raceTag,
      `race:${normalizeKey(race.name)}`,
      resolveFilterOptions,
    )
  }

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
  if (!options?.suppressSpellGrants) {
    result = applyRaceSpellGrants(race, totalCharacterLevel, result, raceTag)
  }

  if (subrace) {
    const subraceTag = makeSourceTag('subrace', subrace.name, 'fixed', subrace.source)

    // Apply subrace feat grants.
    result = applyFeatGrantBlocks(result, subrace.feats, 'subrace', subrace.name, subrace.source)

    // Apply subrace additional spells independently of ability score parsing.
    if (!options?.suppressSpellGrants) {
      result = applyRaceSpellGrants(subrace, totalCharacterLevel, result, subraceTag)
    }

    result = applyProficiencyBlocks(
      result,
      'skills',
      toProficiencyBlocks(subrace.skillProficiencies),
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
      resolveFilterOptions,
    )
    if (!options?.suppressLanguageGrants) {
      result = applyProficiencyBlocks(
        result,
        'languages',
        toProficiencyBlocks(deriveEffectiveSubraceLanguageBlocks(subrace)),
        subraceTag,
        `subrace:${normalizeKey(subrace.name)}`,
        resolveFilterOptions,
      )
    }
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

  return options?.suppressAbilityGrants
    ? result
    : applyRaceAbilityGrants(race, subrace, result, lineageAsiBlockIndex)
}

/** Apply only the shared ability projection, allowing child commands to rebuild parent ASIs. */
export function applyRaceAbilityGrants(
  race: NonNullable<Parameters<typeof getRaceAbilityData>[0]> & { name: string; source?: string },
  subrace:
    | (NonNullable<Parameters<typeof getRaceAbilityData>[1]> & { name: string; source?: string })
    | undefined,
  ledger: ProvenanceLedger,
  lineageAsiBlockIndex: 0 | 1 = 0,
): ProvenanceLedger {
  race = getRaceSelectionParent(race, subrace)
  const selection = {
    race: race.name,
    raceSource: race.source,
    subrace: subrace?.name,
    subraceSource: subrace?.source,
  }
  let result = ledger
  if (subrace?.overwrite?.ability === true) {
    const isParentOwner = (tag: import('./types').SourceTag) =>
      tag.sourceType === 'race' && isSelectedRaceOwner(tag, selection)
    result = {
      ...result,
      abilityBonuses: result.abilityBonuses.filter((record) => !isParentOwner(record.sourceTag)),
      choices: result.choices.filter(
        (choice) => choice.domain !== 'abilityBonuses' || !isParentOwner(choice.sourceTag),
      ),
    }
  }
  const abilityData = getRaceAbilityData(race, subrace, lineageAsiBlockIndex)
  const abilityTags = {
    race: makeSourceTag('race', race.name, 'fixed', race.source),
    subrace: makeSourceTag('subrace', subrace?.name ?? '', 'fixed', subrace?.source),
  }
  for (const bonus of abilityData.fixed) {
    result = addAbilityBonus(result, {
      ability: bonus.ability,
      value: bonus.value,
      sourceTag: abilityTags[bonus.source],
    })
  }
  const choiceIndices = { race: 0, subrace: 0 }
  for (const choice of abilityData.choices) {
    const tag = abilityTags[choice.source]
    const choiceRecord: ChoiceRecord = {
      id: makeRaceAbilityChoiceId(tag, choiceIndices[choice.source]++),
      domain: 'abilityBonuses',
      sourceTag: { ...tag, grantType: 'placeholder' },
      chooseCount: choice.count,
      amount: choice.amount,
      optionPool: choice.from,
      selected: [],
      status: 'pending',
    }
    const alreadyApplied = getSelectedRaceAbilityChoices(result, selection).some(
      (record) => record.id === choiceRecord.id && record.sourceTag.sourceType === tag.sourceType,
    )
    if (!alreadyApplied) result = { ...result, choices: [...result.choices, choiceRecord] }
  }
  return result
}
