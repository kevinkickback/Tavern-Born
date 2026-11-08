import type { SubclassFeature, SubclassFeatureReference } from '@/types/5etools'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
  getSubclassOwnerIdentity,
  isExactSubclassFeatureReference as isExactSubclassProficiencyReference,
} from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { isArcaneDabblerDeclaration } from './mysticFeatureIdentity'
import { PSIONIC_CLASS_SOURCE } from './psionicIdentity'

type SubclassProficiencyOwner = [string, string, string, string]
export interface SubclassProficiencyPath {
  target: string
  refs: string[]
  level: number
}
export interface SubclassProficiencyFeatureCertificate {
  target: string
  rawDigest: string
  metadataDigest: string
  fields: string[]
  entries: Array<{ digest: string; reference?: string }>
  copies: Array<{ target: string; digest: string }>
}
export interface SubclassProficiencyRootCertificate {
  owner: SubclassProficiencyOwner
  shortName: string
  rawDigest: string
  metadataDigest: string
  fields: string[]
  copies: Array<{ key: string; digest: string }>
  declarations: string[]
  intro: string
  paths: SubclassProficiencyPath[]
}
export interface SubclassProficiencyPackage {
  features: SubclassProficiencyFeatureCertificate[]
  roots: SubclassProficiencyRootCertificate[]
  fixedOnly?: true
}
export interface SubclassProficiencyCheckpoint extends SubclassProficiencyPackage {
  packages?: SubclassProficiencyPackage[]
}
export interface SubclassProficiencySourceAudit {
  version: 1
  certificate: string
  origin: string
  verified: boolean
  package?: string
}

/** Exact production subclass copy lookup, distinct from its canonical selected-owner tuple. */
export function getSubclassCopyLookupKey(value: Record<string, unknown>): string | undefined {
  const fields = ['name', 'source', 'shortName', 'className', 'classSource']
  return fields.every((field) => typeof value[field] === 'string' && value[field])
    ? fields.map((field) => value[field]).join('|')
    : undefined
}

export const getSubclassProficiencyOwner = getSubclassOwnerIdentity

export const subclassProficiencyDigest = (value: unknown) => getFeatureSourceDigest([value], false)

export function isKnightlyEnvoyProficiencyFeature(value: Record<string, unknown>) {
  return (
    value.name === 'Knightly Envoy' &&
    value.className === 'Fighter' &&
    value.classSource === 'XPHB' &&
    value.subclassShortName === 'Banneret' &&
    value.source === 'FRHoF' &&
    value.subclassSource === 'FRHoF'
  )
}

export function getSubclassProficiencyEntries(value: Record<string, unknown>): unknown[] {
  const entries = Array.isArray(value.entries) ? value.entries : []
  if (isKnightlyEnvoyProficiencyFeature(value))
    return entries.filter((entry) => entry?.type !== 'entries' || entry.name !== 'Comprehension')
  if (isArcaneArcherLoreProficiencyFeature(value))
    return value.source === 'AU'
      ? entries.filter((entry) => entry?.type !== 'entries' || entry.name !== 'Cantrip')
      : entries.map((entry) =>
          typeof entry === 'string'
            ? entry.replace(/, and you choose to learn either [^.]+ cantrip\.$/, '.')
            : entry,
        )
  return entries
}

export function isArcaneArcherLoreProficiencyFeature(value: Record<string, unknown>) {
  return (
    value.name === 'Arcane Archer Lore' &&
    value.className === 'Fighter' &&
    value.subclassShortName === 'Arcane Archer' &&
    value.source === value.subclassSource &&
    ((value.classSource === 'PHB' && value.source === 'XGE') ||
      (value.classSource === 'XPHB' && value.source === 'AU'))
  )
}

export function subclassProficiencyFeatureDigest(value: Record<string, unknown>) {
  return subclassProficiencyDigest(
    Array.isArray(value.entries)
      ? { ...value, entries: getSubclassProficiencyEntries(value) }
      : value,
  )
}

// Independent spell and maneuver schedules do not authenticate proficiency clauses.
function omitIndependentSchedule(value: Record<string, unknown>) {
  if (
    value.className === 'Fighter' &&
    value.name === 'Arcane Archer' &&
    value.shortName === 'Arcane Archer' &&
    (value.source === 'XGE' || value.source === 'AU')
  )
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => key !== 'additionalSpells' && key !== 'optionalfeatureProgression',
      ),
    )
  if (
    value.name === 'Battle Master' &&
    value.shortName === 'Battle Master' &&
    (value.source === 'PHB' || value.source === 'XPHB') &&
    value.className === 'Fighter'
  )
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== 'optionalfeatureProgression'),
    )
  const arcana =
    value.name === 'Arcana Domain' &&
    value.shortName === 'Arcana' &&
    value.source === 'AU' &&
    value.className === 'Cleric'
  const banneret =
    value.name === 'Banneret' &&
    value.shortName === 'Banneret' &&
    value.source === 'FRHoF' &&
    value.className === 'Fighter'
  if (value.classSource !== 'XPHB' || (!arcana && !banneret)) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'additionalSpells'))
}

export function getSubclassProficiencyDeclarations<T>(
  root: Record<string, unknown>,
  values: readonly T[],
) {
  return root.name === 'Order of the Wu Jen' &&
    root.shortName === 'Wu Jen' &&
    root.className === 'Mystic' &&
    root.classSource === PSIONIC_CLASS_SOURCE &&
    root.source === PSIONIC_CLASS_SOURCE
    ? values.filter((value) => !isArcaneDabblerDeclaration(value))
    : values
}

export function subclassProficiencyRootDigest(value: Record<string, unknown>) {
  const root = omitIndependentSchedule(value)
  if (!Array.isArray(root.subclassFeatures)) return subclassProficiencyDigest(root)
  const declarations = getSubclassProficiencyDeclarations(root, root.subclassFeatures)
  return subclassProficiencyDigest(
    declarations === root.subclassFeatures ? root : { ...root, subclassFeatures: declarations },
  )
}

export function subclassProficiencyMetadata(value: Record<string, unknown>, root = false) {
  const derived = new Set([
    'entries',
    'featureOptionSourceConflict',
    'subclassProficiencySourceAudit',
    ...(root
      ? [
          'subclassFeatures',
          'subclassFeatureRefs',
          'introFeatureRef',
          'levelFeatures',
          'normalizedRules',
        ]
      : []),
  ])
  return Object.fromEntries(
    Object.entries(root ? omitIndependentSchedule(value) : value).filter(
      ([key]) => !derived.has(key),
    ),
  )
}

export { isExactSubclassProficiencyReference }

/** Traverse the production UID shape without changing target printing or enclosing earned level. */
export function collectSubclassProficiencyPaths(
  refs: readonly SubclassFeatureReference[],
  resolve: (target: string) => SubclassFeature | undefined,
  verifyAttached?: (target: string, feature: SubclassFeature) => boolean,
): SubclassProficiencyPath[] {
  const paths: SubclassProficiencyPath[] = []
  const visit = (
    uid: string,
    reference: Record<string, unknown>,
    previous: string[],
    earned: number,
  ) => {
    if (!isExactSubclassProficiencyReference(reference, uid)) return
    const decoded = decodeSubclassFeatureReference(uid)
    const target = getSubclassFeatureIdentity(decoded)!
    if (
      verifyAttached &&
      (reference.sourceIdentityConflict ||
        reference.featureOptionSourceConflict ||
        !reference.feature ||
        !verifyAttached(target, reference.feature as SubclassFeature))
    )
      return
    if (
      previous.some(
        (ref) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref)) === target,
      )
    )
      return
    const path = [...previous, uid]
    const level = Math.max(earned, decoded.level!)
    paths.push({ target, refs: path, level })
    const feature = resolve(target)
    if (!feature || getSubclassFeatureIdentity(feature) !== target) return
    const scan = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(scan)
        return
      }
      const entry = value as Record<string, unknown>
      if (entry.type === 'options') return
      if (entry.type === 'refSubclassFeature') {
        if (typeof entry.subclassFeature === 'string')
          visit(entry.subclassFeature, entry, path, level)
        return
      }
      scan(entry.entries)
    }
    scan(verifyAttached ? (reference.feature as SubclassFeature).entries : feature.entries)
  }
  refs.forEach((reference) => {
    if (typeof reference.ref === 'string')
      visit(reference.ref, reference as unknown as Record<string, unknown>, [], 0)
  })
  return paths
}
