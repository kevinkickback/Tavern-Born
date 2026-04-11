import { addGrant } from './ledger'
import { makeSourceTag } from './sourceLabels'
import type { ProvenanceLedger } from './types'

/**
 * Record a feat attribution in the provenance ledger.
 * The source type is always 'feat'; feats added manually by the user are
 * attributed as 'manual' with grantType 'choice'.
 */
export function applyFeatGrant(
  ledger: ProvenanceLedger,
  featName: string,
  featSource: string | undefined,
  /** 'manual' when the player chose the feat via the ASI/feat selection UI. */
  grantedByManual: boolean,
): ProvenanceLedger {
  const tag = grantedByManual
    ? makeSourceTag('manual', 'User Choice', 'choice', featSource)
    : makeSourceTag('feat', featName, 'fixed', featSource)
  return addGrant(ledger, 'feats', featName, tag)
}

/**
 * Record an optional feature attribution in the provenance ledger.
 */
export function applyOptionalFeatureGrant(
  ledger: ProvenanceLedger,
  featureName: string,
  featureSource: string | undefined,
  /** The class or source entity that offered this optional feature. */
  grantingSourceName: string,
  grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
): ProvenanceLedger {
  const tag = makeSourceTag(grantingSourceType, grantingSourceName, 'choice', featureSource)
  return addGrant(ledger, 'features', featureName, tag)
}
