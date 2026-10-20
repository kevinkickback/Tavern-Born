import { isAuditedSkilledFeat, isSkilledFeatTarget } from '@/lib/5etools/featSkillRules'
import { ALL_SKILLS } from '@/lib/calculations/skills'
import { normalizeKey } from '@/lib/provenance'
import type { Feat5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatSelectionKey,
} from './commands/featCommandIdentity'
import { getFeatSetupOwners } from './featSetupOwners'

/** New Skilled picks exclude current proficiency; only this live owner's saved picks are retained. */
export function getSkilledSkillPool(
  saved: Character,
  effective: Character,
  target: FeatOptionTarget,
  feats: readonly Feat5e[],
  skillNames: readonly string[] = ALL_SKILLS,
): string[] {
  const owner = getFeatSetupOwners(saved, feats).find(
    (row) =>
      getFeatSelectionKey(row.target) === getFeatSelectionKey(target) &&
      getFeatOptionOwnerKey(row.target) === getFeatOptionOwnerKey(target),
  )
  if (!owner || !isSkilledFeatTarget(target)) return []
  const retained = new Set(owner.options?.skills?.map(normalizeKey) ?? [])
  const proficient = new Set(effective.proficiencies.skills.map(normalizeKey))
  const available = !!owner.data && isAuditedSkilledFeat(owner.data)
  return [...new Set(skillNames.map(normalizeKey))].filter(
    (name) => retained.has(name) || (available && !proficient.has(name)),
  )
}

export function canChangeSkilledSkills(
  saved: Character,
  effective: Character,
  target: FeatOptionTarget,
  selections: FeatOptionSelections,
  feats: readonly Feat5e[],
): boolean {
  if (!isSkilledFeatTarget(target)) return true
  const skills = (selections.skills ?? []).map(normalizeKey)
  const pool = new Set(getSkilledSkillPool(saved, effective, target, feats))
  return (
    skills.length <= 3 &&
    new Set(skills).size === skills.length &&
    skills.every((name) => pool.has(name))
  )
}
