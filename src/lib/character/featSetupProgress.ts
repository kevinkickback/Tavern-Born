import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import {
  isAuditedFeatExpertise,
  isKnownFeatExpertiseTarget,
} from '@/lib/5etools/featExpertiseRules'
import {
  getClassFeatureSpellSemantics,
  hasCurrentFeatureSpellSemantics,
} from '@/lib/5etools/featureSpellSemantics'
import { deriveFeatOptionSteps } from '@/lib/5etools/parsers/featOptions'
import { decodeSelectedFeatureSpellAddress } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { normalizeKey } from '@/lib/provenance'
import type { Feat5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character, FeatOptionSelections } from '@/types/character'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatOptionSourceTag,
  getFeatSelectionKey,
  isSameGrantSource,
} from './commands/featCommandIdentity'
import { getFeatSetupOwners } from './featSetupOwners'
import { managedClassSpellId } from './managedClassSpellIdentity'

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
  if (
    target.classFeatChoiceId &&
    getClassFeatureSpellSemantics('feat', target.name, target.source ?? '')
  ) {
    const selected = saved.classFeatChoices?.filter((row) => row.id === target.classFeatChoiceId)
    const classOwner = selected?.length === 1 ? selected[0] : undefined
    let count = 0
    try {
      const blocks = parseAdditionalSpellBlocks(
        owner?.data?.additionalSpells as AdditionalSpellBlock[] | undefined,
      )
      if (
        blocks.length === 1 &&
        blocks[0].choices.length === 1 &&
        !blocks[0].grants.length &&
        !blocks[0].expanded?.length
      )
        count = blocks[0].choices[0].count
    } catch {
      /* Unsupported current syntax has no completed setup. */
    }
    const choices = (saved.managedClassSpellChoices ?? []).filter((choice) => {
      const address = decodeSelectedFeatureSpellAddress(choice.slot[2])
      return (
        choice.slot[1] === 'feature-cantrip' &&
        !!address &&
        address[0] === target.classFeatChoiceId &&
        address[1] === 'feat' &&
        address[2] === target.name.trim().toLowerCase() &&
        address[3] === target.source?.trim().toLowerCase()
      )
    })
    const active = choices.filter((choice) =>
      Object.values(effective.provenance.spells).some((tags) =>
        tags.some((tag) => tag.grantVariant === managedClassSpellId(choice.slot)),
      ),
    )
    const sourceAvailable =
      !!classOwner &&
      !!owner?.data &&
      hasCurrentFeatureSpellSemantics('feat', owner.data, classOwner.className)
    return {
      options,
      saved: choices.length > 0,
      sourceAvailable,
      applied: active.length > 0,
      complete: sourceAvailable && count > 0 && active.length === count,
    }
  }
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
