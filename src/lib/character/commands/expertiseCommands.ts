import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export { reconcileExpertiseOwnership } from '../expertiseOwnership'

export function toggleExpertiseCommand(
  character: Character,
  ledger: ProvenanceLedger,
  skillName: string,
  adding?: boolean,
): CharacterCommandResult {
  const key = normalizeKey(skillName)
  if (
    ![...character.proficiencies.skills, ...character.proficiencies.tools].some(
      (skill) => normalizeKey(skill) === key,
    )
  ) {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  const hasExpertise = character.proficiencies.expertise.some(
    (skill) => normalizeKey(skill) === key,
  )
  const manual = makeSourceTag('manual', 'User Choice', 'choice')
  const expertiseOwners = ledger.proficiencies.expertise ?? {}
  const removing = adding === false || (adding === undefined && hasExpertise)
  const remaining = (expertiseOwners[key] ?? []).filter(
    (tag) => !(tag.sourceType === manual.sourceType && tag.sourceName === manual.sourceName),
  )
  if (
    removing &&
    (expertiseOwners[key]?.length ?? 0) > 0 &&
    remaining.length === (expertiseOwners[key]?.length ?? 0)
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const provenanceUpdate = removing
    ? {
        ...ledger,
        proficiencies: {
          ...ledger.proficiencies,
          expertise: {
            ...Object.fromEntries(Object.entries(expertiseOwners).filter(([name]) => name !== key)),
            ...(remaining.length ? { [key]: remaining } : {}),
          },
        },
      }
    : addGrant(ledger, 'expertise', key, manual)
  return {
    characterPatch: {
      proficiencies: {
        ...character.proficiencies,
        expertise:
          removing && remaining.length === 0
            ? character.proficiencies.expertise.filter((skill) => normalizeKey(skill) !== key)
            : hasExpertise
              ? character.proficiencies.expertise
              : [...character.proficiencies.expertise, key],
      },
    },
    provenanceUpdate,
  }
}
