import { removeGrantsBySource } from './ledger';
import type { ProvenanceLedger } from './types';

/**
 * Reconcile ledger when a race selection changes.
 * Removes all grants from the old race and old subrace.
 */
export function reconcileRaceChange(
  ledger: ProvenanceLedger,
  oldRaceName: string | undefined,
  oldSubraceName: string | undefined,
): ProvenanceLedger {
  let result = ledger;
  if (oldRaceName) result = removeGrantsBySource(result, 'race', oldRaceName);
  if (oldSubraceName)
    result = removeGrantsBySource(result, 'subrace', oldSubraceName);
  return result;
}

/**
 * Reconcile ledger when only the subrace changes (race stays the same).
 */
export function reconcileSubraceChange(
  ledger: ProvenanceLedger,
  oldSubraceName: string | undefined,
): ProvenanceLedger {
  if (!oldSubraceName) return ledger;
  return removeGrantsBySource(ledger, 'subrace', oldSubraceName);
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
  let result = ledger;
  if (oldClassName)
    result = removeGrantsBySource(result, 'class', oldClassName);
  if (oldSubclassName)
    result = removeGrantsBySource(result, 'subclass', oldSubclassName);
  return result;
}

/**
 * Reconcile ledger when a background selection changes.
 */
export function reconcileBackgroundChange(
  ledger: ProvenanceLedger,
  oldBackgroundName: string | undefined,
): ProvenanceLedger {
  if (!oldBackgroundName) return ledger;
  return removeGrantsBySource(ledger, 'background', oldBackgroundName);
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
): { toRemove: string[]; toAdd: string[] } {
  const map = ledger.proficiencies[domain];

  // Keys that are exclusively attributed to this source (removing safe)
  const toRemove = Object.entries(map)
    .filter(
      ([, tags]) =>
        tags.length > 0 &&
        tags.every(
          (t) => t.sourceType === sourceType && t.sourceName === sourceName,
        ),
    )
    .map(([key]) => key);

  return { toRemove, toAdd: [] };
}
