import type { EntityReference } from '@/lib/5etools/entityResolvers'
import type { CharacterClassEntry } from '@/types/character'
import { removeGrantsBySource, removeGrantsBySourceRef } from './ledger'
import { normalizeOwnerIdentity } from './normalization'
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
 * Removes only the replaced class printing and its unshared subclass grants.
 */
export function reconcileClassChange(
  ledger: ProvenanceLedger,
  previous: CharacterClassEntry,
  retained: readonly CharacterClassEntry[],
): ProvenanceLedger {
  let result = ledger
  const norm = normalizeOwnerIdentity
  const remove = (type: 'class' | 'subclass', name: string, source?: string) => {
    result = removeGrantsBySourceRef(result, type, name, source, undefined, {
      normalizeIdentity: true,
    })
  }
  if (norm(previous.source)) remove('class', previous.name, previous.source)
  // A historical tag without a source can only be assigned when the name is unambiguous.
  if (!retained.some((row) => norm(row.name) === norm(previous.name)))
    remove('class', previous.name)
  if (!previous.subclass) return result
  const retainedSubclass = retained.filter((row) => norm(row.subclass) === norm(previous.subclass))
  if (
    norm(previous.subclassSource) &&
    !retainedSubclass.some((row) => norm(row.subclassSource) === norm(previous.subclassSource))
  )
    remove('subclass', previous.subclass, previous.subclassSource)
  if (!retainedSubclass.length) remove('subclass', previous.subclass)
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
