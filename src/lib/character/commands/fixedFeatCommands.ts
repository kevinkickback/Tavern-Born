import { getFixedFeatOptionKey } from '@/lib/featGrants'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { reconcileExpertiseOwnership } from './expertiseCommands'
import { applyCharacterCommandResult } from './featCommandSupport'
import { retractFeatOptionsCommand } from './featCommands'

function fixedIdentities(ledger: ProvenanceLedger): Set<string> {
  return new Set(
    Object.entries(ledger.feats).flatMap(([name, tags]) =>
      tags
        .filter((tag) => tag.grantType === 'fixed')
        .map((tag) => getFixedFeatOptionKey(name, tag.sourceRef ?? '', tag.grantVariant)),
    ),
  )
}

/** Reconcile after all replacement owners have been applied, not midway through removal. */
export function reconcileFixedFeatOptionsCommand(
  character: Character,
  previousLedger: ProvenanceLedger,
  result: CharacterCommandResult,
): CharacterCommandResult {
  const previous = fixedIdentities(previousLedger)
  const retained = fixedIdentities(result.provenanceUpdate)
  let working = applyCharacterCommandResult(character, result)
  const fixedFeatOptions = { ...working.fixedFeatOptions }
  let changed = false
  for (const [key, selections] of Object.entries(fixedFeatOptions)) {
    if (!previous.has(key) || retained.has(key)) continue
    const [name, source, variant] = key.split('|')
    working = applyCharacterCommandResult(
      working,
      retractFeatOptionsCommand(
        working,
        working.provenance,
        { name, source, grantVariant: variant || undefined, fixedGrant: true },
        selections,
      ),
    )
    delete fixedFeatOptions[key]
    changed = true
  }
  if (!changed) return reconcileExpertiseOwnership(result)
  return reconcileExpertiseOwnership({
    characterPatch: {
      ...result.characterPatch,
      fixedFeatOptions,
      spells: working.spells,
      proficiencies: working.proficiencies,
    },
    provenanceUpdate: working.provenance,
  })
}
