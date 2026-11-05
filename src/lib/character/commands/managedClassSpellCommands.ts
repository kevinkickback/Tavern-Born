import { isManagedClassSpellSlot } from '@/lib/5etools/classCastingRules'
import { getSavantSpellbookGain } from '@/lib/5etools/savantSpellbookRules'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { preserveDailyClassSpellIntent } from '@/lib/character/dailyClassSpells'
import {
  getManagedClassSpellOwnerEntry,
  isManagedClassSpellProfile,
  isPlainSpellIdentityPart,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { removeManagedClassSpellMaterialization } from '@/lib/character/managedClassSpellState'
import {
  type ManagedClassSpellContext,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { getOptionalClassFixedSpellNamesAtGain } from '@/lib/character/optionalClassFixedSpells'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import {
  getInvalidManagedClassSpellPaths,
  isIndependentFixedClassSpell,
} from '@/lib/schema/managedClassSpellValidation'
import type { Character, CharacterClassEntry } from '@/types/character'
import type {
  ClassSpellSelectionPolicy,
  ManagedClassSpellChoice,
  ManagedClassSpellSlot,
} from '@/types/classCasting'
import type { CharacterCommandResult } from './commandResult'

export interface ManagedClassSpellRequest {
  slot: ManagedClassSpellSlot
  expected: Pick<ManagedClassSpellChoice, 'target' | 'revision'> | null
  /** Captured allocation watermark when an empty slot opened; required for a new Add. */
  expectedEmptyRevision?: number
  /** Omitted target is an explicit Clear; its inverse needs no current rules. */
  target?: ManagedClassSpellChoice['target']
  policy?: ClassSpellSelectionPolicy
  prepare?: boolean
}

/** One addressed edit uses the same atomic protocol as a dialog's complete Finish. */
export function setManagedClassSpellChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  request: ManagedClassSpellRequest,
  context?: ManagedClassSpellContext,
): CharacterCommandResult {
  return setManagedClassSpellChoicesCommand(character, ledger, [request], context)
}

/** Validate every captured lifetime against the latest base before committing the complete set. */
export function setManagedClassSpellChoicesCommand(
  character: Character,
  ledger: ProvenanceLedger,
  requests: readonly ManagedClassSpellRequest[],
  context?: ManagedClassSpellContext,
): CharacterCommandResult {
  const unchanged = { characterPatch: {}, provenanceUpdate: ledger }
  if (!requests.length) return unchanged
  character = { ...character, provenance: ledger }
  if (getInvalidManagedClassSpellPaths(character).length)
    throw new RangeError(
      'The saved class spell choices are invalid. Review the character before editing.',
    )
  const choices = character.managedClassSpellChoices ?? []
  const watermark = character.managedClassSpellRevision ?? 0
  const addressed = new Set<string>()
  const edits = requests
    .map((request) => {
      if (!isManagedClassSpellSlot(request.slot))
        throw new RangeError('This class spell slot is invalid.')
      if (
        (request.slot[1] === 'feature-cantrip' ||
          request.slot[1] === 'class-spellbook-specialty') &&
        request.target &&
        request.policy !== 'default'
      )
        throw new RangeError('Feature spell choices must use their declared spell list.')
      if (getSavantSpellbookGain(request.slot) && request.target && request.policy !== 'default')
        throw new RangeError('Evocation Savant choices must use the feature’s Wizard spell list.')
      const id = managedClassSpellId(request.slot)
      if (addressed.has(id)) throw new RangeError('A spell choice was addressed more than once.')
      addressed.add(id)
      const occupied = choices.find((choice) => managedClassSpellId(choice.slot) === id)
      if (
        request.expected === null &&
        request.target &&
        request.expectedEmptyRevision !== watermark
      )
        throw new RangeError('The empty spell choice changed. Reopen it before confirming.')
      if (
        request.expected === null
          ? !!occupied
          : !occupied ||
            request.expected.revision !== occupied.revision ||
            getSpellReferenceKey(request.expected.target.name, request.expected.target.source) !==
              getSpellReferenceKey(occupied.target.name, occupied.target.source)
      )
        throw new RangeError('This spell choice changed. Reopen it before confirming.')
      if (request.prepare !== undefined && typeof request.prepare !== 'boolean')
        throw new RangeError('Preparation must be an explicit choice.')
      if (
        request.target &&
        (Object.keys(request.target).length !== 2 ||
          !isPlainSpellIdentityPart(request.target.name) ||
          !isPlainSpellIdentityPart(request.target.source) ||
          !['default', 'ignore-class-list'].includes(request.policy ?? ''))
      )
        throw new RangeError('Choose an exact spell printing and an explicit class-list policy.')
      const prepare =
        request.prepare === undefined ? occupied?.prepare : request.prepare || undefined
      if (prepare && request.slot[1] !== 'class-spellbook')
        throw new RangeError('Only learned spellbook spells have preparation requests here.')
      const sameTarget =
        !!occupied &&
        !!request.target &&
        getSpellReferenceKey(request.target.name, request.target.source) ===
          getSpellReferenceKey(occupied.target.name, occupied.target.source)
      const noop = !request.target
        ? !occupied
        : sameTarget && request.policy === occupied?.policy && prepare === occupied?.prepare
      const withdraw =
        !!occupied?.prepare && !prepare && sameTarget && request.policy === occupied.policy
      return { request, id, occupied, prepare, sameTarget, noop, withdraw }
    })
    .filter((edit) => !edit.noop)
  if (!edits.length) return unchanged
  const allocations = edits.filter((edit) => edit.request.target).length
  if (allocations > Number.MAX_SAFE_INTEGER - watermark)
    throw new RangeError(
      'The spell choice revision limit has been reached; selections can still be cleared.',
    )
  const removed = edits.flatMap((edit) => (edit.occupied && !edit.withdraw ? [edit.occupied] : []))
  const inverse = removeManagedClassSpellMaterialization(character, removed)
  // Withdrawing a preparation request retains its learned membership/tag even without current sources.
  const withdrawn = edits.filter((edit) => edit.withdraw)
  const spellProfiles = inverse.spells.spellProfiles.map((profile) => {
    const withdrawals = withdrawn.filter((edit) =>
      isManagedClassSpellProfile(edit.request.slot, profile),
    )
    if (!withdrawals.length) return profile
    return {
      ...profile,
      preparedSpells: profile.preparedSpells.filter(
        (reference) =>
          isIndependentFixedClassSpell(profile, reference) ||
          !withdrawals.some(
            (edit) =>
              edit.occupied &&
              getSpellReferenceKey(edit.occupied.target.name, edit.occupied.target.source) ===
                getSpellReferenceKey(reference),
          ),
      ),
    }
  })
  const changed = new Set(edits.map((edit) => edit.id))
  const next = choices.filter((choice) => !changed.has(managedClassSpellId(choice.slot)))
  let revision = watermark
  for (const edit of edits) {
    if (!edit.request.target) continue
    const policy = edit.request.policy
    if (policy !== 'default' && policy !== 'ignore-class-list')
      throw new RangeError('Choose a class-list policy.')
    next.push({
      slot: structuredClone(edit.request.slot),
      target: edit.sameTarget && edit.occupied ? edit.occupied.target : { ...edit.request.target },
      revision: ++revision,
      policy,
      ...(edit.prepare ? { prepare: true } : {}),
    })
  }
  const proposed: Character = {
    ...inverse,
    managedClassSpellChoices: next,
    ...(allocations ? { managedClassSpellRevision: revision } : {}),
    spells: { ...inverse.spells, spellProfiles },
  }
  if (getInvalidManagedClassSpellPaths(proposed).length)
    throw new RangeError('A class already owns that spell choice or its slot is invalid.')
  const grants = edits.filter((edit) => edit.request.target && !edit.withdraw)
  const projected = grants.length
    ? projectManagedClassSpellState(
        proposed,
        context,
        proposed,
        new Set(grants.filter((edit) => !edit.sameTarget).map((edit) => edit.id)),
      )
    : { character: proposed, statuses: [] }
  for (const edit of grants) {
    if (
      edit.request.slot[1] !== 'feature-cantrip' &&
      edit.request.slot[1] !== 'class-spellbook-specialty' &&
      !edit.sameTarget &&
      edit.request.target &&
      getOptionalClassFixedSpellNamesAtGain(character, edit.request.slot, context?.catalogs).has(
        getSpellNameKey(edit.request.target.name),
      )
    )
      throw new RangeError(
        'Choose another spell; this class already grants that spell at this level.',
      )
    const status = projected.statuses.find(
      (row) => managedClassSpellId(row.choice.slot) === edit.id,
    )
    if (!status?.active)
      throw new RangeError(status?.reason ?? 'The current rules cannot verify this spell choice.')
    if (edit.prepare && !edit.occupied?.prepare && !status.prepared)
      throw new RangeError(
        'This learned spell cannot be prepared within the current preparation limit.',
      )
  }
  if (getInvalidManagedClassSpellPaths(projected.character).length)
    throw new RangeError('The resulting spell ownership could not be verified.')
  return {
    characterPatch: {
      managedClassSpellChoices: next,
      ...(allocations ? { managedClassSpellRevision: revision } : {}),
      spells: preserveDailyClassSpellIntent(character, projected.character).spells,
    },
    provenanceUpdate: projected.character.provenance,
  }
}
/** Retire earned slot lifetimes independently of saved choices or current source availability. */
export function retainEarnedManagedClassSpells(
  character: Character,
  nextProgression: CharacterClassEntry[],
): Character {
  const earnedIds = (progression: CharacterClassEntry[]) =>
    new Set(
      progression
        .flatMap((entry) => getManagedClassSpellSlots(entry))
        .filter((slot) => getManagedClassSpellOwnerEntry(slot, progression))
        .map(managedClassSpellId),
    )
  const nextIds = earnedIds(nextProgression)
  const lostSlot = [...earnedIds(character.classProgression)].some((id) => !nextIds.has(id))
  const removed = (character.managedClassSpellChoices ?? []).filter((choice) =>
    choice.slot[1] === 'feature-cantrip'
      ? !getManagedClassSpellOwnerEntry(choice.slot, nextProgression) ||
        !nextProgression.some(
          (entry) =>
            getManagedClassSpellOwnerEntry(choice.slot, [entry]) && entry.levels >= choice.slot[3],
        )
      : !nextIds.has(managedClassSpellId(choice.slot)),
  )
  const progressed = { ...character, classProgression: nextProgression }
  if (!lostSlot && !removed.length) return progressed
  const ids = new Set(removed.map((choice) => managedClassSpellId(choice.slot)))
  const inverse = removed.length
    ? removeManagedClassSpellMaterialization(progressed, removed)
    : progressed
  return {
    ...inverse,
    ...(removed.length
      ? {
          managedClassSpellChoices: character.managedClassSpellChoices?.filter(
            (choice) => !ids.has(managedClassSpellId(choice.slot)),
          ),
        }
      : {}),
    // At exhaustion new allocations already reject; removal must remain available without wrapping.
    managedClassSpellRevision: Math.min(
      (character.managedClassSpellRevision ?? 0) + 1,
      Number.MAX_SAFE_INTEGER,
    ),
  }
}
