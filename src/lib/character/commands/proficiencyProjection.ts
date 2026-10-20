import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { projectOwnedProficiencies } from '@/lib/character/classProficiencyFoundation'
import { captureFixedProficiencyManualOwners } from '@/lib/character/fixedProficiencyOwnership'
import { addGrant } from '@/lib/provenance/ledger'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

/** One command boundary for ordinary edits and owner transitions; only original values can be captured. */
export function projectProficiencyCommandResult(
  before: Character,
  result: CharacterCommandResult,
  catalogs?: ClassChoiceFeatureCatalogs,
): CharacterCommandResult {
  if (!catalogs) return result
  let next: Character = { ...before, ...result.characterPatch, provenance: result.provenanceUpdate }
  const captured = captureFixedProficiencyManualOwners(
    { ...next, proficiencies: before.proficiencies, provenance: before.provenance },
    catalogs,
  )
  let ledger = next.provenance
  for (const domain of ['skills', 'expertise'] as const)
    for (const value of next.proficiencies[domain]) {
      const name = canonicalProficiencyName(value)
      if (name && !before.provenance.proficiencies[domain]?.[name]?.length) {
        for (const tag of captured.provenance.proficiencies[domain]?.[name] ?? [])
          if (tag.sourceType === 'manual') ledger = addGrant(ledger, domain, name, tag)
      }
    }
  next = projectOwnedProficiencies({ ...next, provenance: ledger }, catalogs).effective
  return {
    characterPatch: { ...result.characterPatch, proficiencies: next.proficiencies },
    provenanceUpdate: next.provenance,
  }
}
