import { divineOrderKey, getSavedDivineOrder } from '@/lib/5etools/divineOrderIdentity'
import { hasCurrentDivineOrderBenefit } from '@/lib/5etools/divineOrderSource'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

/** A saved class choice is intent until its exact current gain and branch can be verified. */
export function getCurrentDivineOrder(character: Character, catalogs?: ClassChoiceFeatureCatalogs) {
  const saved = getSavedDivineOrder(character)
  if (!saved || saved.selection.inactive || !catalogs) return undefined
  if (
    character.allowedSources?.length &&
    !getEffectiveSources(character.allowedSources, character.originSystem).some(
      (source) => divineOrderKey(source) === 'xphb',
    )
  )
    return undefined
  const owners = character.classProgression.filter(
    (row) => divineOrderKey(row.name) === 'cleric' && divineOrderKey(row.source) === 'xphb',
  )
  if (
    owners.length !== 1 ||
    owners[0].levels < 1 ||
    !hasCurrentDivineOrderBenefit(catalogs, saved.branch)
  )
    return undefined
  return saved
}
