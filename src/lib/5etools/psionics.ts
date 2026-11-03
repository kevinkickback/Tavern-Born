import type { Psionic5e } from '@/types/5etools'

export function getPsionicKey(name: string, source: string): string {
  return JSON.stringify([name.trim().toLowerCase(), source.trim().toLowerCase()])
}

/** Retain ambiguity before ordinary collection overlay removes repeated identities. */
export function auditPsionicMultiplicity(records: readonly Psionic5e[]): Psionic5e[] {
  const counts = new Map<string, number>()
  for (const row of records) {
    const key = getPsionicKey(row.name, row.source)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return records.map((row) =>
    (counts.get(getPsionicKey(row.name, row.source)) ?? 0) > 1
      ? { ...row, psionicSourceConflict: true }
      : row,
  )
}

const indexes = new WeakMap<readonly Psionic5e[], ReadonlyMap<string, readonly Psionic5e[]>>()
function indexPsionics(records: readonly Psionic5e[]): ReadonlyMap<string, readonly Psionic5e[]> {
  const prior = indexes.get(records)
  if (prior) return prior
  const result = new Map<string, Psionic5e[]>()
  for (const row of records) {
    const key = getPsionicKey(row.name, row.source)
    const matches = result.get(key) ?? []
    matches.push(row)
    result.set(key, matches)
  }
  indexes.set(records, result)
  return result
}

/** No missing-printing default or first-candidate fallback at an actor/catalog boundary. */
export function resolvePsionic(
  target: { name: string; source?: string },
  records: readonly Psionic5e[] | undefined,
): Psionic5e | undefined {
  if (!target.source?.trim() || !records) return undefined
  const matches = indexPsionics(records).get(getPsionicKey(target.name, target.source)) ?? []
  const row = matches.length === 1 ? matches[0] : undefined
  return row &&
    !row.psionicSourceConflict &&
    (row.type === 'T' || (row.type === 'D' && !!row.order?.trim())) &&
    (row.entries?.length || row.focus?.trim() || row.modes?.length)
    ? row
    : undefined
}
