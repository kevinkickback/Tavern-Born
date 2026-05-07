import { addChoicePlaceholder, addGrant } from './ledger'
import { normalizeGenericToolChoice } from './normalization'
import type { ChoiceRecord, ProvenanceLedger, SourceTag } from './types'

export type ProficiencyBlock = Record<
  string,
  boolean | { choose?: { from?: string[]; fromFilter?: string; count?: number } } | number
>

export type ProficiencyBlockDomain = 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'

export type ProficiencyBlockEntry =
  | { kind: 'fixed'; key: string }
  | { kind: 'numeric'; key: string; count: number }
  | { kind: 'generic-tool'; genericKey: string; count: number }
  | { kind: 'choose'; from: string[]; fromFilter?: string; count: number }
  | { kind: 'any-standard'; count: number }

export function toProficiencyBlocks(blocks: unknown[] | undefined): ProficiencyBlock[] {
  return (blocks ?? []).filter(
    (block): block is ProficiencyBlock =>
      typeof block === 'object' && block !== null && !Array.isArray(block),
  )
}

export function* iterateProficiencyBlocks(
  blocks: ProficiencyBlock[],
  domain: ProficiencyBlockDomain,
): Generator<ProficiencyBlockEntry> {
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose' || key === 'anyStandard') continue

      if (domain === 'tools') {
        const generic = normalizeGenericToolChoice(key)
        if (generic && (val === true || (typeof val === 'number' && val > 0))) {
          yield {
            kind: 'generic-tool',
            genericKey: generic,
            count: typeof val === 'number' && val > 0 ? val : 1,
          }
          continue
        }
      }

      if (key === 'any' && typeof val === 'number' && val > 0) {
        yield { kind: 'any-standard', count: val }
        continue
      }

      if (val === true) {
        yield { kind: 'fixed', key }
        continue
      }

      if (typeof val === 'number' && val > 0) {
        yield { kind: 'numeric', key, count: val }
      }
    }

    const anyStandard = (block as { anyStandard?: number }).anyStandard
    if (typeof anyStandard === 'number' && anyStandard > 0) {
      yield { kind: 'any-standard', count: anyStandard }
    }

    const choose = (block as { choose?: { from?: string[]; fromFilter?: string; count?: number } })
      .choose
    if (choose) {
      yield {
        kind: 'choose',
        from: choose.from ?? [],
        fromFilter: choose.fromFilter,
        count: choose.count ?? 1,
      }
    }
  }
}

export function applyProficiencyBlocks(
  ledger: ProvenanceLedger,
  domain: ProficiencyBlockDomain,
  blocks: ProficiencyBlock[],
  tag: SourceTag,
  choiceIdPrefix: string,
  resolveFilterOptions?: (domain: 'armor' | 'weapons', fromFilter: string) => string[],
): ProvenanceLedger {
  let result = ledger
  let choiceIndex = 0

  for (const entry of iterateProficiencyBlocks(blocks, domain)) {
    if (entry.kind === 'fixed') {
      result = addGrant(result, domain, entry.key, tag)
      continue
    }

    if (entry.kind === 'numeric') {
      // Numeric non-tool entries are rare; treat as fixed fallback.
      result = addGrant(result, domain, entry.key, tag)
      continue
    }

    if (entry.kind === 'generic-tool') {
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:generic:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: entry.count,
        optionPool: [entry.genericKey],
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
      continue
    }

    if (entry.kind === 'any-standard') {
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:any:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: entry.count,
        optionPool: [],
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
      continue
    }

    if (entry.kind === 'choose') {
      const normalizedPool =
        domain === 'tools'
          ? entry.from.map((item) => normalizeGenericToolChoice(item) ?? item)
          : entry.fromFilter && (domain === 'armor' || domain === 'weapons')
            ? (resolveFilterOptions?.(domain, entry.fromFilter) ?? [])
            : entry.from

      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:choose:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: entry.count,
        optionPool: normalizedPool,
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
    }
  }

  return result
}
