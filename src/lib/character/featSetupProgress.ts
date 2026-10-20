import {
  isAuditedFeatExpertise,
  isKnownFeatExpertiseTarget,
} from '@/lib/5etools/featExpertiseRules'
import { deriveFeatOptionSteps } from '@/lib/5etools/parsers/featOptions'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { normalizeKey } from '@/lib/provenance'
import type { Feat5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatOptionSourceTag,
  getFeatSelectionKey,
  isSameGrantSource,
} from './commands/featCommandIdentity'
import { getFeatSetupOwners } from './featSetupOwners'

/** Supported Expertise can be configured independently; an options object is not completion. */
export function isFeatSetupComplete(
  feat: Feat5e | undefined,
  options?: FeatOptionSelections,
  expertiseApplied = true,
): boolean {
  if (!options) return false
  if (!feat || !isAuditedFeatExpertise(feat)) return true
  const counts = { skills: 0, tools: 0, languages: 0, spells: 0 }
  return deriveFeatOptionSteps(feat).every((step) => {
    if (step.kind === 'proficiency') {
      counts[step.domain] += step.count
      return (options[step.domain]?.length ?? 0) >= counts[step.domain]
    }
    if (step.kind === 'spells') {
      counts.spells += step.count
      return (options.spells?.length ?? 0) >= counts.spells
    }
    if (step.kind === 'expertise') return !!options.expertiseSkill?.trim() && expertiseApplied
    if (step.kind === 'abilityScore')
      return (
        !!options.abilityScore &&
        step.from.some(
          (ability) =>
            normalizeAbilityName(ability) === normalizeAbilityName(options.abilityScore!),
        )
      )
    if (step.kind === 'optionalFeature') return !!options.optionalFeature
    return !!options.spellcastingClass
  })
}

/** Exact current mechanical owner, separate from equal-looking options on another copy. */
export function getFeatSetupStatus(
  saved: Character,
  effective: Character,
  target: FeatOptionTarget,
  feats: readonly Feat5e[],
) {
  const owner = getFeatSetupOwners(saved, feats).find(
    (row) =>
      getFeatSelectionKey(row.target) === getFeatSelectionKey(target) &&
      getFeatOptionOwnerKey(row.target) === getFeatOptionOwnerKey(target),
  )
  const options = owner?.options
  const supported = isKnownFeatExpertiseTarget(target)
  const sourceAvailable = !!owner?.data && (!supported || isAuditedFeatExpertise(owner.data))
  const name = normalizeKey(options?.expertiseSkill ?? '')
  const applied =
    sourceAvailable &&
    !!name &&
    effective.proficiencies.skills.some((skill) => normalizeKey(skill) === name) &&
    effective.proficiencies.expertise.some((skill) => normalizeKey(skill) === name) &&
    (effective.provenance.proficiencies.expertise?.[name] ?? []).some((tag) =>
      isSameGrantSource(tag, getFeatOptionSourceTag(target)),
    )
  return {
    options,
    saved: options !== undefined,
    sourceAvailable,
    applied,
    complete: supported
      ? sourceAvailable && isFeatSetupComplete(owner?.data, options, applied)
      : !!options,
  }
}
