import { getBardLoreSpellRule, isClassicMagicalSecretsSlot } from '@/lib/5etools/bardSpellSources'
import {
  getClassSpellProfilePolicy,
  isManagedClassSpellSlot,
} from '@/lib/5etools/classCastingRules'
import { getClassFeatureSpellSemantics } from '@/lib/5etools/featureSpellSemantics'
import { getSavantSpellbookGain } from '@/lib/5etools/savantSpellbookRules'
import { isGiantPowerSpellSlot } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  getManagedClassSpellOwnerEntry,
  isManagedClassSpellProfile,
  isManagedClassSpellTag,
  isPlainSpellIdentityPart,
  isPlainSpellReference,
  managedClassSpellId,
  managedClassSpellUniquenessGroup,
  matchesManagedClassSpellTag,
} from '@/lib/character/managedClassSpellIdentity'
import { hasSavedSelectedFeatureSpellOwner } from '@/lib/character/selectedFeatureSpellOwnership'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character, SpellProfile } from '@/types/character'

type Path = Array<string | number>
export const isIndependentFixedClassSpell = (profile: SpellProfile, reference: string) =>
  [...(profile.fixedSpells ?? []), ...(profile.alwaysPreparedSpells ?? [])].some(
    (fixed) =>
      isPlainSpellReference(fixed) &&
      getSpellReferenceKey(fixed) === getSpellReferenceKey(reference),
  )

/** Strict saved relation only. A valid relation supplies no current rules or casting permission. */
export function getInvalidManagedClassSpellPaths(character: Character): Path[] {
  const invalid: Path[] = []
  const choices = character.managedClassSpellChoices ?? []
  const watermark = character.managedClassSpellRevision
  if (
    (watermark === undefined && choices.length) ||
    (watermark !== undefined && (!Number.isSafeInteger(watermark) || watermark < 0))
  )
    invalid.push(['managedClassSpellRevision'])
  const byId = new Map<string, (typeof choices)[number]>()
  const logical = new Set<string>()
  const revisions = new Set<number>()
  choices.forEach((choice, index) => {
    const id = managedClassSpellId(choice.slot)
    const key = JSON.stringify([
      choice.slot[0].slice(1, 3),
      managedClassSpellUniquenessGroup(choice.slot),
      getSpellNameKey(choice.target.name),
    ])
    if (
      !isManagedClassSpellSlot(choice.slot) ||
      (isGiantPowerSpellSlot(choice.slot) &&
        normalizeOwnerIdentity(choice.target.source) !== choice.slot[0][2]) ||
      (choice.slot[1] === 'feature-cantrip' &&
        (!hasSavedSelectedFeatureSpellOwner(character, choice.slot) ||
          choice.policy !== 'default')) ||
      (choice.slot[1] === 'class-spellbook-specialty' && choice.policy !== 'default') ||
      ((getSavantSpellbookGain(choice.slot) || getBardLoreSpellRule(choice.slot)) &&
        (choice.policy !== 'default' ||
          (getManagedClassSpellOwnerEntry(choice.slot, character.classProgression)?.levels ?? 0) <
            choice.slot[3])) ||
      !Number.isSafeInteger(choice.revision) ||
      choice.revision < 1 ||
      choice.revision > (watermark ?? 0) ||
      revisions.has(choice.revision) ||
      !['default', 'ignore-class-list'].includes(choice.policy) ||
      Object.keys(choice).some(
        (key) => !['slot', 'target', 'revision', 'policy', 'prepare'].includes(key),
      ) ||
      Object.keys(choice.target).length !== 2 ||
      !isPlainSpellIdentityPart(choice.target.name) ||
      !isPlainSpellIdentityPart(choice.target.source) ||
      (choice.prepare !== undefined &&
        (choice.prepare !== true || choice.slot[1] !== 'class-spellbook')) ||
      byId.has(id) ||
      logical.has(key)
    )
      invalid.push(['managedClassSpellChoices', index])
    byId.set(id, choice)
    logical.add(key)
    revisions.add(choice.revision)
  })

  const profiles = character.spells.spellProfiles
  const parentProfiles = new Set<string>()
  profiles.forEach((profile, index) => {
    if (profile.type !== 'class') return
    const path: Path = ['spells', 'spellProfiles', index]
    const name = normalizeOwnerIdentity(profile.className)
    const source = normalizeOwnerIdentity(profile.classSource)
    const parent = JSON.stringify([name, source])
    if (
      !name ||
      !source ||
      profile.id !== `class:${profile.className}|${profile.classSource}` ||
      parentProfiles.has(parent)
    )
      invalid.push(path)
    parentProfiles.add(parent)
    const entry = character.classProgression.find(
      (row) =>
        normalizeOwnerIdentity(row.name) === name && normalizeOwnerIdentity(row.source) === source,
    ) ?? { name: profile.className ?? '', source: profile.classSource ?? '', levels: 1 }
    const { mode } = getClassSpellProfilePolicy(entry)
    const materialized = choices.filter(
      (choice) =>
        isManagedClassSpellProfile(choice.slot, profile) &&
        (character.provenance.spells[getSpellNameKey(choice.target.name)] ?? []).filter((tag) =>
          matchesManagedClassSpellTag(choice, getSpellNameKey(choice.target.name), tag),
        ).length === 1,
    )
    for (const field of [
      'cantrips',
      'spellsKnown',
      'preparedSpells',
      'fixedSpells',
      'alwaysPreparedSpells',
    ] as const) {
      const values = profile[field] ?? []
      const seen = new Set<string>()
      values.forEach((reference, member) => {
        const key = getSpellReferenceKey(reference)
        if (!isPlainSpellReference(reference) || seen.has(key))
          invalid.push([...path, field, member])
        seen.add(key)
        if (field === 'fixedSpells' || field === 'alwaysPreparedSpells') return
        const fixed = isIndependentFixedClassSpell(profile, reference)
        const owned = materialized.filter(
          (choice) =>
            getSpellReferenceKey(choice.target.name, choice.target.source) === key &&
            (field === 'cantrips'
              ? choice.slot[1] === 'class-cantrip' ||
                choice.slot[1] === 'feature-cantrip' ||
                isClassicMagicalSecretsSlot(choice.slot) ||
                !!getBardLoreSpellRule(choice.slot)
              : field === 'spellsKnown'
                ? choice.slot[1] === 'class-known' ||
                  choice.slot[1] === 'class-spellbook' ||
                  choice.slot[1] === 'class-arcanum'
                : choice.slot[1] === 'class-spellbook' && choice.prepare === true),
        )
        if (!fixed && !(field === 'preparedSpells' && mode === 'daily') && owned.length < 1)
          invalid.push([...path, field, member])
      })
    }
    if (
      profile.cantrips.some((reference) =>
        profile.spellsKnown.some((known) => getSpellNameKey(known) === getSpellNameKey(reference)),
      )
    )
      invalid.push(path)
  })

  for (const [name, tags] of Object.entries(character.provenance.spells)) {
    tags.forEach((tag, index) => {
      const path: Path = ['provenance', 'spells', name, index]
      if (!isManagedClassSpellTag(tag)) {
        // Current numeric acquisitions have one protocol; old class-choice tags cannot bypass it.
        if (
          (tag.sourceType === 'class' || tag.sourceType === 'subclass') &&
          tag.grantType === 'choice'
        )
          invalid.push(path)
        return
      }
      const choice = byId.get(tag.grantVariant ?? '')
      const matchingProfiles = choice
        ? profiles.filter((profile) => isManagedClassSpellProfile(choice.slot, profile))
        : []
      const target = choice && getSpellReferenceKey(choice.target.name, choice.target.source)
      const fields =
        choice && (isClassicMagicalSecretsSlot(choice.slot) || getBardLoreSpellRule(choice.slot))
          ? (['cantrips', 'spellsKnown'] as const)
          : choice?.slot[1] === 'class-cantrip' || choice?.slot[1] === 'feature-cantrip'
            ? (['cantrips'] as const)
            : (['spellsKnown'] as const)
      if (
        !choice ||
        choice.slot[1] === 'class-spellbook-specialty' ||
        name !== getSpellNameKey(name) ||
        !isPlainSpellIdentityPart(name) ||
        !matchesManagedClassSpellTag(choice, name, tag) ||
        tags.filter((other) => other.grantVariant === tag.grantVariant).length !== 1 ||
        matchingProfiles.length !== 1 ||
        fields
          .flatMap((field) => matchingProfiles[0][field])
          .filter((reference) => getSpellReferenceKey(reference) === target).length !== 1
      )
        invalid.push(path)
    })
  }

  const auditForeign = (tag: SourceTag, path: Path) => {
    if (isManagedClassSpellTag(tag)) invalid.push(path)
  }
  // Format13 has one Class-owned Warrior setup protocol. Ordinary/Bonus/fixed feat owners remain
  // independent; old-format originals are exported by the existing incompatible-record path.
  for (const [index, owner] of (character.classFeatChoices ?? []).entries())
    for (const [featIndex, feat] of owner.feats.entries())
      if (
        getClassFeatureSpellSemantics('feat', feat.name, feat.source) &&
        feat.options?.spells?.length
      )
        invalid.push(['classFeatChoices', index, 'feats', featIndex, 'options', 'spells'])
  for (const [domain, values] of Object.entries(character.provenance.proficiencies))
    for (const [name, tags] of Object.entries(values as Record<string, SourceTag[]>))
      tags.forEach((tag, index) => {
        auditForeign(tag, ['provenance', 'proficiencies', domain, name, index])
      })
  for (const domain of ['features', 'feats', 'equipment'] as const)
    for (const [name, tags] of Object.entries(character.provenance[domain]))
      tags.forEach((tag, index) => {
        auditForeign(tag, ['provenance', domain, name, index])
      })
  character.provenance.abilityBonuses.forEach((row, index) => {
    auditForeign(row.sourceTag, ['provenance', 'abilityBonuses', index])
  })
  character.provenance.choices.forEach((row, index) => {
    auditForeign(row.sourceTag, ['provenance', 'choices', index])
  })
  return invalid
}
