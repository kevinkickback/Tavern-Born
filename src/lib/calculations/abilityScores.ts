import type { AbilityName, AbilityScores } from '@/types/character'
import {
  ABILITY_ABBREV_ORDER,
  ABILITY_ABBREV_TO_FULL,
  ABILITY_ABBREV_TO_TITLE,
  toAbilityName,
} from './abilityNames'
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  ABILITY_SCORE_MAX,
  getAbilityModifier,
  getPointBuyCost,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from './gameRules'

export type { AbilityName, AbilityScores } from '@/types/character'

export const ABILITY_NAMES: readonly AbilityName[] = ABILITY_ABBREV_ORDER.map(
  (abv) => ABILITY_ABBREV_TO_FULL[abv] as AbilityName,
)

export const ABILITY_ABBREVIATIONS: Readonly<Record<AbilityName, string>> = Object.fromEntries(
  ABILITY_ABBREV_ORDER.map((abv) => [
    ABILITY_ABBREV_TO_FULL[abv],
    ABILITY_ABBREV_TO_TITLE[abv].toUpperCase().slice(0, 3),
  ]),
) as Readonly<Record<AbilityName, string>>

export interface AbilityBonus {
  value: number
  source: string
}

export type AbilityBonuses = Record<AbilityName, AbilityBonus[]>

export function makeDefaultAbilityScores(base = 8): AbilityScores {
  return {
    strength: base,
    dexterity: base,
    constitution: base,
    intelligence: base,
    wisdom: base,
    charisma: base,
  }
}

export function makeDefaultStandardArrayAssignment(): AbilityScores {
  return Object.fromEntries(
    ABILITY_NAMES.map((ability, index) => [ability, STANDARD_ARRAY[index] ?? POINT_BUY_MIN]),
  ) as unknown as AbilityScores
}

export function makeEmptyAbilityBonuses(): AbilityBonuses {
  return {
    strength: [],
    dexterity: [],
    constitution: [],
    intelligence: [],
    wisdom: [],
    charisma: [],
  }
}

/**
 * Compute the total ability score: base + all stacked bonuses.
 * Capped at ABILITY_SCORE_ABSOLUTE_MAX (30).
 */
export function getTotalAbilityScore(base: number, bonuses: AbilityBonus[]): number {
  const total = base + bonuses.reduce((sum, b) => sum + b.value, 0)
  return Math.min(total, ABILITY_SCORE_ABSOLUTE_MAX)
}

export function getAbilityScore(
  ability: AbilityName,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): number {
  return Math.min(getTotalAbilityScore(scores[ability], bonuses[ability] ?? []), ABILITY_SCORE_MAX)
}

export function getAbilityModifierForCharacter(
  ability: AbilityName,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): number {
  return getAbilityModifier(getAbilityScore(ability, scores, bonuses))
}

export function getAllAbilityModifiers(
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): Record<AbilityName, number> {
  return Object.fromEntries(
    ABILITY_NAMES.map((a) => [a, getAbilityModifierForCharacter(a, scores, bonuses)]),
  ) as Record<AbilityName, number>
}

export function calculatePointBuyTotal(scores: Partial<AbilityScores>): number {
  return Object.values(scores).reduce((sum: number, s) => sum + getPointBuyCost(s as number), 0)
}

export function getRemainingPointBuy(scores: Partial<AbilityScores>, budget: number): number {
  return budget - calculatePointBuyTotal(scores)
}

export function getValidPointBuyScores(): number[] {
  return Object.keys(POINT_BUY_COSTS)
    .map(Number)
    .sort((a, b) => a - b)
}

export function isValidPointBuyScore(score: number): boolean {
  return score >= POINT_BUY_MIN && score <= POINT_BUY_MAX
}

/**
 * Check if scores form a valid standard array assignment.
 * Valid assignment: each value from STANDARD_ARRAY appears at most once across abilities.
 */
export function isValidStandardArrayAssignment(scores: Partial<AbilityScores>): boolean {
  const values = Object.values(scores).filter((v) => v !== undefined) as number[]
  const usedCounts = new Map<number, number>()

  for (const val of values) {
    usedCounts.set(val, (usedCounts.get(val) ?? 0) + 1)
  }

  for (const [val, count] of usedCounts) {
    if (count > 1 || !(STANDARD_ARRAY as readonly number[]).includes(val)) {
      return false
    }
  }

  return true
}

/**
 * Format a modifier as a signed string: "+2", "-1", "+0".
 */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

interface FixedAbilityBonus {
  ability: AbilityName
  value: number
  source: 'race' | 'subrace'
}

interface ChoosableAbilityBonus {
  count: number
  amount: number
  from: AbilityName[]
  source: 'race' | 'subrace'
}

export interface RaceAbilityData {
  fixed: FixedAbilityBonus[]
  choices: ChoosableAbilityBonus[]
}

function evaluateRaceAbilityChoices(
  data: { choices: Array<{ count: number; from: AbilityName[] }> },
  selections: string[][],
) {
  const selectedByBlock: AbilityName[][] = []
  const completion: boolean[] = []
  const selectedAcrossBlocks = new Set<AbilityName>()

  for (const [blockIndex, block] of data.choices.entries()) {
    const accepted: AbilityName[] = []
    const selectedInBlock = new Set<AbilityName>()

    for (const rawSelection of selections[blockIndex] ?? []) {
      const ability = normalizeAbilityName(rawSelection)
      if (
        !ability ||
        !block.from.includes(ability) ||
        selectedInBlock.has(ability) ||
        selectedAcrossBlocks.has(ability)
      ) {
        continue
      }
      selectedInBlock.add(ability)
      selectedAcrossBlocks.add(ability)
      accepted.push(ability)
      if (accepted.length === block.count) break
    }

    selectedByBlock.push(accepted)
    completion.push(accepted.length >= block.count)
  }

  return { completion, selectedByBlock }
}

export function getRaceAbilityChoiceCompletion(
  data: RaceAbilityData,
  selections: string[][],
): boolean[] {
  return evaluateRaceAbilityChoices(data, selections).completion
}

export function hasUnresolvedRaceAbilityChoices(
  data: RaceAbilityData,
  selections: string[][],
): boolean {
  return getRaceAbilityChoiceCompletion(data, selections).some((isComplete) => !isComplete)
}

export function buildRacialBonuses(
  raceAsiData: {
    fixed: Array<{ ability: AbilityName; value: number }>
    choices: Array<{ amount: number; count: number; from: AbilityName[] }>
  },
  raceAsiChoices: string[][],
): Partial<Record<AbilityName, number>> {
  const racialBonuses: Partial<Record<AbilityName, number>> = {}

  for (const fixedBonus of raceAsiData.fixed) {
    racialBonuses[fixedBonus.ability] = (racialBonuses[fixedBonus.ability] ?? 0) + fixedBonus.value
  }

  const { selectedByBlock } = evaluateRaceAbilityChoices(raceAsiData, raceAsiChoices)
  for (const [blockIndex, selected] of selectedByBlock.entries()) {
    for (const ability of selected) {
      racialBonuses[ability] =
        (racialBonuses[ability] ?? 0) + raceAsiData.choices[blockIndex].amount
    }
  }

  return racialBonuses
}

type FlexibleRaceAbilitySource = {
  lineage?: string | boolean
  _tavernBornFlexibleAsi?: boolean
  _tavernBornSuppressFlexibleAsi?: boolean
}

export function hasFlexibleRaceOriginAsi(race?: FlexibleRaceAbilitySource | null): boolean {
  if (race?._tavernBornSuppressFlexibleAsi === true) {
    return false
  }
  return (
    race?._tavernBornFlexibleAsi === true ||
    race?.lineage === true ||
    typeof race?.lineage === 'string'
  )
}

export type RaceLineageAsiBlockIndex = 0 | 1

type RaceAbilityEntry = {
  choose?: {
    count?: number
    amount?: number
    from?: string[]
  }
  [ability: string]: number | { count?: number; amount?: number; from?: string[] } | undefined
}

export function normalizeAbilityName(input: string): AbilityName | null {
  return toAbilityName(input) as AbilityName | null
}

interface BackgroundAbilityBlock {
  from: AbilityName[]
  weights: number[]
}

export interface BackgroundAbilityData {
  blocks: BackgroundAbilityBlock[]
}

export function formatBackgroundAbilityPatterns(data: BackgroundAbilityData): string[] {
  return data.blocks.map((block) => {
    const weights = block.weights.map((weight) => `+${weight}`).join('/')
    const abilities = block.from.map((ability) => ABILITY_ABBREVIATIONS[ability]).join(', ')
    return `${weights} from ${abilities}`
  })
}

export function isBackgroundAbilitySelectionComplete(
  data: BackgroundAbilityData,
  blockIndex: number,
  choices: string[],
): boolean {
  const block = data.blocks[blockIndex] ?? data.blocks[0]
  if (!block || choices.length < block.weights.length) return false
  const selected = choices
    .slice(0, block.weights.length)
    .map((choice) => normalizeAbilityName(choice))
  return (
    selected.every((ability) => ability !== null && block.from.includes(ability)) &&
    new Set(selected).size === block.weights.length
  )
}

/**
 * Parse the `ability` field on a 2024 (XPHB) background into structured block data.
 * XPHB backgrounds carry two alternative assignment methods as separate blocks.
 */
export function getBackgroundAbilityData(
  bg?: { ability?: unknown[] } | null,
): BackgroundAbilityData {
  const blocks: BackgroundAbilityBlock[] = []
  for (const entry of bg?.ability ?? []) {
    const block = entry as {
      choose?: { weighted?: { from?: string[]; weights?: number[] } }
    }
    if (block.choose?.weighted) {
      const { from = [], weights = [] } = block.choose.weighted
      const normalized = from
        .map((a) => normalizeAbilityName(a))
        .filter((a): a is AbilityName => a !== null)
      if (normalized.length > 0 && weights.length > 0) {
        blocks.push({ from: normalized, weights })
      }
    }
  }
  return { blocks }
}

/**
 * Compute the bonus totals for a chosen background ability block + selections.
 * selections[i] is the ability chosen for weights[i].
 * Duplicates are ignored (same ability cannot receive multiple weight slots).
 */
export function buildBackgroundBonuses(
  data: BackgroundAbilityData,
  blockIndex: number,
  choices: string[],
): Partial<Record<AbilityName, number>> {
  const block = data.blocks[blockIndex]
  if (!block) return {}
  const seen = new Set<AbilityName>()
  const bonuses: Partial<Record<AbilityName, number>> = {}
  for (let i = 0; i < block.weights.length; i++) {
    const ability = normalizeAbilityName(choices[i] ?? '')
    if (!ability || seen.has(ability)) continue
    seen.add(ability)
    bonuses[ability] = (bonuses[ability] ?? 0) + block.weights[i]
  }
  return bonuses
}

/**
 * Extract fixed bonuses and choosable bonuses from 5etools race/subrace ability arrays.
 */
export function getRaceAbilityData(
  race?: {
    ability?: RaceAbilityEntry[]
    lineage?: string | boolean
    _tavernBornFlexibleAsi?: boolean
    _tavernBornSuppressFlexibleAsi?: boolean
  } | null,
  subrace?: { ability?: RaceAbilityEntry[] } | null,
  lineageAsiBlockIndex: RaceLineageAsiBlockIndex = 0,
): RaceAbilityData {
  const fixed: FixedAbilityBonus[] = []
  const choices: ChoosableAbilityBonus[] = []
  const usesTashasLineageAsi = hasFlexibleRaceOriginAsi(race)

  function processEntries(entries: RaceAbilityEntry[] | undefined, source: 'race' | 'subrace') {
    if (!entries) return
    for (const entry of entries) {
      if (entry.choose) {
        choices.push({
          count: entry.choose.count ?? 1,
          amount: entry.choose.amount ?? 1,
          from: (entry.choose.from ?? Object.keys(ABILITY_ABBREVIATIONS))
            .map((a) => normalizeAbilityName(a))
            .filter((a): a is AbilityName => a !== null),
          source,
        })
      } else {
        for (const [key, val] of Object.entries(entry)) {
          const ability = normalizeAbilityName(key)
          if (ability && typeof val === 'number') {
            fixed.push({ ability, value: val, source })
          }
        }
      }
    }
  }

  // For lineage races (including Tasha's Custom Lineage), we synthesize the
  // ASI blocks from the selected lineage mode instead of consuming race.ability.
  if (!usesTashasLineageAsi) {
    processEntries(race?.ability, 'race')
  }
  processEntries(subrace?.ability, 'subrace')

  // Lineage races follow Tasha's ASI choice at character creation:
  // - block 0: +2 to one ability and +1 to a different ability
  // - block 1: +1 to three different abilities
  if (usesTashasLineageAsi) {
    const allAbilities = [...ABILITY_NAMES] as AbilityName[]
    if (lineageAsiBlockIndex === 1) {
      choices.push({
        count: 3,
        amount: 1,
        from: allAbilities,
        source: 'race',
      })
    } else {
      choices.push({
        count: 1,
        amount: 2,
        from: allAbilities,
        source: 'race',
      })
      choices.push({
        count: 1,
        amount: 1,
        from: allAbilities,
        source: 'race',
      })
    }
  }

  return { fixed, choices }
}
