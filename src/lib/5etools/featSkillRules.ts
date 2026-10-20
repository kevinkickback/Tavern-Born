import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import type { Feat5e } from '@/types/5etools'
import { getFeatureSourceDigest } from './featureSourceAudit'

const SKILLED = new Map([
  ['["skilled","phb"]', 'e48751fa40096fd8ac4cb0954b623bb907bdbc466b1ee8b455fc8c59aa101d05'],
  ['["skilled","xphb"]', '166a0e7978f9e3cd4d3c2589cf4c0032cdcf55d111d5a870d0966c8b154d7b9b'],
])
const cache = new WeakMap<Feat5e, boolean>()
export const isSkilledFeatTarget = (feat: { name: string; source?: string }) =>
  SKILLED.has(getFeatSelectionKey(feat))

/** The two bounded three-pick skill/tool declarations, including their ordered rules. */
export function isAuditedSkilledFeat(feat: Feat5e): boolean {
  const prior = cache.get(feat)
  if (prior !== undefined) return prior
  const blocks = feat.skillToolLanguageProficiencies as
    | Array<{ choose?: Array<{ from?: string[]; count?: number }> }>
    | undefined
  const choose = blocks?.[0]?.choose?.[0]
  const shape =
    Array.isArray(blocks) &&
    blocks.length === 1 &&
    !!blocks[0] &&
    typeof blocks[0] === 'object' &&
    Object.keys(blocks[0]).length === 1 &&
    Array.isArray(blocks[0].choose) &&
    blocks[0].choose.length === 1 &&
    !!choose &&
    Object.keys(choose).length === 2 &&
    choose.count === 3 &&
    Array.isArray(choose.from) &&
    choose.from.length === 2 &&
    choose.from[0] === 'anySkill' &&
    choose.from[1] === 'anyTool'
  const valid =
    shape &&
    SKILLED.get(getFeatSelectionKey(feat)) ===
      getFeatureSourceDigest(
        [
          feat.skillToolLanguageProficiencies,
          feat.skillProficiencies,
          feat.toolProficiencies,
          feat.languageProficiencies,
          feat.expertise,
          feat.entries,
        ],
        false,
      ) &&
    isSkilledFeatTarget(feat)
  cache.set(feat, valid)
  return valid
}
