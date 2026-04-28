import type { Background5e, Race5e } from '@/types/5etools'
import type { OriginSystem } from '@/types/character'
import { ABILITY_NAMES } from './abilityScores'
import {
  count2024OriginLanguageChoiceUnits,
  ORIGIN_2024_BASE_LANGUAGE,
  ORIGIN_2024_LANGUAGE_CHOICE_COUNT,
} from './languageOrigin'

const SYNTHETIC_BACKGROUND_ABILITY = [
  {
    choose: {
      weighted: {
        from: [...ABILITY_NAMES],
        weights: [2, 1],
      },
    },
  },
  {
    choose: {
      weighted: {
        from: [...ABILITY_NAMES],
        weights: [1, 1, 1],
      },
    },
  },
]

const SYNTHETIC_ORIGIN_FEAT = [{ anyFromCategory: { category: ['O'], count: 1 } }]

type OriginNormalizedRace = Race5e & {
  _tavernBornFlexibleAsi?: boolean
  _tavernBornSuppressFlexibleAsi?: boolean
}

export function getOriginSystemLabel(originSystem: OriginSystem): string {
  return originSystem === '2024' ? '5.5e Revised (2024)' : '5e Legacy (2014)'
}

export function getOriginAsiSourceLabel(originSystem: OriginSystem): 'Race' | 'Background' {
  return originSystem === '2024' ? 'Background' : 'Race'
}

export function getOriginFeatSourceLabel(originSystem: OriginSystem): 'Background' | 'None' {
  return originSystem === '2024' ? 'Background' : 'None'
}

export function usesRaceOriginBenefits(originSystem: OriginSystem): boolean {
  return originSystem === '2014'
}

export function usesBackgroundOriginBenefits(originSystem: OriginSystem): boolean {
  return originSystem === '2024'
}

function hasAbilityEntries(entity?: { ability?: unknown[] } | null): boolean {
  return Array.isArray(entity?.ability) && entity.ability.length > 0
}

function hasFeatEntries(entity?: Record<string, unknown> | null): boolean {
  return Array.isArray(entity?.feats) && (entity.feats as unknown[]).length > 0
}

function stripRaceOriginFeats<T extends Race5e | undefined>(race: T): T {
  if (!race) return race
  const { feats: _feats, ...rest } = race
  return rest as T
}

function stripRaceOriginBenefits<T extends Race5e | undefined>(race: T): T {
  if (!race) return race
  const { ability: _ability, feats: _feats, ...rest } = race
  return rest as T
}

export function normalizeRaceSelectionForOriginSystem(
  race: Race5e | undefined,
  subrace: Race5e | undefined,
  originSystem: OriginSystem,
): {
  race: OriginNormalizedRace | undefined
  subrace: OriginNormalizedRace | undefined
} {
  if (!race) {
    return {
      race: undefined,
      subrace:
        originSystem === '2024'
          ? (stripRaceOriginBenefits(subrace) as OriginNormalizedRace | undefined)
          : (stripRaceOriginFeats(subrace) as OriginNormalizedRace | undefined),
    }
  }

  if (originSystem === '2024') {
    return {
      race: {
        ...(stripRaceOriginBenefits(race) as OriginNormalizedRace),
        _tavernBornSuppressFlexibleAsi: true,
      },
      subrace: subrace
        ? {
            ...(stripRaceOriginBenefits(subrace) as OriginNormalizedRace),
            _tavernBornSuppressFlexibleAsi: true,
          }
        : undefined,
    }
  }

  const normalizedRace = stripRaceOriginFeats(race) as OriginNormalizedRace
  const normalizedSubrace = stripRaceOriginFeats(subrace) as OriginNormalizedRace | undefined
  const hasAnyRaceAsi = hasAbilityEntries(race) || hasAbilityEntries(subrace)

  if (hasAnyRaceAsi) {
    return { race: normalizedRace, subrace: normalizedSubrace }
  }

  return {
    race: {
      ...normalizedRace,
      _tavernBornFlexibleAsi: true,
    },
    subrace: normalizedSubrace,
  }
}

export function normalizeBackgroundForOriginSystem(
  background: Background5e | undefined,
  originSystem: OriginSystem,
): Background5e | undefined {
  if (!background) return undefined

  if (originSystem === '2014') {
    const { ability: _ability, feats: _feats, ...rest } = background
    return rest as Background5e
  }

  return {
    ...background,
    ability: hasAbilityEntries(background) ? background.ability : SYNTHETIC_BACKGROUND_ABILITY,
    feats: hasFeatEntries(background) ? background.feats : SYNTHETIC_ORIGIN_FEAT,
  }
}

export function countOriginFeatUnits(
  ledger: {
    feats: Record<string, Array<{ sourceType?: string; grantType?: string }>>
    choices: Array<{ domain: string; chooseCount: number; sourceTag: { sourceType?: string } }>
  },
  originSystem: OriginSystem,
): number {
  if (originSystem === '2014') return 0

  const fixedBackgroundFeats = Object.values(ledger.feats).reduce((total, tags) => {
    return (
      total +
      tags.filter((tag) => tag.sourceType === 'background' && tag.grantType !== 'choice').length
    )
  }, 0)

  const backgroundFeatChoices = ledger.choices
    .filter((choice) => choice.domain === 'feats' && choice.sourceTag.sourceType === 'background')
    .reduce((total, choice) => total + choice.chooseCount, 0)

  return fixedBackgroundFeats + backgroundFeatChoices
}

export function ensureOriginSystemInvariants(
  ledger: {
    proficiencies: {
      languages: Record<string, Array<{ sourceType?: string; sourceName?: string }>>
    }
    abilityBonuses: Array<{ sourceTag: { sourceType?: string } }>
    feats: Record<string, Array<{ sourceType?: string; grantType?: string }>>
    choices: Array<{
      domain: string
      chooseCount: number
      sourceTag: { sourceType?: string; sourceName?: string }
    }>
  },
  originSystem: OriginSystem,
): void {
  const hasRaceAbilityBonuses = ledger.abilityBonuses.some(
    (record) => record.sourceTag.sourceType === 'race' || record.sourceTag.sourceType === 'subrace',
  )
  const hasBackgroundAbilityBonuses = ledger.abilityBonuses.some(
    (record) => record.sourceTag.sourceType === 'background',
  )
  const hasRaceAbilityChoices = ledger.choices.some(
    (choice) =>
      choice.domain === 'abilityBonuses' &&
      (choice.sourceTag.sourceType === 'race' || choice.sourceTag.sourceType === 'subrace'),
  )
  const hasBackgroundAbilityChoices = ledger.choices.some(
    (choice) => choice.domain === 'abilityBonuses' && choice.sourceTag.sourceType === 'background',
  )
  const hasRaceFeatBenefits =
    Object.values(ledger.feats).some((tags) =>
      tags.some((tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace'),
    ) ||
    ledger.choices.some(
      (choice) =>
        choice.domain === 'feats' &&
        (choice.sourceTag.sourceType === 'race' || choice.sourceTag.sourceType === 'subrace'),
    )
  const hasBackgroundFeatBenefits =
    Object.values(ledger.feats).some((tags) =>
      tags.some((tag) => tag.sourceType === 'background'),
    ) ||
    ledger.choices.some(
      (choice) => choice.domain === 'feats' && choice.sourceTag.sourceType === 'background',
    )
  const languageTags = Object.values(ledger.proficiencies.languages).flat()
  const hasRaceLanguageBenefits = languageTags.some(
    (tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace',
  )
  const hasBackgroundLanguageBenefits = languageTags.some((tag) => tag.sourceType === 'background')
  const hasCommonLanguage = (ledger.proficiencies.languages.common ?? []).length > 0
  const originLanguageChoiceUnits = count2024OriginLanguageChoiceUnits(ledger.choices)

  if (originSystem === '2024') {
    if (hasRaceAbilityBonuses || hasRaceAbilityChoices) {
      throw new Error(
        '2024 origin system cannot retain race or subrace ability-score origin grants.',
      )
    }
    if (hasRaceFeatBenefits) {
      throw new Error('2024 origin system cannot retain race or subrace origin feats.')
    }
    if (countOriginFeatUnits(ledger, originSystem) !== 1) {
      throw new Error('2024 origin system must provide exactly one background origin feat.')
    }
    if (hasRaceLanguageBenefits) {
      throw new Error('2024 origin system cannot retain race or subrace language grants.')
    }
    if (hasBackgroundLanguageBenefits) {
      throw new Error('2024 origin system cannot retain background language grants.')
    }
    if (!hasCommonLanguage) {
      throw new Error(`2024 origin system must include ${ORIGIN_2024_BASE_LANGUAGE}.`)
    }
    if (originLanguageChoiceUnits !== ORIGIN_2024_LANGUAGE_CHOICE_COUNT) {
      throw new Error('2024 origin system must provide exactly two origin language choices.')
    }
    return
  }

  if (hasBackgroundAbilityBonuses || hasBackgroundAbilityChoices) {
    throw new Error('2014 origin system cannot retain background ability-score origin grants.')
  }
  if (hasBackgroundFeatBenefits) {
    throw new Error('2014 origin system cannot retain background origin feats.')
  }
}
