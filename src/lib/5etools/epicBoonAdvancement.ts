import type { Class5e, ClassFeature, ClassFeatureReference } from '@/types/5etools'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'

export const EPIC_BOON_LEVEL = 19

const configuredAward =
  'You gain an {@filter Epic Boon feat|feats|category=EB} or another {@5etools feat|feats.html} of your choice for which you qualify. '
const bundledAward =
  'You gain an Epic Boon feat (see "Feats") or another feat of your choice for which you qualify. '
const plainAward =
  'You gain an Epic Boon feat or another feat of your choice for which you qualify. '
const recommendation = /^\{@feat [^{}|]+\|XPHB\} is recommended\.$/u
const featureFields = new Set([
  'name',
  'className',
  'classSource',
  'source',
  'level',
  'entries',
  'page',
  'srd52',
  'basicRules2024',
])

function identityPart(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined
}

export function isRevisedEpicBoonOwner(owner: Pick<Class5e, 'source' | 'edition'>) {
  return owner.edition === 'one' || identityPart(owner.source) === 'xphb'
}

/** The pinned configured filter and the bundled cross-reference express one alternative. */
export function isEpicBoonAdvancement(feature: ClassFeature): boolean {
  const entries = feature.entries
  if (
    feature.sourceIdentityConflict ||
    identityPart(feature.name) !== 'epic boon' ||
    !identityPart(feature.className) ||
    !identityPart(feature.classSource) ||
    identityPart(feature.classSource) !== identityPart(feature.source) ||
    feature.level !== EPIC_BOON_LEVEL ||
    !Array.isArray(entries) ||
    entries.length !== 1 ||
    typeof entries[0] !== 'string' ||
    !Object.keys(feature).every((field) => featureFields.has(field))
  )
    return false

  const text = entries[0].trim()
  return [configuredAward, bundledAward, plainAward].some(
    (award) => text.startsWith(award) && recommendation.test(text.slice(award.length)),
  )
}

function getEpicBoonAdvancementTarget(owner: Pick<Class5e, 'name' | 'source'>) {
  return getClassFeatureIdentity({
    name: 'Epic Boon',
    className: owner.name,
    classSource: owner.source,
    source: owner.source,
    level: EPIC_BOON_LEVEL,
  })
}

function decodeEpicBoonCandidate(ref: ClassFeatureReference) {
  return typeof ref.ref === 'string' ? decodeClassFeatureReference(ref.ref) : undefined
}

export function isEpicBoonFeatureReference(ref: ClassFeatureReference): boolean {
  return (
    identityPart(ref.name) === 'epic boon' ||
    identityPart(decodeEpicBoonCandidate(ref)?.name) === 'epic boon'
  )
}

function epicBoonGains(refs: readonly ClassFeatureReference[]) {
  return refs.flatMap((ref) => {
    const uid = decodeEpicBoonCandidate(ref)
    return (identityPart(ref.name) === 'epic boon' && ref.level === EPIC_BOON_LEVEL) ||
      (identityPart(uid?.name) === 'epic boon' && uid?.level === EPIC_BOON_LEVEL)
      ? [{ ref, uid }]
      : []
  })
}

/** Reserve an advancement candidate for recovery even if its authority is conflicting. */
export function hasEpicBoonAdvancementReference(owner: Class5e): boolean {
  return isRevisedEpicBoonOwner(owner) && epicBoonGains(owner.classFeatureRefs ?? []).length > 0
}

/** Resolve the direct gain independently of the currently available feature entity. */
export function getEpicBoonAdvancementReference(
  refs: readonly ClassFeatureReference[],
  owner: Pick<Class5e, 'name' | 'source' | 'sourceIdentityConflict' | 'edition'>,
): ClassFeatureReference | undefined {
  if (owner.sourceIdentityConflict || !isRevisedEpicBoonOwner(owner)) return undefined
  const target = getEpicBoonAdvancementTarget(owner)
  if (!target) return undefined

  const gains = epicBoonGains(refs)
  if (gains.length !== 1) return undefined

  const { ref, uid } = gains[0]
  if (
    ref.gainSubclassFeature ||
    !uid ||
    getClassFeatureIdentity(uid) !== target ||
    getClassFeatureIdentity(ref) !== target ||
    (ref.source !== undefined && identityPart(ref.source) !== identityPart(owner.source)) ||
    (ref.feature &&
      (ref.feature.sourceIdentityConflict || getClassFeatureIdentity(ref.feature) !== target))
  )
    return undefined
  return ref
}
