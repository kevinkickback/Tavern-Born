import { applyFeatGrantBlocks } from './applyFeatAndOptionalFeatureGrants'
import { applyProficiencyBlocks, toProficiencyBlocks } from './applyProficiencyBlocks'
import { normalizeKey } from './normalization'
import { makeSourceTag } from './sourceLabels'
import type { ProvenanceLedger } from './types'

/**
 * Apply proficiency grants from a background to the ledger.
 * Handles fixed and choice-based skill, language, and tool proficiencies.
 */
export function applyBackgroundGrants(
  bg: {
    name: string
    source?: string
    startingEquipment?: unknown
    skillProficiencies?: unknown[]
    languageProficiencies?: unknown[]
    toolProficiencies?: unknown[]
    feats?: unknown[]
  },
  ledger: ProvenanceLedger,
  options?: { suppressLanguageGrants?: boolean },
): ProvenanceLedger {
  let result = ledger
  const bgTag = makeSourceTag('background', bg.name, 'fixed', bg.source)
  const prefix = `background:${normalizeKey(bg.name)}`

  result = applyProficiencyBlocks(
    result,
    'skills',
    toProficiencyBlocks(bg.skillProficiencies),
    bgTag,
    prefix,
  )
  if (!options?.suppressLanguageGrants) {
    result = applyProficiencyBlocks(
      result,
      'languages',
      toProficiencyBlocks(bg.languageProficiencies),
      bgTag,
      prefix,
    )
  }
  result = applyProficiencyBlocks(
    result,
    'tools',
    toProficiencyBlocks(bg.toolProficiencies),
    bgTag,
    prefix,
  )

  // Selected equipment/currency and their source summary are applied atomically by the command.

  // Apply background feat grants (2024/5.5e origin feats).
  result = applyFeatGrantBlocks(result, bg.feats, 'background', bg.name, bg.source)

  return result
}
