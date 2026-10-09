import type { Character } from '@/types/character'
import { normalizeOwnerIdentity } from './normalization'
import { getRaceAbilityChoiceOrdinal, isRaceAbilityChoiceRecord } from './raceAbilityChoiceIdentity'
import type { ProvenanceLedger, SourceTag } from './types'

type RaceSelection = Pick<Character, 'race' | 'raceSource' | 'subrace' | 'subraceSource'>

export function hasRaceAbilityOriginGrants(ledger: {
  abilityBonuses: Array<{ sourceTag: { sourceType?: string } }>
  choices: Array<{ domain: string; sourceTag: { sourceType?: string } }>
}): boolean {
  return (
    ledger.abilityBonuses.some(
      (record) =>
        record.sourceTag.sourceType === 'race' || record.sourceTag.sourceType === 'subrace',
    ) ||
    ledger.choices.some(
      (choice) =>
        choice.domain === 'abilityBonuses' &&
        (choice.sourceTag.sourceType === 'race' || choice.sourceTag.sourceType === 'subrace'),
    )
  )
}

export function isSelectedRaceOwner(tag: SourceTag, selection: RaceSelection): boolean {
  if (!normalizeOwnerIdentity(selection.race)) return false
  const name = tag.sourceType === 'race' ? selection.race : selection.subrace
  const source = tag.sourceType === 'race' ? selection.raceSource : selection.subraceSource
  return (
    (tag.sourceType === 'race' || tag.sourceType === 'subrace') &&
    Boolean(normalizeOwnerIdentity(name)) &&
    Boolean(normalizeOwnerIdentity(source)) &&
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(name) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(source)
  )
}

/** Match the complete owner used by the current aggregate racial spell-choice writer. */
export function isRacialSpellChoiceOwner(tag: SourceTag, selection: RaceSelection): boolean {
  return (
    tag.sourceType === (selection.subrace ? 'subrace' : 'race') &&
    isSelectedRaceOwner(tag, selection)
  )
}

/** Character slots follow numeric native blocks within parent, then child; array order is immaterial. */
export function getSelectedRaceAbilityChoices(ledger: ProvenanceLedger, selection: RaceSelection) {
  return ledger.choices
    .flatMap((record) => {
      const ordinal = getRaceAbilityChoiceOrdinal(record)
      return ordinal !== null &&
        isRaceAbilityChoiceRecord(record) &&
        isSelectedRaceOwner(record.sourceTag, selection)
        ? [{ record, ordinal }]
        : []
    })
    .sort((a, b) =>
      a.record.sourceTag.sourceType === b.record.sourceTag.sourceType
        ? a.ordinal - b.ordinal
        : a.record.sourceTag.sourceType === 'race'
          ? -1
          : 1,
    )
    .map(({ record }) => record)
}

/** Completed character validation; unavailable catalogs do not change saved owner identity. */
export function getUnselectedRaceOwnerPaths(
  ledger: ProvenanceLedger,
  selection: RaceSelection,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const check = (tag: SourceTag, path: Array<string | number>) => {
    if (
      (tag.sourceType === 'race' || tag.sourceType === 'subrace') &&
      !isSelectedRaceOwner(tag, selection)
    )
      paths.push(path)
  }
  const checkMap = (map: Record<string, SourceTag[]>, path: string[]) => {
    for (const [name, tags] of Object.entries(map)) {
      tags.forEach((tag, index) => {
        check(tag, [...path, name, index])
      })
    }
  }
  for (const [domain, map] of Object.entries(ledger.proficiencies)) {
    if (map) checkMap(map, ['proficiencies', domain])
  }
  for (const domain of ['features', 'feats', 'spells', 'equipment'] as const) {
    checkMap(ledger[domain], [domain])
  }
  ledger.abilityBonuses.forEach((record, index) => {
    check(record.sourceTag, ['abilityBonuses', index, 'sourceTag'])
  })
  ledger.choices.forEach((record, index) => {
    check(record.sourceTag, ['choices', index, 'sourceTag'])
  })
  return paths
}
