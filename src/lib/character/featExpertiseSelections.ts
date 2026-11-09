import {
  FEAT_EXPERTISE_TARGETS,
  isAuditedFeatExpertise,
  isKnownFeatExpertiseTarget,
} from '@/lib/5etools/featExpertiseRules'
import { ALL_SKILLS } from '@/lib/calculations/skills'
import { addGrant } from '@/lib/provenance/ledger'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'
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

/** Full Feats setup obeys the same new-pick authority as the selective circle command. */
export function canChangeFeatExpertise(
  saved: Character,
  effective: Character,
  target: FeatOptionTarget,
  selections: FeatOptionSelections,
  feats: readonly Feat5e[],
): boolean {
  if (!isKnownFeatExpertiseTarget(target)) return true
  const name = normalizeKey(selections.expertiseSkill ?? '')
  return (
    !name || getFeatExpertiseSkillPool(saved, effective, target, selections, feats).includes(name)
  )
}

/** Post-Finish proficiency, without writes, stale owned skills or implicit self-grants. */
export function getFeatExpertiseSkillPool(
  saved: Character,
  effective: Character,
  target: FeatOptionTarget,
  selections: FeatOptionSelections,
  feats: readonly Feat5e[],
  skillNames: readonly string[] = ALL_SKILLS,
): string[] {
  const owner = getFeatExpertiseOwners(saved, feats).find(
    (row) =>
      getFeatSelectionKey(row.target) === getFeatSelectionKey(target) &&
      getFeatOptionOwnerKey(row.target) === getFeatOptionOwnerKey(target),
  )
  if (!owner?.authorized || !owner.data) return []
  const base = stripFeatExpertiseGrants(effective)
  const skillBlocks = Array.isArray(owner.data.skillProficiencies)
    ? (owner.data.skillProficiencies as Record<string, unknown>[])
    : []
  const blocks = skillBlocks.map((block) => {
    const choose = block.choose as { from?: string[]; count?: number } | undefined
    return {
      count: typeof block.any === 'number' ? block.any : (choose?.count ?? (choose ? 1 : 0)),
      pool: choose?.from,
    }
  })
  const proposed = (selections.skills ?? []).map(normalizeKey)
  const known = new Set(skillNames.map(normalizeKey))
  if (
    new Set(proposed).size !== proposed.length ||
    proposed.length > blocks.reduce((sum, block) => sum + block.count, 0) ||
    proposed.some(
      (name) =>
        !known.has(name) ||
        !blocks.some(
          (block) =>
            block.count > 0 &&
            (!block.pool?.length ||
              block.pool.some((entry) => entry === 'anySkill' || normalizeKey(entry) === name)),
        ),
    )
  )
    return []
  const pool = new Set(
    base.proficiencies.skills.map(normalizeKey).filter((name) => known.has(name)),
  )
  const sourceTag = getFeatOptionSourceTag(owner.target)
  for (const old of owner.options?.skills ?? []) {
    const name = normalizeKey(old)
    if (proposed.includes(name)) continue
    const tags = base.provenance.proficiencies.skills[name] ?? []
    if (
      tags.some((tag) => isSameGrantSource(tag, sourceTag)) &&
      !tags.some((tag) => !isSameGrantSource(tag, sourceTag))
    )
      pool.delete(name)
  }
  for (const name of proposed) pool.add(name)
  return [...pool].filter(
    (name) =>
      name === normalizeKey(owner.options?.expertiseSkill ?? '') ||
      !effective.proficiencies.expertise.some((skill) => normalizeKey(skill) === name),
  )
}

export function getFeatExpertiseOwners(character: Character, feats: readonly Feat5e[]) {
  const rows = new Map<string, ReturnType<typeof getFeatSetupOwners>[number]>()
  for (const row of getFeatSetupOwners(character, feats)) {
    if (!isKnownFeatExpertiseTarget(row.target)) continue
    if (!(row.data && isAuditedFeatExpertise(row.data)) && !row.options?.expertiseSkill?.trim())
      continue
    const key = JSON.stringify([getFeatSelectionKey(row.target), getFeatOptionOwnerKey(row.target)])
    const prior = rows.get(key)
    rows.set(key, prior ? { ...prior, label: `${prior.label}; ${row.label}` } : row)
  }
  return [...rows.entries()].map(([id, row]) => ({
    ...row,
    id,
    authorized: !!row.data && isAuditedFeatExpertise(row.data),
  }))
}

export function isFeatExpertiseOptionGrant(tag: SourceTag): boolean {
  const variant = tag.grantVariant ?? ''
  if (
    tag.sourceType !== 'feat' ||
    tag.grantType !== 'choice' ||
    !/^(selection:|class:|choice:|fixed:)/.test(variant)
  )
    return false
  if (!variant.startsWith('fixed:'))
    return isKnownFeatExpertiseTarget({ name: tag.sourceName, source: tag.sourceRef })
  return FEAT_EXPERTISE_TARGETS.some((target) =>
    isSameGrantSource(
      tag,
      getFeatOptionSourceTag({
        ...target,
        fixedGrant: true,
        grantVariant: variant.slice('fixed:'.length),
      }),
    ),
  )
}

/** Strip derived Expertise so current rules can reapply eligible benefits. */
export function stripFeatExpertiseGrants(character: Character, onlyOwnerId?: string): Character {
  const ledger = character.provenance
  const original = ledger.proficiencies.expertise
  if (!original) return character
  const owner = onlyOwnerId
    ? getFeatExpertiseOwners(character, []).find((row) => row.id === onlyOwnerId)
    : undefined
  if (onlyOwnerId && !owner) return character
  const sourceTag = owner && getFeatOptionSourceTag(owner.target)
  const selectedSkill = normalizeKey(owner?.options?.expertiseSkill ?? '')
  const removed = new Set<string>()
  const expertise = Object.fromEntries(
    Object.entries(original).flatMap(([name, tags]) => {
      const retained = tags.filter(
        (tag) =>
          !isFeatExpertiseOptionGrant(tag) ||
          (sourceTag !== undefined &&
            (selectedSkill !== name || !isSameGrantSource(tag, sourceTag))),
      )
      if (retained.length === tags.length) return [[name, tags]]
      if (retained.length) return [[name, retained]]
      removed.add(name)
      return []
    }),
  )
  return {
    ...character,
    proficiencies: {
      ...character.proficiencies,
      expertise: character.proficiencies.expertise.filter(
        (name) => !removed.has(normalizeKey(name)),
      ),
    },
    provenance: { ...ledger, proficiencies: { ...ledger.proficiencies, expertise } },
  }
}

/** Established intent survives overlap; no-existing-Expertise is checked when making a new pick. */
export function refreshFeatExpertiseState(
  character: Character,
  feats: readonly Feat5e[],
): Character {
  const owners = getFeatExpertiseOwners(character, feats)
  if (
    !owners.length &&
    !Object.values(character.provenance.proficiencies.expertise ?? {}).some((tags) =>
      tags.some(isFeatExpertiseOptionGrant),
    )
  )
    return character
  let result = stripFeatExpertiseGrants(character)
  for (const owner of owners) {
    const name = normalizeKey(owner.options?.expertiseSkill ?? '')
    if (
      !owner.authorized ||
      !name ||
      !result.proficiencies.skills.some((skill) => normalizeKey(skill) === name)
    )
      continue
    result = {
      ...result,
      proficiencies: {
        ...result.proficiencies,
        expertise: [...new Set([...result.proficiencies.expertise, name])],
      },
      provenance: addGrant(
        result.provenance,
        'expertise',
        name,
        getFeatOptionSourceTag(owner.target),
      ),
    }
  }
  return result
}
