import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import type { Raw5ePrereq, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'

interface SubclassEligibilityParams {
  subclass: Subclass5e
  className: string
  character: Character
}

type LegacyRestriction = {
  variantOverride: 'bladesingerAnyRace' | 'battleragerAnyRace'
  allowedRace: (raceName: string) => boolean
}

const LEGACY_RESTRICTIONS: Record<string, LegacyRestriction> = {
  'wizard|bladesinger': {
    variantOverride: 'bladesingerAnyRace',
    allowedRace: (raceName) => raceName.includes('elf'),
  },
  'barbarian|battlerager': {
    variantOverride: 'battleragerAnyRace',
    allowedRace: (raceName) => raceName.includes('dwarf'),
  },
}

export function isSubclassEligible({
  subclass,
  className,
  character,
}: SubclassEligibilityParams): boolean {
  const prerequisite = subclass.prerequisite as Raw5ePrereq[] | undefined
  if (Array.isArray(prerequisite) && prerequisite.length > 0) {
    return checkAllPrerequisites(
      { prerequisite },
      buildPrerequisiteSnapshot({ character, viewingClass: className }),
      { className },
    ).met
  }

  const restriction = LEGACY_RESTRICTIONS[`${className}|${subclass.name}`.toLowerCase()]
  if (!restriction) return true
  if (character.variantRules?.[restriction.variantOverride]) return true
  return restriction.allowedRace((character.race ?? '').toLowerCase())
}
