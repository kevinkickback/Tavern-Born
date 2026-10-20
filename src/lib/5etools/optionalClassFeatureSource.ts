import type {
  Class5e,
  ClassFeature,
  GameData,
  OptionalClassFeatureSourceProof,
} from '@/types/5etools'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  auditOptionalClassDeclarationSources,
  mergeOptionalClassDeclarationSources,
} from './optionalClassDeclarationSource'
import type { PreparedOptionalDeclarationSources } from './optionalClassDeclarationStructure'
import {
  OPTIONAL_CLASS_FEATURE_RULES,
  type OptionalClassDeclarationCertificate,
  type OptionalClassFeatureCertificate,
  type OptionalClassParentCertificate,
  type OptionalClassSourceOwner,
} from './optionalClassFeatureRules'
import { OPTIONAL_CLASS_SECTION_RULES } from './optionalClassSectionRules'

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map((value) => object(value) ?? {}) : []
const normalized = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const digest = (value: unknown) => getFeatureSourceDigest([value], false)
const parentKey = (value: Record<string, unknown>) =>
  JSON.stringify(['class', normalized(value.name), normalized(value.source)])
const parents = new Map<string, OptionalClassParentCertificate>()
for (const row of [
  ...OPTIONAL_CLASS_FEATURE_RULES.parents,
  ...OPTIONAL_CLASS_SECTION_RULES.parents,
]) {
  const key = JSON.stringify(row.owner),
    prior = parents.get(key)
  parents.set(
    key,
    prior
      ? {
          ...prior,
          declarations: [
            ...prior.declarations,
            ...row.declarations.filter(
              (declaration) =>
                !prior.declarations.some((other) => other.target === declaration.target),
            ),
          ],
        }
      : row,
  )
}
const features = new Map(
  [...OPTIONAL_CLASS_FEATURE_RULES.features, ...OPTIONAL_CLASS_SECTION_RULES.features].map(
    (row) => [row.target, row],
  ),
)
const proofKey = (kind: OptionalClassFeatureSourceProof['kind'], target: string) =>
  JSON.stringify([kind, target])
const classProofTarget = (
  owner: OptionalClassSourceOwner,
  declaration: OptionalClassDeclarationCertificate,
) => JSON.stringify([owner, declaration.target, declaration.level])
const certificates = new Map([
  ...[...parents.values()].flatMap((parent) =>
    parent.declarations.map(
      (declaration) =>
        [
          proofKey('class', classProofTarget(parent.owner, declaration)),
          digest({ owner: parent.owner, fields: parent.fields, declaration })!,
        ] as const,
    ),
  ),
  ...[...features].map(([target, row]) => [proofKey('feature', target), digest(row)!] as const),
])
function occurrences(value: unknown, target: string): number {
  if (typeof value === 'string')
    return getClassFeatureIdentity(decodeClassFeatureReference(value)) === target ? 1 : 0
  if (!value || typeof value !== 'object') return 0
  return Object.values(value).reduce<number>((sum, row) => sum + occurrences(row, target), 0)
}
function declarationMatches(value: unknown, declaration: OptionalClassDeclarationCertificate) {
  return (
    Array.isArray(value) &&
    value.filter((row) => row === declaration.rawDeclaration).length === 1 &&
    occurrences(value, declaration.target) === 1
  )
}
function rawParentMatches(
  row: Record<string, unknown>,
  certificate: OptionalClassParentCertificate,
) {
  return (
    !row._copy &&
    Object.keys(row).every((field) => certificate.fields.includes(field)) &&
    Array.isArray(row.classFeatures)
  )
}
const stamp = (
  kind: OptionalClassFeatureSourceProof['kind'],
  target: string,
  origin: string,
  verified: boolean,
): OptionalClassFeatureSourceProof => ({
  version: 1,
  kind,
  target,
  certificate: certificates.get(proofKey(kind, target))!,
  origin,
  verified,
})

/** Preserve independent proof before raw class/feature first-match Maps; do not touch source bodies. */
export function auditOptionalClassFeatureSources(
  data: unknown,
  origin: string,
  prepared?: PreparedOptionalDeclarationSources,
): OptionalClassFeatureSourceProof[] {
  const document = object(data)
  if (!document) return []
  const classRows = rows(document.class),
    featureRows = rows(document.classFeature)
  const result: OptionalClassFeatureSourceProof[] = []
  classRows.forEach((row, index) => {
    const target = parentKey(row),
      certificate = parents.get(target)
    if (!certificate) return
    for (const declaration of certificate.declarations)
      result.push(
        stamp(
          'class',
          classProofTarget(certificate.owner, declaration),
          origin + ':class:' + index,
          classRows.filter((other) => parentKey(other) === target).length === 1 &&
            rawParentMatches(row, certificate) &&
            declarationMatches(row.classFeatures, declaration),
        ),
      )
  })
  featureRows.forEach((row, index) => {
    const target = getClassFeatureIdentity(row),
      certificate = target && features.get(target)
    if (!target || !certificate) return
    result.push(
      stamp(
        'feature',
        target,
        origin + ':classFeature:' + index,
        featureRows.filter((other) => getClassFeatureIdentity(other) === target).length === 1 &&
          digest(row) === certificate.digest,
      ),
    )
  })
  return [...result, ...auditOptionalClassDeclarationSources(data, origin, prepared)]
}

function validProof(
  value: OptionalClassFeatureSourceProof,
  kind: OptionalClassFeatureSourceProof['kind'],
  target: string,
) {
  return (
    value.version === 1 &&
    value.kind === kind &&
    value.target === target &&
    value.verified === true &&
    typeof value.origin === 'string' &&
    !!value.origin &&
    value.certificate === certificates.get(proofKey(kind, target)) &&
    Object.keys(value).every((field) =>
      ['version', 'kind', 'target', 'certificate', 'origin', 'verified'].includes(field),
    )
  )
}

/** Winning raw identities replace their proof too, including absent/invalid proof and same-layer duplicates. */
export function mergeOptionalClassFeatureSources(
  layers: readonly Pick<GameData, 'classes' | 'classFeatures' | 'optionalClassFeatureSources'>[],
): OptionalClassFeatureSourceProof[] {
  let result: OptionalClassFeatureSourceProof[] = []
  for (const layer of layers) {
    const counts = new Map<string, number>()
    for (const row of layer.classes) {
      const target = parentKey(row)
      const parent = parents.get(target)
      if (parent)
        for (const declaration of parent.declarations) {
          const key = proofKey('class', classProofTarget(parent.owner, declaration))
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
    }
    for (const row of layer.classFeatures) {
      const target = getClassFeatureIdentity(row)
      if (target && features.has(target)) {
        const key = proofKey('feature', target)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    const incoming = (layer.optionalClassFeatureSources ?? [])
      .filter((row) => object(row) && counts.has(proofKey(row.kind, row.target)))
      .map((row) =>
        counts.get(proofKey(row.kind, row.target)) === 1 ? row : { ...row, verified: false },
      )
    result = [...result.filter((row) => !counts.has(proofKey(row.kind, row.target))), ...incoming]
  }
  return [...result, ...mergeOptionalClassDeclarationSources(layers)]
}

interface OptionalClassSourceCatalog {
  classes?: readonly Class5e[]
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
  optionalClassFeatureSources?: readonly OptionalClassFeatureSourceProof[]
}
interface CurrentSources {
  parents: ReadonlyMap<string, Class5e | undefined>
  features: ReadonlyMap<string, ClassFeature | undefined>
  declarations: ReadonlySet<string>
}
const derivedParentFields = new Set([
  'subclasses',
  'classFeatureRefs',
  'normalizedRules',
  'isSpellcaster',
  'spellSlotProgression',
  'fluffEntries',
  'classFluffSections',
  'classFluffImages',
])
function currentFeatureMatches(
  value: ClassFeature | undefined,
  certificate: OptionalClassFeatureCertificate,
) {
  if (
    !value ||
    value.featureOptionSourceConflict ||
    getClassFeatureIdentity(value) !== certificate.target
  )
    return false
  const { featureOptionSourceConflict: _derived, ...source } = value
  return (
    Object.keys(source).every((field) => certificate.fields.includes(field)) &&
    digest(source) === certificate.digest
  )
}
const cache = new WeakMap<object, CurrentSources>()
/** Complete current filtered collections/indexes are mandatory; an explicit empty collection stays empty. */
function currentSources(catalogs: OptionalClassSourceCatalog): CurrentSources {
  const old = cache.get(catalogs)
  if (old) return old
  const proofGroups = new Map<string, OptionalClassFeatureSourceProof[]>()
  for (const proof of catalogs.optionalClassFeatureSources ?? []) {
    if (!object(proof)) continue
    const key = proofKey(proof.kind, proof.target)
    proofGroups.set(key, [...(proofGroups.get(key) ?? []), proof])
  }
  const certified = (kind: OptionalClassFeatureSourceProof['kind'], target: string) => {
    const found = proofGroups.get(proofKey(kind, target)) ?? []
    return (
      found.length > 0 &&
      found.every((row) => validProof(row, kind, target)) &&
      new Set(found.map((row) => row.origin)).size === 1
    )
  }
  const currentParents = new Map<string, Class5e | undefined>()
  const currentDeclarations = new Set<string>()
  for (const [target, certificate] of parents) {
    const found = (catalogs.classes ?? []).filter((row) => parentKey(row) === target)
    const row = found[0]
    currentParents.set(
      target,
      found.length === 1 &&
        row &&
        !row._copy &&
        Object.keys(row).every(
          (field) => certificate.fields.includes(field) || derivedParentFields.has(field),
        )
        ? row
        : undefined,
    )
    if (currentParents.get(target))
      for (const declaration of certificate.declarations) {
        const key = classProofTarget(certificate.owner, declaration)
        if (certified('class', key) && declarationMatches(row.classFeatures, declaration))
          currentDeclarations.add(key)
      }
  }
  const currentFeatures = new Map<string, ClassFeature | undefined>()
  for (const [target, certificate] of features) {
    const listed = catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
    const candidates =
      catalogs.classFeatureCandidates !== undefined
        ? (catalogs.classFeatureCandidates.get(target) ?? [])
        : listed
    currentFeatures.set(
      target,
      certified('feature', target) &&
        listed.length === 1 &&
        candidates.length === 1 &&
        [...listed, ...candidates].every((row) => currentFeatureMatches(row, certificate))
        ? candidates[0]
        : undefined,
    )
  }
  const result = {
    parents: currentParents,
    features: currentFeatures,
    declarations: currentDeclarations,
  }
  cache.set(catalogs, result)
  return result
}

function referenceMatches(value: Record<string, unknown>, uid: string) {
  if (
    typeof value.ref !== 'string' ||
    value.ref.split('|').length < 4 ||
    value.ref.split('|').length > 5 ||
    value.gainSubclassFeature === true
  )
    return false
  const expected = decodeClassFeatureReference(uid)
  if (
    getClassFeatureIdentity(decodeClassFeatureReference(value.ref)) !==
    getClassFeatureIdentity(expected)
  )
    return false
  if (
    Object.keys(value).some(
      (field) =>
        ![
          'ref',
          'name',
          'className',
          'classSource',
          'source',
          'level',
          'gainSubclassFeature',
          'feature',
        ].includes(field),
    )
  )
    return false
  return (['name', 'className', 'classSource', 'source', 'level'] as const).every(
    (field) =>
      value[field] === undefined ||
      (typeof expected[field] === 'number'
        ? value[field] === expected[field]
        : typeof value[field] === 'string' &&
          normalized(value[field]) === normalized(expected[field])),
  )
}

/** Resolve one current direct declaration without borrowing the enclosing owner into its target printing. */
export function getCurrentOptionalClassDeclaration(
  catalogs: OptionalClassSourceCatalog | undefined,
  owner: OptionalClassSourceOwner,
  target: string,
) {
  if (!catalogs) return undefined
  const key = JSON.stringify(owner),
    parent = parents.get(key)
  const declaration = parent?.declarations.find((row) => row.target === target),
    certificate = features.get(target)
  if (!declaration || !certificate) return undefined
  const source = currentSources(catalogs),
    cls = source.parents.get(key),
    feature = source.features.get(target)
  if (!cls || !feature || !source.declarations.has(classProofTarget(owner, declaration)))
    return undefined
  const references = (cls.classFeatureRefs ?? []).filter(
    (row) =>
      typeof row.ref === 'string' &&
      getClassFeatureIdentity(decodeClassFeatureReference(row.ref)) === target,
  )
  if (
    references.length !== 1 ||
    !referenceMatches(
      references[0] as unknown as Record<string, unknown>,
      declaration.rawDeclaration,
    ) ||
    !currentFeatureMatches(references[0].feature, certificate)
  )
    return undefined
  return { classData: cls, feature, level: declaration.level, reference: references[0] }
}
