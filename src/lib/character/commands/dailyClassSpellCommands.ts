import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { getClassPreparationLimit } from '@/lib/calculations/preparedSpellLimits'
import { formatSpellReference, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  getClassSpellProfileMetadata,
  toClassProfileId,
} from '@/lib/calculations/spellProfiles.constants'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import { getDailyClassSpellAccess, getDailyClassSpellEntry } from '../dailyClassSpells'
import { isPlainSpellIdentityPart } from '../managedClassSpellIdentity'
import { type ManagedClassSpellContext, projectManagedClassSpellState } from '../managedClassSpells'
import type { CharacterCommandResult } from './commandResult'

/** Desired exact daily intent; withdrawal is source-free, a new benefit requires current authority. */
export function setDailyClassSpellPreparedCommand(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  reference: string,
  prepared: boolean,
  context?: ManagedClassSpellContext,
): CharacterCommandResult {
  const parts = reference.split('|')
  if (parts.length !== 2 || !parts.every(isPlainSpellIdentityPart))
    throw new RangeError('Choose an exact spell printing.')
  const unchanged = { characterPatch: {}, provenanceUpdate: ledger }
  const profiles = character.spells.spellProfiles
  const matchingProfiles = profiles.filter((row) => row.id === profileId)
  const [saved] = matchingProfiles
  const owner = character.classProgression.find(
    (entry) => toClassProfileId(entry.name, entry.source) === profileId,
  )
  if (!owner || matchingProfiles.length > 1 || (saved && saved.type !== 'class'))
    throw new RangeError('Choose a daily class spell profile.')
  const profile = saved ?? {
    ...getClassSpellProfileMetadata(owner),
    cantrips: [],
    spellsKnown: [],
    preparedSpells: [],
  }
  if (!getDailyClassSpellEntry(character, profile))
    throw new RangeError('Learned spell preparation must address its class spell choice.')
  if (
    profiles.some(
      (row) =>
        row.id !== profileId &&
        row.type === 'class' &&
        norm(row.className) === norm(owner.name) &&
        norm(row.classSource) === norm(owner.source),
    )
  )
    throw new RangeError('Choose a daily class spell profile.')
  const key = getSpellReferenceKey(reference)
  const selected = profile.preparedSpells.some((row) => getSpellReferenceKey(row) === key)
  if (selected === prepared) return unchanged
  const updated = {
    ...profile,
    preparedSpells: prepared
      ? [...profile.preparedSpells, formatSpellReference(reference)]
      : profile.preparedSpells.filter((target) => getSpellReferenceKey(target) !== key),
  }
  const spellProfiles = saved
    ? profiles.map((row) => (row === saved ? updated : row))
    : [...profiles, updated]
  const proposed = {
    ...character,
    provenance: ledger,
    spells: { ...character.spells, spellProfiles },
  }
  if (!prepared) return { characterPatch: { spells: proposed.spells }, provenanceUpdate: ledger }
  const projected = projectManagedClassSpellState(proposed, context)
  const status = projected.dailyStatuses.find(
    (row) => row.profileId === profileId && getSpellReferenceKey(row.reference) === key,
  )
  if (!status?.active)
    throw new RangeError(status?.reason ?? 'The current rules cannot verify this prepared spell.')
  const current = projected.character.spells.spellProfiles.find((row) => row.id === profileId)
  if (!current) throw new RangeError('The class spell profile changed. Reopen the selection.')
  const alwaysPrepared = new Set(
    current.alwaysPreparedSpells?.map((target) => getSpellReferenceKey(target)),
  )
  if (alwaysPrepared.has(key))
    throw new RangeError('This spell is already always prepared for this class.')
  const access = getDailyClassSpellAccess(proposed, current, context)
  const ability = access && normalizeAbilityName(access.effective.spellcastingAbility ?? '')
  const score = ability && context?.abilityScores?.[ability]
  const capacity =
    access && typeof score === 'number'
      ? getClassPreparationLimit(
          access.rule.preparation,
          access.entry.levels,
          getAbilityModifier(score),
        )
      : null
  const count = new Set(
    current.preparedSpells
      .filter((target) => !alwaysPrepared.has(getSpellReferenceKey(target)))
      .map((target) => getSpellReferenceKey(target)),
  ).size
  if (capacity === null || count > capacity)
    throw new RangeError('The class preparation limit has been reached.')
  return {
    characterPatch: { spells: proposed.spells },
    provenanceUpdate: ledger,
  }
}
