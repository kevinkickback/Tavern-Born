import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import { decodeFeatureLiteralChoiceId, getFeatureLiteralChoiceId } from './featureOptionIdentity'

export const NATURAL_EXPLORER_REF = 'Natural Explorer|Ranger|PHB|1|PHB'
export const NATURAL_EXPLORER_TARGET = getClassFeatureIdentity(
  decodeClassFeatureReference(NATURAL_EXPLORER_REF),
)!
export const FAVORED_TERRAIN_GROUP = 'favored-terrain'
export const FAVORED_TERRAINS = [
  'Arctic',
  'Coast',
  'Desert',
  'Forest',
  'Grassland',
  'Mountain',
  'Swamp',
  'Underdark',
] as const
export const NATURAL_EXPLORER_GRANTS = [
  NATURAL_EXPLORER_REF,
  'Favored Enemy and Natural Explorer improvements|Ranger|PHB|6|PHB',
  'Natural Explorer improvement|Ranger|PHB|10|PHB',
].map((ref) => ({
  ref,
  target: getClassFeatureIdentity(decodeClassFeatureReference(ref))!,
  level: decodeClassFeatureReference(ref).level!,
}))
export const DEFT_EXPLORER_REF = 'Deft Explorer|Ranger|PHB|1|TCE'
export const DEFT_EXPLORER_TARGET = getClassFeatureIdentity(
  decodeClassFeatureReference(DEFT_EXPLORER_REF),
)!

export function decodeNaturalExplorerChoiceId(id: string) {
  const parsed = decodeFeatureLiteralChoiceId(id)
  return parsed &&
    parsed.pool === NATURAL_EXPLORER_TARGET &&
    parsed.group === FAVORED_TERRAIN_GROUP &&
    NATURAL_EXPLORER_GRANTS.some(
      (grant) => grant.target === parsed.grant && parsed.level >= grant.level,
    )
    ? parsed
    : undefined
}
export function getNaturalExplorerChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  grant: string,
  level: number,
): string {
  return getFeatureLiteralChoiceId(
    owner,
    NATURAL_EXPLORER_TARGET,
    FAVORED_TERRAIN_GROUP,
    grant,
    level,
  )
}
