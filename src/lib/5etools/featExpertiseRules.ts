import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import type { Feat5e } from '@/types/5etools'
import { getFeatureSourceDigest } from './featureSourceAudit'

const AUDITED = new Map([
  ['["boon of skill","xphb"]', '3e2c29366925ebe97c08583119428e720d0115de7b7dba4658019c4b4e6f1c29'],
  ['["echoing soul","rhw"]', '2326010c131e692ffa081bde74c15340342e6c359c06b6fe84eba278b63cf7d6'],
  ['["prodigy","xge"]', '4bf7dd0e61830d35e939fb809a121782ba27be47a62f27e0adeb5ebad39013d5'],
  ['["skill expert","tce"]', '20a03fd66a9b72855418c08e4759208b87afa041d81230e1b8f3c23ff64b0627'],
  ['["skill expert","xphb"]', '6189148397584b48ded9f5d542b8de41fe77d819911423adff73b2de5e300c35'],
])
const cache = new WeakMap<Feat5e, boolean>()
export const FEAT_EXPERTISE_TARGETS = [
  { name: 'Boon of Skill', source: 'XPHB' },
  { name: 'Echoing Soul', source: 'RHW' },
  { name: 'Prodigy', source: 'XGE' },
  { name: 'Skill Expert', source: 'TCE' },
  { name: 'Skill Expert', source: 'XPHB' },
] as const
export const isKnownFeatExpertiseTarget = (feat: { name: string; source?: string }) =>
  AUDITED.has(getFeatSelectionKey(feat))

/** Only the supported one-pick source shape requests a player Expertise decision. */
export function hasExpertiseChoice(feat: Feat5e): boolean {
  return (
    Array.isArray(feat.expertise) &&
    feat.expertise.length === 1 &&
    !!feat.expertise[0] &&
    typeof feat.expertise[0] === 'object' &&
    Object.keys(feat.expertise[0]).length === 1 &&
    feat.expertise[0].anyProficientSkill === 1
  )
}

/** Audited complete printing, declaration, skill boundary and ordered rules body. */
export function isAuditedFeatExpertise(feat: Feat5e): boolean {
  const cached = cache.get(feat)
  if (cached !== undefined) return cached
  const valid =
    hasExpertiseChoice(feat) &&
    AUDITED.get(getFeatSelectionKey(feat)) ===
      getFeatureSourceDigest([feat.expertise, feat.skillProficiencies, feat.entries], false)
  cache.set(feat, valid)
  return valid
}
