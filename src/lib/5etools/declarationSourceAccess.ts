import type { Class5e, ClassFeature, GameData, SubclassFeature } from '@/types/5etools'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  collectOptionalDeclarationCertificates,
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  getOptionalDeclarationOwner,
  type OptionalDeclarationBodyShape,
  type OptionalDeclarationOwner,
  type OptionalDeclarationReference,
  type OptionalDeclarationRule,
  optionalDeclarationDigest,
  optionalDeclarationKey,
  optionalDeclarationObject,
  optionalDeclarationParentMetadata,
  type PreparedOptionalDeclarationSources,
  scanOptionalDeclarationReferences,
} from './optionalClassDeclarationStructure'
import { collectLayerSubclassFeatures } from './subclassFeatureCatalog'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

type Row = Record<string, unknown>
export interface DeclarationCatalog {
  classes?: readonly Class5e[]
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}
export interface DeclarationSourceProof<Kind extends string = string> {
  version: 1
  kind: Kind
  target: string
  certificate: string
  origin: string
  verified: boolean
}

/** Shared raw/copy/current declaration boundary; each registry keeps independent authority. */
export function createDeclarationSourceAccess<Kind extends string>(
  rules: readonly OptionalDeclarationRule[],
  proofKind: Kind,
  getProofs: (catalog: object) => readonly DeclarationSourceProof<Kind>[],
) {
  const OPTIONAL_CLASS_DECLARATIONS = rules
  const keys = new Map(
    OPTIONAL_CLASS_DECLARATIONS.map((row) => [
      optionalDeclarationKey(row.owner, row.target, row.level),
      row,
    ]),
  )
  const targets = new Set(OPTIONAL_CLASS_DECLARATIONS.map((row) => row.target))
  const digest = optionalDeclarationDigest
  const same = (left: unknown, right: unknown) => digest(left) === digest(right)
  const keyOf = (row: Pick<OptionalDeclarationRule, 'owner' | 'target' | 'level'>) =>
    optionalDeclarationKey(row.owner, row.target, row.level)

  /** Per-relation raw/copy/body audit runs before parser enrichment or first-match Maps. */
  function auditOptionalClassDeclarationSources(
    data: unknown,
    origin: string,
    prepared?: PreparedOptionalDeclarationSources,
  ): DeclarationSourceProof<Kind>[] {
    const document = optionalDeclarationObject(data)
    const found = collectOptionalDeclarationCertificates(document, targets, prepared)
    const result: DeclarationSourceProof<Kind>[] = []
    for (const [key, certificate] of keys) {
      const kind = certificate.owner[0]
      const owners = Array.isArray(document[kind]) ? (document[kind] as unknown[]) : []
      if (
        !owners.some(
          (value) =>
            JSON.stringify(getOptionalDeclarationOwner(optionalDeclarationObject(value), kind)) ===
            JSON.stringify(certificate.owner),
        )
      )
        continue
      const current = found.filter((row) => keyOf(row) === key)
      result.push({
        version: 1,
        kind: proofKind,
        target: key,
        certificate: certificate.certificate,
        origin: origin + ':' + key,
        verified: current.length === 1 && digest(current[0]) === certificate.certificate,
      })
    }
    return result
  }

  const featureDerived = new Set([
    'featureOptionSourceConflict',
    'subclassProficiencySourceAudit',
    'fixedProficiencySourceAudit',
  ])
  function cleanFeature(value: unknown, root = true): unknown {
    if (Array.isArray(value)) return value.map((row) => cleanFeature(row, false))
    if (!value || typeof value !== 'object') return value
    const row = value as Row
    return Object.fromEntries(
      Object.entries(row)
        .filter(
          ([key]) =>
            !(root && featureDerived.has(key)) &&
            !(
              key === 'feature' &&
              (row.type === 'refClassFeature' || row.type === 'refSubclassFeature')
            ),
        )
        .map(([key, value]) => [key, cleanFeature(value, false)]),
    )
  }
  /** Only qualified ref entries may be pruned; prose, order, fields and the active path are mandatory. */
  function currentBodyMatches(
    current: unknown,
    expected: OptionalDeclarationBodyShape,
    requiredNext?: string,
  ): boolean {
    if ('digest' in expected) return digest(current) === expected.digest
    if (!current || typeof current !== 'object' || Array.isArray(current)) return false
    const row = current as Row
    const metadata = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'entries'))
    if (
      digest(metadata) !== expected.metadataDigest ||
      !same(Object.keys(metadata).sort(), expected.fields)
    )
      return false
    if (expected.entries.kind === 'absent') return !Object.getOwnPropertyDescriptor(row, 'entries')
    if (expected.entries.kind === 'other')
      return (
        !!Object.getOwnPropertyDescriptor(row, 'entries') &&
        digest(row.entries) === expected.entries.digest
      )
    if (Array.isArray(row.entries)) {
      const values = row.entries
      let index = 0
      for (const value of expected.entries.values) {
        if (index < values.length && currentBodyMatches(values[index], value, requiredNext)) {
          index++
          continue
        }
        const target = 'reference' in value ? value.reference : undefined
        if (!target?.startsWith('subclass-feature|') || target === requiredNext) return false
      }
      return index === values.length
    }
    return false
  }
  function exactRootReference(row: Row, certificate: OptionalDeclarationRule) {
    const first = certificate.path[0]
    if (
      typeof row.ref !== 'string' ||
      decodeOptionalDeclaration(row.ref, first.kind)?.target !== first.target ||
      !exactOptionalDeclarationReference(row, first.uid, first.kind)
    )
      return false
    const allowed = [
      'ref',
      'name',
      'className',
      'classSource',
      'level',
      'source',
      'feature',
      'gainSubclassFeature',
      ...(first.kind === 'subclassFeature' ? ['subclassShortName', 'subclassSource'] : []),
    ]
    if (Object.keys(row).some((field) => !allowed.includes(field))) return false
    const expected = optionalDeclarationObject(certificate.rootValues[0])
    return (row.gainSubclassFeature === true) === (expected.gainSubclassFeature === true)
  }
  function currentParent(catalog: DeclarationCatalog, certificate: OptionalDeclarationRule) {
    const [kind, className, classSource] = certificate.owner
    const classes = (catalog.classes ?? []).filter(
      (row) =>
        row.name.trim().toLowerCase() === className &&
        row.source.trim().toLowerCase() === classSource,
    )
    if (classes.length !== 1) return undefined
    const found =
      kind === 'class'
        ? classes
        : (classes[0].subclasses ?? []).filter(
            (row) =>
              JSON.stringify(getOptionalDeclarationOwner(row as unknown as Row, 'subclass')) ===
              JSON.stringify(certificate.owner),
          )
    if (found.length !== 1) return undefined
    const parent = found[0] as unknown as Row
    const expectedFields = Object.fromEntries(
      certificate.parentFields.map((field) => [field, true]),
    )
    if (
      digest(optionalDeclarationParentMetadata(parent, kind, expectedFields)) !==
      certificate.parentMetadataDigest
    )
      return undefined
    const declarations = parent[kind === 'class' ? 'classFeatures' : 'subclassFeatures']
    const first = certificate.path[0]
    const raw = Array.isArray(declarations)
      ? declarations.filter((value) => {
          const row = optionalDeclarationObject(value),
            uid = typeof value === 'string' ? value : row[first.kind]
          return (
            typeof uid === 'string' &&
            decodeOptionalDeclaration(uid, first.kind)?.target === first.target
          )
        })
      : []
    if (raw.length !== 1 || !same(raw, certificate.rootValues)) return undefined
    const refs = parent[kind === 'class' ? 'classFeatureRefs' : 'subclassFeatureRefs']
    const current = Array.isArray(refs)
      ? refs.filter((value) => {
          const row = optionalDeclarationObject(value)
          return (
            typeof row.ref === 'string' &&
            decodeOptionalDeclaration(row.ref, first.kind)?.target === first.target
          )
        })
      : []
    return current.length === 1 &&
      exactRootReference(optionalDeclarationObject(current[0]), certificate)
      ? { classData: classes[0], parent, reference: current[0] as OptionalDeclarationReference }
      : undefined
  }
  function resolveCurrent(catalog: DeclarationCatalog, certificate: OptionalDeclarationRule) {
    const key = keyOf(certificate)
    const proofs = getProofs(catalog).filter((row) => row.kind === proofKind && row.target === key)
    if (
      !proofs.length ||
      new Set(proofs.map((row) => row.origin)).size !== 1 ||
      proofs.some(
        (row) =>
          row.version !== 1 ||
          row.verified !== true ||
          !row.origin ||
          row.certificate !== certificate.certificate ||
          Object.keys(row).some(
            (key) =>
              !['version', 'kind', 'target', 'certificate', 'origin', 'verified'].includes(key),
          ),
      )
    )
      return undefined
    const parent = currentParent(catalog, certificate)
    if (!parent) return undefined
    const resolved: Array<ClassFeature | SubclassFeature> = []
    for (let index = 0; index < certificate.features.length; index++) {
      const source = certificate.features[index]
      const identity =
        source.kind === 'classFeature' ? getClassFeatureIdentity : getSubclassFeatureIdentity
      const listed = (
        source.kind === 'classFeature' ? catalog.classFeatures : catalog.subclassFeatures
      ).filter((row) => identity(row) === source.target)
      const candidates =
        source.kind === 'classFeature'
          ? catalog.classFeatureCandidates
          : catalog.subclassFeatureCandidates
      const found = candidates !== undefined ? (candidates.get(source.target) ?? []) : listed
      if (source.kind === 'classFeature' && (listed.length !== 1 || found.length !== 1))
        return undefined
      if (
        !listed.length ||
        !found.length ||
        [...listed, ...found].some(
          (row) =>
            row.featureOptionSourceConflict ||
            identity(row) !== source.target ||
            !currentBodyMatches(
              cleanFeature(row),
              source.body,
              certificate.path[index + 1]?.target,
            ),
        )
      )
        return undefined
      // Agreeing parsed mirrors are allowed only behind this raw exact-one relation/body certificate.
      if ([...listed, ...found].some((row) => !same(cleanFeature(row), cleanFeature(found[0]))))
        return undefined
      const nested =
        index > 0
          ? getNestedReference(resolved[index - 1].entries, certificate.path[index])
          : undefined
      if (index > 0 && !nested) return undefined
      const attached = index === 0 ? parent.reference.feature : nested?.feature
      if (
        attached &&
        (identity(attached) !== source.target ||
          !currentBodyMatches(
            cleanFeature(attached),
            source.body,
            certificate.path[index + 1]?.target,
          ))
      )
        return undefined
      resolved.push(found[0])
    }
    // Attach only this already-proven current path, including the parser's unattached Paladin class ref.
    let reference: OptionalDeclarationReference | undefined
    for (let index = certificate.path.length - 1; index >= 0; index--) {
      const step = certificate.path[index]
      const feature =
        index === certificate.path.length - 1
          ? resolved[index]
          : {
              ...resolved[index],
              entries: [
                {
                  type:
                    certificate.path[index + 1].kind === 'classFeature'
                      ? 'refClassFeature'
                      : 'refSubclassFeature',
                  [certificate.path[index + 1].kind]: certificate.path[index + 1].uid,
                  feature: reference!.feature,
                },
              ],
            }
      reference = {
        ...decodeOptionalDeclaration(step.uid, step.kind)!.decoded,
        feature,
      } as OptionalDeclarationReference
    }
    const declarations = collectUnconditionalFeatureReferences(
      [reference!],
      certificate.path[0].kind,
    )
    if (
      declarations.filter(
        (row) => row.target === certificate.target && row.level === certificate.level,
      ).length !== 1
    )
      return undefined
    return {
      ...parent,
      feature: resolved[resolved.length - 1],
      level: certificate.level,
      certificate,
    }
  }
  function getNestedReference(entries: unknown, step: OptionalDeclarationRule['path'][number]) {
    const found: Row[] = []
    scanOptionalDeclarationReferences(entries, (uid, kind, row) => {
      if (
        kind === step.kind &&
        decodeOptionalDeclaration(uid, kind)?.target === step.target &&
        exactOptionalDeclarationReference(row, step.uid, kind)
      )
        found.push(row)
    })
    return found.length === 1 ? found[0] : undefined
  }
  const cache = new WeakMap<object, Map<string, ReturnType<typeof resolveCurrent>>>()
  /** Caller supplies the current catalog scoped to the actual full subclass owner, never a raw fallback. */
  function getCurrentOptionalDeclaration(
    catalog: DeclarationCatalog | undefined,
    owner: OptionalDeclarationOwner,
    target: string,
    level: number,
  ) {
    if (!catalog) return undefined
    const key = optionalDeclarationKey(owner, target, level),
      certificate = keys.get(key)
    if (!certificate) return undefined
    let values = cache.get(catalog)
    if (!values) {
      values = new Map()
      cache.set(catalog, values)
    }
    if (!values.has(key)) values.set(key, resolveCurrent(catalog, certificate))
    return values.get(key)
  }

  /** Winning owners or consumed class bodies replace relation proofs, including absent/invalid proof. */
  function mergeOptionalClassDeclarationSources(
    layers: readonly Pick<GameData, 'classes' | 'classFeatures'>[],
  ) {
    let result: DeclarationSourceProof<Kind>[] = []
    for (const layer of layers) {
      const replaced = new Set<string>()
      const classTargets = new Set(layer.classFeatures.map(getClassFeatureIdentity))
      const subclassTargets = collectLayerSubclassFeatures([layer])
      for (const [key, certificate] of keys) {
        const ownerPresent = layer.classes.some((cls) =>
          certificate.owner[0] === 'class'
            ? JSON.stringify(getOptionalDeclarationOwner(cls as unknown as Row, 'class')) ===
              JSON.stringify(certificate.owner)
            : (cls.subclasses ?? []).some(
                (sub) =>
                  JSON.stringify(getOptionalDeclarationOwner(sub as unknown as Row, 'subclass')) ===
                  JSON.stringify(certificate.owner),
              ),
        )
        const bodyPresent = certificate.features.some((source) =>
          (source.kind === 'classFeature' ? classTargets : subclassTargets).has(source.target),
        )
        if (ownerPresent || bodyPresent) replaced.add(key)
      }
      const incoming = getProofs(layer)
        .filter((row) => row.kind === proofKind && replaced.has(row.target))
        .map((row) => {
          const certificate = keys.get(row.target)!
          const ownerCount =
            certificate.owner[0] === 'class'
              ? layer.classes.filter(
                  (cls) =>
                    JSON.stringify(getOptionalDeclarationOwner(cls as unknown as Row, 'class')) ===
                    JSON.stringify(certificate.owner),
                ).length
              : layer.classes
                  .flatMap((cls) => cls.subclasses ?? [])
                  .filter(
                    (sub) =>
                      JSON.stringify(
                        getOptionalDeclarationOwner(sub as unknown as Row, 'subclass'),
                      ) === JSON.stringify(certificate.owner),
                  ).length
          const duplicateBody = certificate.features.some(
            (source) =>
              source.kind === 'classFeature' &&
              layer.classFeatures.filter(
                (value) => getClassFeatureIdentity(value) === source.target,
              ).length > 1,
          )
          return ownerCount > 1 || duplicateBody ? { ...row, verified: false } : row
        })
      result = [...result.filter((row) => !replaced.has(row.target)), ...incoming]
    }
    return result
  }

  return {
    audit: auditOptionalClassDeclarationSources,
    current: getCurrentOptionalDeclaration,
    merge: mergeOptionalClassDeclarationSources,
  }
}
