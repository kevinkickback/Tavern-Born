import { getBardLoreSpellRule } from '@/lib/5etools/bardSpellSources'
import { getClericArcanaSpellRule } from '@/lib/5etools/clericArcanaSpells'
import { isArcaneDabblerSlot } from '@/lib/5etools/mysticArcaneDabbler'
import { isSelectedInvocationRitualSlot } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { isIndependentFixedClassSpell } from '@/lib/schema/managedClassSpellValidation'
import type { Character } from '@/types/character'
import type { ManagedClassSpellChoice } from '@/types/classCasting'
import {
  isManagedClassSpellProfile,
  isManagedClassSpellTag,
  managedClassSpellId,
} from './managedClassSpellIdentity'
import {
  getSavedSelectedFeatureSpellProducers,
  hasSavedSelectedFeatureSpellOwner,
} from './selectedFeatureSpellOwnership'

const automaticallyPrepared = (choice: ManagedClassSpellChoice) =>
  getBardLoreSpellRule(choice.slot)?.source === 'xphb' ||
  !!getClericArcanaSpellRule(choice.slot) ||
  isArcaneDabblerSlot(choice.slot) ||
  isSelectedInvocationRitualSlot(choice.slot)

const choiceReference = (choice: ManagedClassSpellChoice) =>
  getSpellReferenceKey(choice.target.name, choice.target.source)

/** Source-free inverse for precisely addressed ownership; every other saved relation is retained. */
export function removeManagedClassSpellMaterialization(
  character: Character,
  removed: readonly ManagedClassSpellChoice[],
): Character {
  const materialized = removed.filter((choice) => choice.slot[1] !== 'class-spellbook-specialty')
  if (!materialized.length) return character
  const ids = new Set(materialized.map((choice) => managedClassSpellId(choice.slot)))
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    const targets = materialized.filter((choice) =>
      isManagedClassSpellProfile(choice.slot, profile),
    )
    if (!targets.length) return profile
    const retained = (character.managedClassSpellChoices ?? []).filter((choice) => {
      const id = managedClassSpellId(choice.slot)
      return (
        !ids.has(id) &&
        isManagedClassSpellProfile(choice.slot, profile) &&
        (character.provenance.spells[getSpellNameKey(choice.target.name)] ?? []).some(
          (tag) => tag.grantVariant === id,
        )
      )
    })
    const retainedReferences = new Set(retained.map(choiceReference))
    const retainedAutomatic = new Set(retained.filter(automaticallyPrepared).map(choiceReference))
    const automatic = new Set(targets.filter(automaticallyPrepared).map(choiceReference))
    const alwaysPreparedSpells = automatic.size
      ? profile.alwaysPreparedSpells?.filter(
          (reference) =>
            !automatic.has(getSpellReferenceKey(reference)) ||
            retainedAutomatic.has(getSpellReferenceKey(reference)) ||
            profile.fixedSpells?.some(
              (fixed) => getSpellReferenceKey(fixed) === getSpellReferenceKey(reference),
            ),
        )
      : profile.alwaysPreparedSpells
    const independent =
      alwaysPreparedSpells === profile.alwaysPreparedSpells
        ? profile
        : { ...profile, alwaysPreparedSpells }
    const keep = (reference: string) =>
      isIndependentFixedClassSpell(independent, reference) ||
      retainedReferences.has(getSpellReferenceKey(reference)) ||
      !targets.some(
        (choice) =>
          getSpellReferenceKey(choice.target.name, choice.target.source) ===
          getSpellReferenceKey(reference),
      )
    return {
      ...profile,
      alwaysPreparedSpells,
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

/** Intentional selected-producer loss retires empty and occupied editor lifetimes without sources. */
export function retainSelectedFeatureSpellIntent(before: Character, next: Character): Character {
  const current = getSavedSelectedFeatureSpellProducers(next)
  const lost = [...getSavedSelectedFeatureSpellProducers(before)].some((key) => !current.has(key))
  const removed = (next.managedClassSpellChoices ?? []).filter(
    (choice) =>
      (choice.slot[1] === 'feature-cantrip' || isSelectedInvocationRitualSlot(choice.slot)) &&
      !hasSavedSelectedFeatureSpellOwner(next, choice.slot),
  )
  if (!lost && !removed.length) return next
  const stripped = removeManagedClassSpellMaterialization(next, removed)
  const ids = new Set(removed.map((choice) => managedClassSpellId(choice.slot)))
  return {
    ...stripped,
    ...(removed.length
      ? {
          managedClassSpellChoices: next.managedClassSpellChoices?.filter(
            (choice) => !ids.has(managedClassSpellId(choice.slot)),
          ),
        }
      : {}),
    managedClassSpellRevision:
      next.managedClassSpellRevision !== before.managedClassSpellRevision
        ? next.managedClassSpellRevision
        : Math.min((next.managedClassSpellRevision ?? 0) + 1, Number.MAX_SAFE_INTEGER),
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
