import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import {
  decodeFavoredEnemyChoiceId,
  ENEMY_RACE_GROUP,
  ENEMY_TYPE_GROUP,
  FAVORED_ENEMY_TARGET,
  getFavoredEnemyChoiceId,
} from '@/lib/5etools/favoredEnemyIdentity'
import { decodeFeatureOptionReference } from '@/lib/5etools/featureOptionIdentity'
import type { CharacterClassChoiceSelection } from '@/types/character'

export function hasCompleteEnemyAllocation(selection: CharacterClassChoiceSelection) {
  return selection.favoredEnemy?.mode === 'type'
    ? selection.selected.length === 1
    : selection.favoredEnemy?.mode === 'humanoid-races' &&
        selection.selected.length === 2 &&
        selection.favoredEnemy.humanoidsConfirmed === true
}
/** Structural admission never treats authored names as catalog entities or establishes present entitlement. */
export function isValidFavoredEnemySelection(s: CharacterClassChoiceSelection): boolean {
  const r = decodeFavoredEnemyChoiceId(s.choiceId),
    m = s.favoredEnemy
  if (
    !r ||
    !m ||
    s.kind !== 'feature-option' ||
    s.proficiencyAtGain ||
    !s.className.trim() ||
    !s.classSource.trim() ||
    !!s.subclassName !== !!s.subclassSource ||
    s.classLevel !== r.level ||
    s.choiceId !==
      getFavoredEnemyChoiceId(
        {
          name: s.className,
          source: s.classSource,
          subclassName: s.subclassName,
          subclassSource: s.subclassSource,
        },
        r.grant,
        s.classLevel,
      ) ||
    !['type', 'humanoid-races'].includes(m.mode) ||
    Object.keys(m).some((k) => !['mode', 'humanoidsConfirmed', 'language'].includes(k))
  )
    return false
  if (
    s.selected.length > (m.mode === 'type' ? 1 : 2) ||
    (m.humanoidsConfirmed !== undefined &&
      (m.mode !== 'humanoid-races' || m.humanoidsConfirmed !== true || s.selected.length !== 2))
  )
    return false
  const seen = new Set<string>()
  for (const o of s.selected) {
    const t = decodeFeatureOptionReference(o),
      name = canonicalProficiencyName(o.name)
    if (
      o.entityType !== 'featureOption' ||
      !name ||
      /[<>{}]/.test(name) ||
      seen.has(name) ||
      o.slotLevel !== s.classLevel ||
      t?.format !== 'source-group' ||
      t.kind !== 'classFeature' ||
      t.parentIdentity !== FAVORED_ENEMY_TARGET ||
      t.group !== (m.mode === 'type' ? ENEMY_TYPE_GROUP : ENEMY_RACE_GROUP) ||
      (m.mode === 'type' && !/^[a-z][a-z -]*$/.test(name))
    )
      return false
    seen.add(name)
  }
  if (m.language) {
    if (!hasCompleteEnemyAllocation(s)) return false
    const l = m.language
    if (l.kind === 'none') return Object.keys(l).length === 1
    return (
      l.kind === 'spoken' &&
      Object.keys(l).length === 2 &&
      canonicalProficiencyName(l.name) === l.name
    )
  }
  return true
}
export function getInvalidFavoredEnemySelectionIds(
  selections: readonly CharacterClassChoiceSelection[],
) {
  const invalid = new Set<string>(),
    occupied = new Map<string, string>()
  for (const s of selections) {
    const r = decodeFavoredEnemyChoiceId(s.choiceId)
    if (!r && s.favoredEnemy === undefined) continue
    if (!r || !isValidFavoredEnemySelection(s)) {
      invalid.add(s.choiceId)
      continue
    }
    const family = JSON.stringify([r.owner, r.pool, r.group])
    const keys = [
      `id:${s.choiceId}`,
      JSON.stringify([family, r.grant]),
      ...s.selected.map((o) =>
        JSON.stringify([family, s.favoredEnemy!.mode, canonicalProficiencyName(o.name)]),
      ),
    ]
    for (const key of keys) {
      const prior = occupied.get(key)
      if (prior) {
        invalid.add(prior)
        invalid.add(s.choiceId)
      }
      occupied.set(key, s.choiceId)
    }
  }
  return invalid
}
