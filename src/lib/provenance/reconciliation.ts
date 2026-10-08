import type { EntityReference } from '@/lib/5etools/entityResolvers'
import { removeGrantsBySource, removeGrantsBySourceRef } from './ledger'
import type { ProvenanceLedger } from './types'

/**
 * Reconcile ledger when a race selection changes.
 * Removes only the previous selected race and subrace printings.
 */
export function reconcileRaceChange(
  ledger: ProvenanceLedger,
  oldRace: EntityReference | undefined,
  oldSubrace: EntityReference | undefined,
): ProvenanceLedger {
  let result = ledger
  if (oldRace?.name)
    result = removeGrantsBySourceRef(result, 'race', oldRace.name, oldRace.source, undefined, {
      normalizeIdentity: true,
    })
  if (oldSubrace?.name)
    result = removeGrantsBySourceRef(
      result,
      'subrace',
      oldSubrace.name,
      oldSubrace.source,
      undefined,
      { normalizeIdentity: true },
    )
  return result
}

/**
 * Reconcile ledger when only the subrace changes (race stays the same).
 */
export function reconcileSubraceChange(
  ledger: ProvenanceLedger,
  oldSubrace: EntityReference | undefined,
): ProvenanceLedger {
  if (!oldSubrace?.name) return ledger
  return removeGrantsBySourceRef(ledger, 'subrace', oldSubrace.name, oldSubrace.source, undefined, {
    normalizeIdentity: true,
  })
}

/**
 * Reconcile ledger when a class selection changes.
 * Removes all grants from the old class and old subclass.
 */
export function reconcileClassChange(
  ledger: ProvenanceLedger,
  oldClassName: string | undefined,
  oldSubclassName: string | undefined,
): ProvenanceLedger {
  let result = ledger
  if (oldClassName) result = removeGrantsBySource(result, 'class', oldClassName)
  if (oldSubclassName) result = removeGrantsBySource(result, 'subclass', oldSubclassName)
  return result
}

/**
 * Reconcile ledger when a background selection changes.
 */
export function reconcileBackgroundChange(
  ledger: ProvenanceLedger,
  oldBackgroundName: string | undefined,
): ProvenanceLedger {
  if (!oldBackgroundName) return ledger
  return removeGrantsBySource(ledger, 'background', oldBackgroundName)
}

/**
 * Given sets of old and new proficiency names for a given source, return
 * the items that were only attributed to that source (safe to remove) and
 * items newly granted.
 *
 * Used to update the actual proficiency arrays alongside the ledger.
 */
export function diffProficiencyGrants(
  ledger: ProvenanceLedger,
  domain: keyof import('./types').ProficiencyProvenance,
  sourceType: string,
  sourceName: string,
): { toRemove: string[] } {
  const map = ledger.proficiencies[domain] ?? {}

  // Keys that are exclusively attributed to this source (removing safe)
  const toRemove = Object.entries(map)
    .filter(
      ([, tags]) =>
        tags.length > 0 &&
        tags.every((t) => t.sourceType === sourceType && t.sourceName === sourceName),
    )
    .map(([key]) => key)

  return { toRemove }
}
