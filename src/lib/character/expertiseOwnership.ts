import { normalizeKey } from '@/lib/provenance/normalization'
import type { CharacterCommandResult } from './commands/commandResult'

/** Expertise owners expire with their materialized selection, including proficiency loss. */
export function reconcileExpertiseOwnership<T extends CharacterCommandResult>(result: T): T {
  const proficiencies = result.characterPatch.proficiencies
  const owners = result.provenanceUpdate.proficiencies.expertise
  if (!proficiencies || !owners) return result
  const active = new Set(proficiencies.expertise.map(normalizeKey))
  const retained = Object.fromEntries(Object.entries(owners).filter(([skill]) => active.has(skill)))
  if (Object.keys(retained).length === Object.keys(owners).length) return result
  return {
    ...result,
    provenanceUpdate: {
      ...result.provenanceUpdate,
      proficiencies: { ...result.provenanceUpdate.proficiencies, expertise: retained },
    },
  }
}
