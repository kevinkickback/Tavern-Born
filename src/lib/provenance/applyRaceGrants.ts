import type { ProvenanceLedger, ChoiceRecord } from './types'
import { makeSourceTag } from './sourceLabels'
import { addGrant, addAbilityBonus, addChoicePlaceholder } from './ledger'
import { normalizeKey } from './normalization'

type ProfBlock = Record<string, boolean | { choose?: { from: string[]; count: number } } | number>

function normalizeGenericToolChoice(value: string): string | null {
  const key = normalizeKey(value)
  if (key.includes('musical instrument') || key === 'anymusicalinstrument' || key === 'instrumentmusical') {
    return 'musical instrument'
  }
  if (
    key.includes("artisan's tool") ||
    key.includes('artisans tool') ||
    key === 'anyartisanstool' ||
    key === 'anyartisantool'
  ) {
    return "artisan's tools"
  }
  if (key.includes('gaming set') || key === 'anygamingset' || key === 'setgaming') {
    return 'gaming set'
  }
  return null
}

/** Extract fixed grants and choices from a 5etools proficiency block array. */
function applyProfBlocks(
  ledger: ProvenanceLedger,
  domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons',
  blocks: ProfBlock[],
  tag: import('./types').SourceTag,
  choiceIdPrefix: string,
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
    const anyStandard = (block as any).anyStandard as number | undefined
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
    const choose = (block as any).choose as
      | { from?: string[]; count?: number }
      | undefined
    if (choose) {
      const normalizedPool = domain === 'tools'
        ? (choose.from ?? []).map((entry) => normalizeGenericToolChoice(entry) ?? entry)
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
    skillProficiencies?: any[]
    languageProficiencies?: any[]
    ability?: any[]
  },
  subrace:
    | {
        name: string
        source?: string
        skillProficiencies?: any[]
        languageProficiencies?: any[]
        ability?: any[]
        overwrite?: { ability?: boolean }
      }
    | undefined,
  ledger: ProvenanceLedger,
): ProvenanceLedger {
  let result = ledger

  const raceTag = makeSourceTag('race', race.name, 'fixed', race.source)

  // ── Skill proficiencies ───────────────────────────────────────────────────
  result = applyProfBlocks(
    result,
    'skills',
    race.skillProficiencies ?? [],
    raceTag,
    `race:${normalizeKey(race.name)}`,
  )

  // ── Language proficiencies ────────────────────────────────────────────────
  result = applyProfBlocks(
    result,
    'languages',
    race.languageProficiencies ?? [],
    raceTag,
    `race:${normalizeKey(race.name)}`,
  )

  // ── Ability score bonuses ─────────────────────────────────────────────────
  for (const block of race.ability ?? []) {
    let choiceIndex = 0
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose') {
        const choose = val as { from?: string[]; count?: number; amount?: number }
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

  // ── Subrace overrides ─────────────────────────────────────────────────────
  if (subrace) {
    const subraceTag = makeSourceTag('subrace', subrace.name, 'fixed', subrace.source)
    const replace = subrace.overwrite?.ability === true

    // Subraces can replace parent ability bonuses when overwrite.ability is set
    if (replace) {
      // Remove parent race ability bonuses and apply subrace's
      result = {
        ...result,
        abilityBonuses: result.abilityBonuses.filter(
          (r) => r.sourceTag.sourceType !== 'race' || r.sourceTag.sourceName !== race.name,
        ),
        choices: result.choices.filter(
          (c) => !(
            c.domain === 'abilityBonuses' &&
            c.sourceTag.sourceType === 'race' &&
            c.sourceTag.sourceName === race.name
          ),
        ),
      }
    }

    for (const block of subrace.ability ?? []) {
      let choiceIndex = 0
      for (const [key, val] of Object.entries(block)) {
        if (key === 'choose') {
          const choose = val as { from?: string[]; count?: number; amount?: number }
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
      subrace.skillProficiencies ?? [],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
    )
    result = applyProfBlocks(
      result,
      'languages',
      subrace.languageProficiencies ?? [],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
    )
  }

  return result
}
