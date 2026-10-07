import type { Race5e } from '@/types/5etools'
import { getRaceSelectionParent } from './raceSelection'

export type RaceSpellSelectionOptions = {
  raceName?: string
  subraceName?: string
  subraceIsNested?: boolean
}

/** Shared selection and saved-profile label policy for racial spell consumers. */
export function deriveRaceSpellSelection(
  parentRace: Race5e | undefined,
  subrace: Race5e | undefined,
  options: RaceSpellSelectionOptions = {},
) {
  const subraceName = subrace?.name ?? options.subraceName
  const parentSpells = parentRace
    ? (getRaceSelectionParent(parentRace, subrace).additionalSpells ?? [])
    : []
  const parentAdditionalSpells =
    subraceName && parentSpells.some((block) => !!block.name)
      ? parentSpells.filter(
          (block) => !block.name || block.name.toLowerCase() === subraceName.toLowerCase(),
        )
      : parentSpells
  const subraceAdditionalSpells = subrace?.additionalSpells ?? []
  const subraceIsNested =
    options.subraceIsNested ??
    !!parentRace?.subraces?.some(
      (candidate) => candidate.name === subrace?.name && candidate.source === subrace?.source,
    )
  const name =
    subraceIsNested && subrace
      ? `${subrace.name} ${parentRace?.name ?? options.raceName ?? ''}`
      : (subraceName ?? parentRace?.name ?? options.raceName)

  return {
    name,
    source: subrace?.source ?? parentRace?.source,
    parentAdditionalSpells,
    subraceAdditionalSpells,
    additionalSpells: [...parentAdditionalSpells, ...subraceAdditionalSpells],
  }
}
