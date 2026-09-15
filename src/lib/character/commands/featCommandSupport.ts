import { normalizeKey } from '@/lib/provenance/normalization'
import type {
  ChoiceDomain,
  ChoiceRecord,
  ProvenanceLedger,
  SourceTag,
} from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { isSameGrantSource } from './featCommandIdentity'

export function applyCharacterCommandResult(
  character: Character,
  result: CharacterCommandResult,
): Character {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

export function getFeatChoiceSelectedRefs(
  choice: ChoiceRecord,
): NonNullable<ChoiceRecord['selectedRefs']> {
  return choice.selectedRefs ?? choice.selected.map((name) => ({ name }))
}

export function removeChoiceGrant(
  ledger: ProvenanceLedger,
  domain: ChoiceDomain,
  itemName: string,
  sourceTag: SourceTag,
): ProvenanceLedger {
  const normalized = normalizeKey(itemName)
  const map = ledger.proficiencies[domain as keyof typeof ledger.proficiencies] as
    | Record<string, SourceTag[]>
    | undefined
  if (!map) return ledger
  const retained = (map[normalized] ?? []).filter(
    (tag) => !(tag.grantType === 'choice' && isSameGrantSource(tag, sourceTag)),
  )
  const nextMap =
    retained.length > 0
      ? { ...map, [normalized]: retained }
      : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normalized))
  return {
    ...ledger,
    proficiencies: { ...ledger.proficiencies, [domain]: nextMap },
  }
}
