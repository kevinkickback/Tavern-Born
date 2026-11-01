import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export { reconcileExpertiseOwnership } from '../expertiseOwnership'

/** Withdraw only an independent manual grant; class and feat choices use their own owners. */
export function removeManualExpertiseCommand(
  character: Character,
  ledger: ProvenanceLedger,
  skillName: string,
): CharacterCommandResult {
  const key = normalizeKey(skillName)
  const hasExpertise = character.proficiencies.expertise.some(
    (skill) => normalizeKey(skill) === key,
  )
  const expertiseOwners = ledger.proficiencies.expertise ?? {}
  const remaining = (expertiseOwners[key] ?? []).filter(
    (tag) => !(tag.sourceType === 'manual' && tag.sourceName === 'User Choice'),
  )
  if (
    (!hasExpertise && !expertiseOwners[key]?.length) ||
    ((expertiseOwners[key]?.length ?? 0) > 0 && remaining.length === expertiseOwners[key]?.length)
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const provenanceUpdate = {
    ...ledger,
    proficiencies: {
      ...ledger.proficiencies,
      expertise: {
        ...Object.fromEntries(Object.entries(expertiseOwners).filter(([name]) => name !== key)),
        ...(remaining.length ? { [key]: remaining } : {}),
      },
    },
  }
  return {
    characterPatch: {
      proficiencies: {
        ...character.proficiencies,
        expertise:
          remaining.length === 0
            ? character.proficiencies.expertise.filter((skill) => normalizeKey(skill) !== key)
            : character.proficiencies.expertise,
      },
    },
    provenanceUpdate,
  }
}
