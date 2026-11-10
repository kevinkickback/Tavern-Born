import {
  getCurrentMetamagicChoiceId,
  getCurrentNativeSorcerer,
  NATIVE_METAMAGIC_CHOICES,
} from '@/lib/5etools/sorcererSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  getClassChoiceFeatureId,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceIdentity'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { renderEntriesToText } from '@/lib/entryText'
import type { Character } from '@/types/character'

export function getMetamagicDescriptions(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: Parameters<typeof getEffectiveClassChoiceFeatureRoutes>[2],
) {
  const current = getCurrentNativeSorcerer(character, catalogs)
  const choice = current && getCurrentMetamagicChoiceId(current)
  const descriptions = new Map<string, string>()
  for (const selection of character.classChoiceSelections ?? []) {
    if (
      selection.choiceId !== NATIVE_METAMAGIC_CHOICES.phb &&
      selection.choiceId !== NATIVE_METAMAGIC_CHOICES.xphb
    )
      continue
    for (const option of selection.selected)
      descriptions.set(getClassChoiceFeatureId(selection, option), '')
  }
  if (!catalogs || !choice) return descriptions
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  const optionKey = (name: string, source: string | undefined) =>
    getClassChoiceOptionKey({ entityType: 'optionalFeature', name, source })
  for (const { choiceId, id, feature, entries } of routes.contributions) {
    if (choiceId !== choice || !feature.source.trim()) continue
    const key = optionKey(feature.name, feature.source)
    const options = catalogs.optionalFeatureCandidates
      ? catalogs.optionalFeatureCandidates.get(key)
      : catalogs.optionalFeatures?.filter((row) => optionKey(row.name, row.source) === key)
    const option = options?.length === 1 ? options[0] : undefined
    descriptions.set(
      id,
      option && !('sourceIdentityConflict' in option && option.sourceIdentityConflict)
        ? renderEntriesToText(entries)
        : '',
    )
  }
  return descriptions
}
