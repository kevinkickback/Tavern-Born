import { getManagedClassSpellRule } from '@/lib/5etools/classCastingRules'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { SpellSourceTag } from '@/lib/provenance/types'
import type { CharacterClassEntry, SpellProfile } from '@/types/character'
import type { ManagedClassSpellChoice, ManagedClassSpellSlot } from '@/types/classCasting'

const MANAGED_CLASS_SPELL_PREFIX = 'class-spell-choice:'
export const isManagedClassSpellTag = (tag: { grantVariant?: string }) =>
  tag.grantVariant?.startsWith(MANAGED_CLASS_SPELL_PREFIX) === true
export const isPlainSpellIdentityPart = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && !/[|#{}]/u.test(value)
export const isPlainSpellReference = (reference: string) => {
  const parts = reference.split('|')
  return parts.length === 2 && parts.every(isPlainSpellIdentityPart)
}
export const managedClassSpellId = (slot: ManagedClassSpellSlot) =>
  MANAGED_CLASS_SPELL_PREFIX + encodeURIComponent(JSON.stringify(slot))

export function decodeManagedClassSpellId(value: string): ManagedClassSpellSlot | undefined {
  if (!value.startsWith(MANAGED_CLASS_SPELL_PREFIX)) return undefined
  try {
    const slot = JSON.parse(decodeURIComponent(value.slice(MANAGED_CLASS_SPELL_PREFIX.length)))
    return getManagedClassSpellRule(slot) && managedClassSpellId(slot) === value ? slot : undefined
  } catch {
    return undefined
  }
}

export function isManagedClassSpellProfile(slot: ManagedClassSpellSlot, profile: SpellProfile) {
  return (
    profile.type === 'class' &&
    normalizeOwnerIdentity(profile.className) === slot[0][1] &&
    normalizeOwnerIdentity(profile.classSource) === slot[0][2]
  )
}

export function getManagedClassSpellOwnerEntry(
  slot: ManagedClassSpellSlot,
  entries: readonly CharacterClassEntry[],
) {
  const owner = slot[0]
  const found = entries.filter(
    (entry) =>
      normalizeOwnerIdentity(entry.name) === owner[1] &&
      normalizeOwnerIdentity(entry.source) === owner[2] &&
      (owner[0] === 'class' ||
        (normalizeOwnerIdentity(entry.subclass) === owner[3] &&
          normalizeOwnerIdentity(entry.subclassSource) === owner[4])),
  )
  return found.length === 1 ? found[0] : undefined
}

export function makeManagedClassSpellTag(
  choice: ManagedClassSpellChoice,
  entry?: CharacterClassEntry,
): SpellSourceTag {
  const [owner] = choice.slot
  const name = owner[0] === 'class' ? (entry?.name ?? owner[1]) : (entry?.subclass ?? owner[3])
  const source =
    owner[0] === 'class' ? (entry?.source ?? owner[2]) : (entry?.subclassSource ?? owner[4])
  return {
    ...makeSourceTag(owner[0], name, 'choice', source),
    grantVariant: managedClassSpellId(choice.slot),
    grantSource: choice.target.source,
    spellGrantedAtLevel: choice.slot[3],
    spellAttributionMode: 'exact',
  }
}

export function matchesManagedClassSpellTag(
  choice: ManagedClassSpellChoice,
  name: string,
  tag: SpellSourceTag,
) {
  const [owner] = choice.slot
  return (
    tag.grantVariant === managedClassSpellId(choice.slot) &&
    tag.sourceType === owner[0] &&
    normalizeOwnerIdentity(tag.sourceName) === (owner[0] === 'class' ? owner[1] : owner[3]) &&
    normalizeOwnerIdentity(tag.sourceRef) === (owner[0] === 'class' ? owner[2] : owner[4]) &&
    tag.label === tag.sourceName &&
    tag.grantType === 'choice' &&
    tag.spellGrantedAtLevel === choice.slot[3] &&
    tag.spellAttributionMode === 'exact' &&
    !!tag.grantSource &&
    isPlainSpellIdentityPart(tag.grantSource) &&
    getSpellReferenceKey(name, tag.grantSource) ===
      getSpellReferenceKey(choice.target.name, choice.target.source)
  )
}
