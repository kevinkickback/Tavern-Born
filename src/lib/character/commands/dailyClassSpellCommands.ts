import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { formatSpellReference, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { getPreparedSpellLimit } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import { getDailyClassSpellAccess, preserveDailyClassSpellIntent } from '../dailyClassSpells'
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
  const profile = character.spells.spellProfiles.find((row) => row.id === profileId)
  if (!profile || profile.type !== 'class')
    throw new RangeError('Choose a daily class spell profile.')
  const key = getSpellReferenceKey(reference)
  const selected = profile.preparedSpells.some((row) => getSpellReferenceKey(row) === key)
  // The finite daily policy still applies when its current source is unavailable.
  const policyEntry = character.classProgression.find(
    (entry) =>
      entry.name.trim().toLowerCase() === profile.className?.trim().toLowerCase() &&
      entry.source.trim().toLowerCase() === profile.classSource?.trim().toLowerCase(),
  )
  if (
    !policyEntry ||
    profileId !== toClassProfileId(policyEntry.name, policyEntry.source) ||
    getClassSpellProfilePolicy(policyEntry).mode !== 'daily'
  )
    throw new RangeError('Learned spell preparation must address its class spell choice.')
  if (selected === prepared) return unchanged
  const spellProfiles = character.spells.spellProfiles.map((row) =>
    row.id === profileId
      ? {
          ...row,
          preparedSpells: prepared
            ? [...row.preparedSpells, formatSpellReference(reference)]
            : row.preparedSpells.filter((target) => getSpellReferenceKey(target) !== key),
        }
      : row,
  )
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
  const access = getDailyClassSpellAccess(proposed, current, context)
  const ability = access && normalizeAbilityName(access.effective.spellcastingAbility ?? '')
  const score = ability && context?.abilityScores?.[ability]
  const capacity =
    access && typeof score === 'number'
      ? getPreparedSpellLimit(access.effective, access.entry.levels, getAbilityModifier(score))
      : null
  const count = new Set(
    current.preparedSpells
      .filter(
        (target) =>
          !current.alwaysPreparedSpells?.some(
            (fixed) => getSpellReferenceKey(fixed) === getSpellReferenceKey(target),
          ),
      )
      .map((target) => getSpellReferenceKey(target)),
  ).size
  if (capacity === null || count > capacity)
    throw new RangeError('The class preparation limit has been reached.')
  return {
    characterPatch: { spells: preserveDailyClassSpellIntent(proposed, projected.character).spells },
    provenanceUpdate: projected.character.provenance,
  }
}
