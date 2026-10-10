import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { isSpecialSpellGrant } from '@/lib/calculations/spellOwnership'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Character, SpellProfile } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

function selectedTargets(profile: SpellProfile): Set<string> {
  return new Set([
    ...profile.cantrips.map((reference) => getSpellReferenceKey(reference)),
    ...profile.spellsKnown.map((reference) => getSpellReferenceKey(reference)),
    ...profile.preparedSpells.map((reference) => getSpellReferenceKey(reference)),
    ...(profile.choices?.flatMap((choice) =>
      choice.selected.map((reference) => getSpellReferenceKey(reference)),
    ) ?? []),
  ])
}

function isProfileChoiceOwner(
  tag: SpellSourceTag,
  profile: SpellProfile,
  character: Character,
): boolean {
  if (tag.grantType !== 'choice') return false
  if (profile.type === 'special') {
    return isSpecialSpellGrant(tag)
  }
  if (profile.type !== 'class') return false
  const sameOwner = (name: string | undefined, source: string | undefined) =>
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(name) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(source)
  if (tag.sourceType === 'class') return sameOwner(profile.className, profile.classSource)
  if (tag.sourceType !== 'subclass') return false
  const entry = character.classProgression.find(
    (candidate) =>
      normalizeOwnerIdentity(candidate.name) === normalizeOwnerIdentity(profile.className) &&
      normalizeOwnerIdentity(candidate.source) === normalizeOwnerIdentity(profile.classSource),
  )
  return Boolean(entry?.subclass && sameOwner(entry.subclass, entry.subclassSource))
}

/** Remove source-disabled nonracial selections and only their exact owner/target choice tags. */
export function pruneNonracialSpellSelections(
  character: Character,
  ledger: ProvenanceLedger,
  isSpellAllowed: (reference: string) => boolean,
): CharacterCommandResult {
  const removals: Array<{ profile: SpellProfile; targets: Set<string> }> = []
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    if (profile.type === 'racial') return profile
    const fixed = new Set(
      (profile.fixedSpells ?? []).map((reference) => getSpellReferenceKey(reference)),
    )
    const keep = (reference: string) =>
      fixed.has(getSpellReferenceKey(reference)) || isSpellAllowed(reference)
    const cantrips = profile.cantrips.filter(keep)
    const spellsKnown = profile.spellsKnown.filter(keep)
    const preparedSpells = profile.preparedSpells.filter(keep)
    const choices = profile.choices?.map((choice) => ({
      ...choice,
      selected: choice.selected.filter(isSpellAllowed),
    }))
    if (
      cantrips.length === profile.cantrips.length &&
      spellsKnown.length === profile.spellsKnown.length &&
      preparedSpells.length === profile.preparedSpells.length &&
      !choices?.some(
        (choice, index) =>
          choice.selected.length !== (profile.choices?.[index].selected.length ?? 0),
      )
    )
      return profile

    const next = {
      ...profile,
      cantrips,
      spellsKnown,
      preparedSpells,
      ...(choices ? { choices } : {}),
    }
    const remaining = selectedTargets(next)
    removals.push({
      profile,
      targets: new Set([...selectedTargets(profile)].filter((key) => !remaining.has(key))),
    })
    return next
  })
  if (removals.length === 0) return { characterPatch: {}, provenanceUpdate: ledger }

  const spells = Object.fromEntries(
    Object.entries(ledger.spells).flatMap(([name, tags]) => {
      const retained = tags.filter(
        (tag) =>
          !removals.some(
            ({ profile, targets }) =>
              isProfileChoiceOwner(tag, profile, character) &&
              targets.has(getSpellReferenceKey(name, tag.grantSource)),
          ),
      )
      return retained.length ? [[name, retained]] : []
    }),
  )
  return {
    characterPatch: { spells: { ...character.spells, spellProfiles } },
    provenanceUpdate: { ...ledger, spells },
  }
}
