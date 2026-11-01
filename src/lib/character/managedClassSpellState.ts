import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { isIndependentFixedClassSpell } from '@/lib/schema/managedClassSpellValidation'
import type { Character } from '@/types/character'
import type { ManagedClassSpellChoice } from '@/types/classCasting'
import {
  isManagedClassSpellProfile,
  isManagedClassSpellTag,
  managedClassSpellId,
} from './managedClassSpellIdentity'

/** Source-free inverse for precisely addressed ownership; every other saved relation is retained. */
export function removeManagedClassSpellMaterialization(
  character: Character,
  removed: readonly ManagedClassSpellChoice[],
): Character {
  const ids = new Set(removed.map((choice) => managedClassSpellId(choice.slot)))
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    const targets = removed.filter((choice) => isManagedClassSpellProfile(choice.slot, profile))
    if (!targets.length) return profile
    const keep = (reference: string) =>
      isIndependentFixedClassSpell(profile, reference) ||
      !targets.some(
        (choice) =>
          getSpellReferenceKey(choice.target.name, choice.target.source) ===
          getSpellReferenceKey(reference),
      )
    return {
      ...profile,
      cantrips: profile.cantrips.filter(keep),
      spellsKnown: profile.spellsKnown.filter(keep),
      preparedSpells: profile.preparedSpells.filter(keep),
    }
  })
  const spells = Object.fromEntries(
    Object.entries(character.provenance.spells).flatMap(([name, tags]) => {
      const kept = tags.filter((tag) => !tag.grantVariant || !ids.has(tag.grantVariant))
      return kept.length ? [[name, kept.length === tags.length ? tags : kept]] : []
    }),
  )
  return {
    ...character,
    spells: { ...character.spells, spellProfiles },
    provenance: { ...character.provenance, spells },
  }
}

/** Context-free baseline: saved numeric rows/tags never authorize a mechanical benefit. */
export function stripManagedClassSpellState(character: Character): Character {
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    if (profile.type !== 'class') return profile
    const keep = (reference: string) => isIndependentFixedClassSpell(profile, reference)
    const cantrips = profile.cantrips.filter(keep)
    const spellsKnown = profile.spellsKnown.filter(keep)
    const preparedSpells = profile.preparedSpells.filter(keep)
    return cantrips.length === profile.cantrips.length &&
      spellsKnown.length === profile.spellsKnown.length &&
      preparedSpells.length === profile.preparedSpells.length
      ? profile
      : { ...profile, cantrips, spellsKnown, preparedSpells }
  })
  let changed = false
  const spells = Object.fromEntries(
    Object.entries(character.provenance.spells).flatMap(([name, tags]) => {
      const kept = tags.filter((tag) => !isManagedClassSpellTag(tag))
      if (kept.length !== tags.length) changed = true
      return kept.length ? [[name, kept.length === tags.length ? tags : kept]] : []
    }),
  )
  if (
    !changed &&
    spellProfiles.every((profile, index) => profile === character.spells.spellProfiles[index])
  )
    return character
  return {
    ...character,
    spells: { ...character.spells, spellProfiles },
    provenance: changed ? { ...character.provenance, spells } : character.provenance,
  }
}
