import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  getInvalidOptionalClassAdoptionIndexes,
  getOptionalClassAdoptionKey,
  getOptionalClassAdoptionRule,
} from '@/lib/character/optionalClassFeatureIdentity'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character, OptionalClassFeatureAdoption } from '@/types/character'
import { reconcileOptionalClassFeatureChoicesCommand } from './classChoiceVariantCommands'
import type { CharacterCommandResult } from './commandResult'

export function getOptionalClassFamilyKeys(
  character: Character,
  request: OptionalClassFeatureAdoption,
): string[] {
  const rule = getOptionalClassAdoptionRule(request)
  if (!rule) throw new RangeError('Unknown optional class feature adoption.')
  return (character.optionalClassFeatureAdoptions ?? [])
    .filter((row) => {
      const other = getOptionalClassAdoptionRule(row)
      return (
        JSON.stringify(row.owner) === JSON.stringify(request.owner) &&
        (rule.family ? other?.family === rule.family : row.target === request.target)
      )
    })
    .map(getOptionalClassAdoptionKey)
    .sort()
}

/** Re-read latest intent and current authority; source-free Clear cannot delete a newer alternative. */
export function setOptionalClassAdoptionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  request: OptionalClassFeatureAdoption,
  adopt: boolean,
  expectedFamilyKeys: readonly string[],
): CharacterCommandResult {
  if (
    !getOptionalClassAdoptionRule(request) ||
    getInvalidOptionalClassAdoptionIndexes(character.optionalClassFeatureAdoptions ?? []).length
  )
    throw new RangeError('Invalid optional class feature adoption.')
  const family = getOptionalClassFamilyKeys(character, request)
  if (JSON.stringify(family) !== JSON.stringify([...expectedFamilyKeys].sort()))
    throw new RangeError(
      'Optional feature choices changed. Review the current choice before confirming.',
    )
  const id = getOptionalClassAdoptionKey(request)
  const selected = family.includes(id)
  if (selected === adopt) return { characterPatch: {}, provenanceUpdate: ledger }
  if (
    adopt &&
    !createOptionalClassFeatureActivity(character, catalogs).states.some(
      (row) => getOptionalClassAdoptionKey(row.adoption) === id && row.offered,
    )
  )
    throw new RangeError(
      'The current owner, level, permission and source cannot verify this optional feature.',
    )
  const next = (character.optionalClassFeatureAdoptions ?? []).filter((row) =>
    adopt
      ? !family.includes(getOptionalClassAdoptionKey(row))
      : getOptionalClassAdoptionKey(row) !== id,
  )
  if (adopt)
    next.push({
      owner: [...request.owner] as OptionalClassFeatureAdoption['owner'],
      target: request.target,
      earnedLevel: request.earnedLevel,
    })
  const proposed = { ...character, optionalClassFeatureAdoptions: next }
  const reconciled = reconcileOptionalClassFeatureChoicesCommand(
    proposed,
    ledger,
    {
      availableClasses: catalogs?.classes ?? [],
      allClasses: catalogs?.classes ?? [],
      classChoiceFeatureCatalogs: catalogs,
    },
    proposed.variantRules?.optionalClassFeatures ?? false,
  )
  return {
    ...reconciled,
    characterPatch: { ...reconciled.characterPatch, optionalClassFeatureAdoptions: next },
  }
}
