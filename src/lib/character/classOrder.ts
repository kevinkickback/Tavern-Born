import { type ClassOrder, getSavedClassOrder } from '@/lib/5etools/classOrderIdentity'
import { getCurrentClassOrderOption } from '@/lib/5etools/classOrderSource'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

/** Saved choice intent only grants benefits under its current exact source. */
export function getCurrentClassOrder(
  character: Character,
  order: ClassOrder,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const saved = getSavedClassOrder(character, order)
  if (!saved || saved.selection.inactive || !catalogs) return undefined
  if (
    character.allowedSources?.length &&
    !getEffectiveSources(character.allowedSources, character.originSystem).some(
      (source) => norm(source) === 'xphb',
    )
  )
    return undefined
  const owners = character.classProgression.filter(
    (row) => norm(row.name) === order.owner && norm(row.source) === 'xphb',
  )
  return owners.length === 1 &&
    owners[0].levels >= 1 &&
    getCurrentClassOrderOption(catalogs, order, saved.branch)
    ? saved
    : undefined
}
