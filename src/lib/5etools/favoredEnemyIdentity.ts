import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import {
  decodeFeatureLiteralChoiceId,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'

const FAVORED_ENEMY_REF = 'Favored Enemy|Ranger|PHB|1|PHB'
export const FAVORED_ENEMY_TARGET = getClassFeatureIdentity(
  decodeClassFeatureReference(FAVORED_ENEMY_REF),
)!
const FAVORED_ENEMY_GROUP = 'favored-enemy'
export const ENEMY_TYPE_GROUP = 'enemy-type'
/** Authored campaign labels, deliberately not references to race or creature catalog entities. */
export const ENEMY_RACE_GROUP = 'campaign-humanoid-race'
export const FAVORED_ENEMY_GRANTS = [
  FAVORED_ENEMY_REF,
  'Favored Enemy and Natural Explorer improvements|Ranger|PHB|6|PHB',
  'Favored Enemy improvement|Ranger|PHB|14|PHB',
].map((ref) => ({
  ref,
  target: getClassFeatureIdentity(decodeClassFeatureReference(ref))!,
  level: decodeClassFeatureReference(ref).level!,
}))
export function decodeFavoredEnemyChoiceId(id: string) {
  const row = decodeFeatureLiteralChoiceId(id)
  return row &&
    row.pool === FAVORED_ENEMY_TARGET &&
    row.group === FAVORED_ENEMY_GROUP &&
    FAVORED_ENEMY_GRANTS.some((g) => g.target === row.grant && row.level >= g.level)
    ? row
    : undefined
}
export function getFavoredEnemyChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  grant: string,
  level: number,
) {
  return getFeatureLiteralChoiceId(owner, FAVORED_ENEMY_TARGET, FAVORED_ENEMY_GROUP, grant, level)
}
export function favoredEnemyOption(name: string, mode: 'type' | 'humanoid-races') {
  return {
    entityType: 'featureOption' as const,
    name: name.trim(),
    source: 'PHB',
    ref: encodeSourceGroupOptionReference(
      { kind: 'classFeature', ref: FAVORED_ENEMY_REF },
      mode === 'type' ? ENEMY_TYPE_GROUP : ENEMY_RACE_GROUP,
      name,
    ),
  }
}
