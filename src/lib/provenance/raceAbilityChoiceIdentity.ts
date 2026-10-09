import { normalizeOwnerIdentity } from './normalization'
import type { ChoiceRecord, ProvenanceLedger, SourceTag } from './types'

type AbilityChoiceOwner = Pick<SourceTag, 'sourceType' | 'sourceName' | 'sourceRef'>
type RaceAbilityChoiceRecord = ChoiceRecord & { amount: number }

/** Native block references retain the complete owner and a per-owner numeric ordinal. */
export function makeRaceAbilityChoiceId(owner: AbilityChoiceOwner, ordinal: number): string {
  return `${owner.sourceType}:${encodeURIComponent(normalizeOwnerIdentity(owner.sourceName))}|${encodeURIComponent(normalizeOwnerIdentity(owner.sourceRef))}:abilityBonuses:choose:${ordinal}`
}

/** No opaque, historical, differently encoded or mismatched-owner reference is a current block. */
export function getRaceAbilityChoiceOrdinal(record: ChoiceRecord): number | null {
  const owner = record.sourceTag
  if (
    record.domain !== 'abilityBonuses' ||
    (owner.sourceType !== 'race' && owner.sourceType !== 'subrace') ||
    !normalizeOwnerIdentity(owner.sourceName) ||
    !normalizeOwnerIdentity(owner.sourceRef)
  )
    return null
  const suffix = record.id.slice(record.id.lastIndexOf(':') + 1)
  const ordinal = Number(suffix)
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || String(ordinal) !== suffix) return null
  try {
    return record.id === makeRaceAbilityChoiceId(owner, ordinal) ? ordinal : null
  } catch {
    // Invalid Unicode cannot identify a source-qualified block.
    return null
  }
}

export function isRaceAbilityChoiceRecord(record: ChoiceRecord): record is RaceAbilityChoiceRecord {
  return Number.isInteger(record.amount) && getRaceAbilityChoiceOrdinal(record) !== null
}

/** Completed saves require explicit rules and unique, dense blocks for each represented owner. */
export function getInvalidRaceAbilityChoicePaths(
  ledger: ProvenanceLedger,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const owners = new Map<string, Array<{ ordinal: number; index: number }>>()
  ledger.choices.forEach((record, index) => {
    if (
      record.domain !== 'abilityBonuses' ||
      (record.sourceTag.sourceType !== 'race' && record.sourceTag.sourceType !== 'subrace')
    )
      return
    const ordinal = getRaceAbilityChoiceOrdinal(record)
    if (ordinal === null) paths.push(['choices', index, 'id'])
    else {
      const owner = record.id.slice(0, record.id.lastIndexOf(':'))
      const blocks = owners.get(owner) ?? []
      blocks.push({ ordinal, index })
      owners.set(owner, blocks)
    }
    if (!Number.isInteger(record.amount)) paths.push(['choices', index, 'amount'])
  })
  for (const blocks of owners.values()) {
    blocks
      .sort((a, b) => a.ordinal - b.ordinal)
      .forEach((block, ordinal) => {
        if (block.ordinal !== ordinal) paths.push(['choices', block.index, 'id'])
      })
  }
  return paths
}
