import { LEGACY_SUBCLASS_PREREQUISITE_FIXUPS } from '@/lib/5etools/rulesetMetadata'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import type { Raw5ePrereq, Subclass5e } from '@/types/5etools'
import type { AbilityScores, Character } from '@/types/character'

interface SubclassEligibilityParams {
  subclass: Subclass5e
  className: string
  character: Character
  effectiveAbilityScores?: AbilityScores
}

interface LegacyRestriction {
  variantOverride: 'bladesingerAnyRace' | 'battleragerAnyRace'
  allowedRaceKeyword: string
}

export function isSubclassEligible({
  subclass,
  className,
  character,
  effectiveAbilityScores,
}: SubclassEligibilityParams): boolean {
  const prerequisite = subclass.prerequisite as Raw5ePrereq[] | undefined
  if (Array.isArray(prerequisite) && prerequisite.length > 0) {
    return checkAllPrerequisites(
      { prerequisite },
      buildPrerequisiteSnapshot({ character, effectiveAbilityScores }),
      { className },
    ).met
  }

  const key = `${className}|${subclass.classSource ?? ''}|${subclass.shortName}|${subclass.source}`
  const restriction = (
    LEGACY_SUBCLASS_PREREQUISITE_FIXUPS as Readonly<Record<string, LegacyRestriction>>
  )[key]
  if (!restriction) return true
  if (character.variantRules?.[restriction.variantOverride]) return true
  return (character.race ?? '').toLowerCase().includes(restriction.allowedRaceKeyword)
}
