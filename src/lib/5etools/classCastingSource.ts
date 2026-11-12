import {
  type CasterProgression,
  getCasterLevelContribution,
  getSpellSlotsFromClassData,
  getStandardSpellSlotProvider,
  type SpellSlotRuleset,
} from '@/lib/calculations/spellSlots'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { ClassCastingSourceProof } from '@/types/classCasting'
import {
  CLASS_CASTING_PRODUCERS,
  getClassCastingCopyParent,
  getClassCastingProducersForOwner,
  getReplacementSpellcasting,
  replacementSpellcastingAddress,
} from './classCastingRules'
import generated from './classCastingRuntime.generated'
import {
  type CastingDomain,
  type CastingParentRule,
  castingDeclarationMetadata,
  castingParentKey,
  castingParentProjection,
  castingParsedParentMatches,
  getCastingParentOwner,
  getClassCastingRoots,
  getPlainCastingCopyParent,
  hasEquivalentReplacementSpellcasting,
} from './classCastingStructure'
import { getEffectiveSpellcastingClassData } from './classData'
import { getClassFeatureIdentity, getClassFeatureReferenceLevel } from './classFeatureIdentity'
import { createDeclarationSourceAccess, type DeclarationCatalog } from './declarationSourceAccess'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  type OptionalDeclarationOwner,
  optionalDeclarationDigest,
  optionalDeclarationKey,
  optionalDeclarationObject,
  type PreparedOptionalDeclarationSources,
} from './optionalClassDeclarationStructure'

export interface ClassCastingCatalog extends DeclarationCatalog {
  classCastingSources?: readonly ClassCastingSourceProof[]
  ambiguousClassFeatureTargets?: ReadonlySet<string>
}
export { CLASS_CASTING_PRODUCERS } from './classCastingRules'

const parents = new Map(
  (generated.parents as unknown as CastingParentRule[]).map((row) => [
    JSON.stringify(row.owner),
    row,
  ]),
)
const producers = new Map(
  CLASS_CASTING_PRODUCERS.map((row) => [
    optionalDeclarationKey(row.declaration.owner, row.declaration.target, row.declaration.level),
    row,
  ]),
)
// Use registered native UID spelling only for comparison. Copied targets keep their own parent.
const parentIdentities = new Map(
  [...parents.keys()].map((key) => {
    const candidates = CLASS_CASTING_PRODUCERS.filter((row) => row.parent === key).flatMap(
      (row) => [row.declaration, ...(row.declarationAlternatives ?? [])],
    )
    const identities = new Map(
      candidates.flatMap((row) => {
        const root = row.path[0]
        const decoded = root && decodeOptionalDeclaration(root.uid, root.kind)?.decoded
        if (
          !decoded ||
          typeof decoded.className !== 'string' ||
          typeof decoded.classSource !== 'string'
        )
          return []
        const identity = { name: decoded.className, source: decoded.classSource }
        return JSON.stringify(getCastingParentOwner(identity)) === key
          ? [[JSON.stringify(identity), identity] as const]
          : []
      }),
    )
    return [key, identities.size === 1 ? [...identities.values()][0] : undefined] as const
  }),
)
const proofs = (value: object) => {
  const rows = (value as ClassCastingCatalog).classCastingSources
  return Array.isArray(rows)
    ? rows.filter((row) => !!row && typeof row === 'object' && !Array.isArray(row))
    : []
}

const slotOrdinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

/** The class table's linked display label can be ordinal or numeric for the same slot column. */
function withCanonicalCastingSlotLabels<T extends object>(
  row: T,
  field: 'classTableGroups' | 'subclassTableGroups' = 'classTableGroups',
): T {
  const groups = (row as Record<string, unknown>)[field]
  if (!Array.isArray(groups)) return row
  let changed = false
  const normalized = groups.map((value) => {
    const group = optionalDeclarationObject(value)
    if (!Array.isArray(group.rowsSpellProgression) || !Array.isArray(group.colLabels)) return value
    let groupChanged = false
    const labels = group.colLabels.map((label: unknown, index) => {
      if (typeof label !== 'string') return label
      const match = /^\{@filter ([1-9])(\|spells\|level=\1\|(?:class|subclass)=[^{}|]+)\}$/.exec(
        label,
      )
      if (!match || Number(match[1]) !== index + 1) return label
      groupChanged = true
      return `{@filter ${slotOrdinals[index]}${match[2]}}`
    })
    if (!groupChanged) return value
    changed = true
    return { ...group, colLabels: labels }
  })
  return changed ? { ...row, [field]: normalized } : row
}

const declarations = createDeclarationSourceAccess(
  CLASS_CASTING_PRODUCERS.map((row) => row.declaration),
  'casting-declaration',
  (value) =>
    proofs(value).filter(
      (row): row is ClassCastingSourceProof & { kind: 'casting-declaration' } =>
        row.kind === 'casting-declaration',
    ),
  castingDeclarationMetadata,
)
const declarationPacks = [
  CLASS_CASTING_PRODUCERS.map((row) => row.declaration),
  ...Array.from(
    {
      length: Math.max(
        0,
        ...CLASS_CASTING_PRODUCERS.map((row) => row.declarationAlternatives?.length ?? 0),
      ),
    },
    (_, index) =>
      CLASS_CASTING_PRODUCERS.flatMap((row) =>
        row.declarationAlternatives?.[index] ? [row.declarationAlternatives[index]] : [],
      ),
  ),
]
const currentDeclarations = declarationPacks.map((rules) => {
  const certificates = new Map(
    rules.map((row) => [optionalDeclarationKey(row.owner, row.target, row.level), row.certificate]),
  )
  return {
    certificates,
    access: createDeclarationSourceAccess(
      rules,
      'casting-declaration',
      (value) =>
        proofs(value).filter(
          (row): row is ClassCastingSourceProof & { kind: 'casting-declaration' } =>
            row.kind === 'casting-declaration' && certificates.get(row.target) === row.certificate,
        ),
      castingDeclarationMetadata,
    ),
  }
})

function classRootDeclarations(row: Record<string, unknown>) {
  return (Array.isArray(row.classFeatures) ? row.classFeatures : []).map((value) => {
    const raw = optionalDeclarationObject(value)
    const uid = typeof value === 'string' ? value : raw.classFeature
    return { raw, uid }
  })
}

function isSpellcastingRoot({ raw, uid }: ReturnType<typeof classRootDeclarations>[number]) {
  return (
    (typeof uid === 'string' && uid.split('|', 1)[0].trim().toLowerCase() === 'spellcasting') ||
    (typeof raw.name === 'string' && raw.name.trim().toLowerCase() === 'spellcasting')
  )
}

function auditCopiedCastingTargets(
  row: Record<string, unknown>,
  owner: OptionalDeclarationOwner,
  parent: OptionalDeclarationOwner,
) {
  const roots = classRootDeclarations(row)
  const spellcastingRoots = roots.filter(isSpellcastingRoot)
  const refs = roots.flatMap(({ raw, uid }) => {
    const decoded = typeof uid === 'string' && decodeOptionalDeclaration(uid, 'classFeature')
    return typeof uid === 'string' && decoded ? [{ raw, uid, ...decoded }] : []
  })
  return getClassCastingProducersForOwner(parent).flatMap(({ declaration }) => {
    const root = decodeOptionalDeclaration(declaration.path[0].uid, 'classFeature')
    const name = root?.decoded.name.trim().toLowerCase()
    const atGain = refs.filter(
      ({ decoded }) =>
        decoded.level === declaration.level && decoded.name.trim().toLowerCase() === name,
    )
    if (name === 'spellcasting' && spellcastingRoots.length !== 1) return []
    if (
      atGain.length === 1 &&
      atGain[0].target === declaration.target &&
      exactOptionalDeclarationReference(atGain[0].raw, atGain[0].uid, 'classFeature')
    )
      return [declaration.target]
    const candidate = atGain[0]
    if (
      name !== 'spellcasting' ||
      atGain.length !== 1 ||
      !isDirectReplacementRoot(candidate.raw, candidate.uid)
    )
      return []
    const address = replacementSpellcastingAddress(candidate.target, declaration.target)
    return getReplacementSpellcasting(owner, address) ? [address] : []
  })
}

function isDirectReplacementRoot(row: Record<string, unknown>, uid: string) {
  return (
    Object.keys(row).every((key) =>
      ['classFeature', 'name', 'className', 'classSource', 'source', 'level'].includes(key),
    ) && exactOptionalDeclarationReference(row, uid, 'classFeature')
  )
}

/** Raw exact-one dependency evidence is captured before class/feature Maps can collapse it. */
export function auditClassCastingSources(
  value: unknown,
  origin: string,
  prepared?: PreparedOptionalDeclarationSources,
  copiedClasses?: readonly Record<string, unknown>[],
): ClassCastingSourceProof[] {
  const document = optionalDeclarationObject(value)
  const classes = Array.isArray(document.class)
    ? document.class.map((row) => withCanonicalCastingSlotLabels(optionalDeclarationObject(row)))
    : []
  const subclasses = (rows: unknown[]) =>
    rows.map((row) =>
      withCanonicalCastingSlotLabels(optionalDeclarationObject(row), 'subclassTableGroups'),
    )
  const castingDocument = {
    ...document,
    class: classes,
    subclass: Array.isArray(document.subclass) ? subclasses(document.subclass) : [],
  }
  const castingPrepared = prepared && { ...prepared, subclasses: subclasses(prepared.subclasses) }
  const result: ClassCastingSourceProof[] = currentDeclarations.flatMap(({ access }) =>
    access.audit(castingDocument, origin, castingPrepared),
  )
  for (const [target, rule] of parents) {
    const found = classes.filter((row) => JSON.stringify(getCastingParentOwner(row)) === target)
    if (!found.length) continue
    result.push({
      version: 1,
      kind: 'casting-parent',
      target,
      certificate: rule.rawDigest,
      origin: origin + ':' + target,
      verified:
        found.length === 1 &&
        !found[0]._copy &&
        optionalDeclarationDigest(castingParentProjection(found[0])) === rule.rawDigest,
    })
  }
  if (copiedClasses) {
    for (const [index, raw] of classes.entries()) {
      const owner = getCastingParentOwner(raw)
      const parent = getPlainCastingCopyParent(raw)
      if (
        !owner ||
        !parent ||
        !CLASS_CASTING_PRODUCERS.some(
          (rule) => JSON.stringify(rule.declaration.owner) === JSON.stringify(parent),
        )
      )
        continue
      const prepared = copiedClasses[index]
      const target = JSON.stringify(owner)
      const certificate = JSON.stringify(parent)
      result.push({
        version: 1,
        kind: 'casting-copy',
        target,
        certificate,
        origin: origin + ':' + target,
        copyTargets: prepared ? auditCopiedCastingTargets(prepared, owner, parent) : [],
        verified:
          target !== certificate &&
          !!prepared &&
          !prepared._copy &&
          JSON.stringify(getCastingParentOwner(prepared)) === target,
      })
    }
  }
  return result
}

function currentParent(catalog: ClassCastingCatalog, key: string) {
  const rule = parents.get(key)
  if (!rule) return undefined
  const found = (catalog.classes ?? []).filter(
    (row) =>
      JSON.stringify(getCastingParentOwner(row as unknown as Record<string, unknown>)) === key,
  )
  const evidence = proofs(catalog).filter(
    (row) => row.kind === 'casting-parent' && row.target === key,
  )
  const identity = parentIdentities.get(key)
  const comparison =
    identity && found.length === 1
      ? withCanonicalCastingSlotLabels({
          ...found[0],
          ...identity,
          subclasses: found[0].subclasses?.map((row) =>
            withCanonicalCastingSlotLabels(row, 'subclassTableGroups'),
          ),
        })
      : undefined
  if (
    found.length !== 1 ||
    evidence.length !== 1 ||
    evidence.some(
      (row) =>
        row.version !== 1 ||
        row.verified !== true ||
        !row.origin ||
        row.certificate !== rule.rawDigest ||
        Object.keys(row).some(
          (key) =>
            !['version', 'kind', 'target', 'certificate', 'origin', 'verified'].includes(key),
        ),
    ) ||
    !comparison ||
    !castingParsedParentMatches(comparison as unknown as Record<string, unknown>, rule)
  )
    return undefined
  return { classData: found[0], comparison, rule }
}

/** Source authority only: actor level, sources, adoption and occupied slots are checked separately. */
function getNativeClassCastingProducer(
  catalog: ClassCastingCatalog,
  owner: OptionalDeclarationOwner,
  target: string,
  level: number,
) {
  const rule = producers.get(optionalDeclarationKey(owner, target, level))
  if (!rule) return undefined
  const key = optionalDeclarationKey(owner, target, level)
  const packages = [rule.declaration, ...(rule.declarationAlternatives ?? [])]
  const known = new Set(packages.map((row) => row.certificate))
  const evidence = proofs(catalog).filter(
    (row) => row.kind === 'casting-declaration' && row.target === key,
  )
  // Inspect the complete relation group before any per-certificate filtering can hide bad evidence.
  if (
    known.size !== packages.length ||
    evidence.length !== known.size ||
    new Set(evidence.map((row) => row.certificate)).size !== known.size ||
    new Set(evidence.map((row) => row.origin)).size !== 1 ||
    evidence.some(
      (row) =>
        row.version !== 1 ||
        !known.has(row.certificate) ||
        typeof row.origin !== 'string' ||
        !row.origin.trim() ||
        typeof row.verified !== 'boolean' ||
        Object.keys(row).some(
          (field) =>
            !['version', 'kind', 'target', 'certificate', 'origin', 'verified'].includes(field),
        ),
    )
  )
    return undefined
  const verified = evidence.filter((row) => row.verified)
  if (verified.length !== 1) return undefined
  const selected = currentDeclarations.find(
    ({ certificates }) => certificates.get(key) === verified[0].certificate,
  )
  // Generic declaration consumers cache immutable catalog views. Casting reads revalidate
  // nested source edits at each operation; only their local producer verifier may reuse this result.
  const parent = currentParent(catalog, rule.parent)
  if (!parent) return undefined
  const compared = selected?.access.current(
    {
      ...catalog,
      classes: catalog.classes?.map((row) => (row === parent.classData ? parent.comparison : row)),
    },
    owner,
    target,
    level,
  )
  if (!compared) return undefined
  const declaration = {
    ...compared,
    classData: parent.classData,
    parent:
      owner[0] === 'class'
        ? (parent.classData as unknown as Record<string, unknown>)
        : compared.parent,
  }
  const subclass = owner[0] === 'subclass' ? declaration.parent : undefined
  if (
    Object.entries(rule.suppliers).some(
      ([field, supplier]) => (subclass?.[field] != null ? 'subclass' : 'class') !== supplier,
    )
  )
    return undefined
  const effective = getEffectiveSpellcastingClassData(
    parent.classData,
    subclass as unknown as NonNullable<Class5e['subclasses']>[number] | undefined,
  )!
  return { rule, declaration, effective }
}

type CurrentClassCastingProducer = NonNullable<ReturnType<typeof getNativeClassCastingProducer>> & {
  templateSources?: readonly string[]
}

export function getCurrentClassCastingProducer(
  catalog: ClassCastingCatalog,
  owner: OptionalDeclarationOwner,
  target: string,
  level: number,
): CurrentClassCastingProducer | undefined {
  const parent = getClassCastingCopyParent(owner, proofs(catalog))
  if (!parent) return getNativeClassCastingProducer(catalog, owner, target, level)
  const ownerKey = JSON.stringify(owner)
  const evidence = proofs(catalog).filter(
    (row) => row.kind === 'casting-copy' && row.target === ownerKey,
  )
  const found = (catalog.classes ?? []).filter(
    (row) => JSON.stringify(getCastingParentOwner(row)) === ownerKey,
  )
  if (
    found.length !== 1 ||
    found[0].sourceIdentityConflict ||
    evidence.length !== 1 ||
    evidence[0].version !== 1 ||
    evidence[0].verified !== true ||
    typeof evidence[0].origin !== 'string' ||
    !evidence[0].origin.trim() ||
    evidence[0].certificate !== JSON.stringify(parent) ||
    Object.keys(evidence[0]).length !== 7 ||
    !Array.isArray(evidence[0].copyTargets) ||
    !evidence[0].copyTargets.includes(target)
  )
    return undefined
  const replacement = getReplacementSpellcasting(owner, target)
  if (
    replacement &&
    (replacement.rule.parent !== JSON.stringify(parent) ||
      evidence[0].copyTargets.includes(replacement.template) ||
      evidence[0].copyTargets.filter(
        (candidate: string) =>
          getReplacementSpellcasting(owner, candidate)?.template === replacement.template,
      ).length !== 1)
  )
    return undefined
  const current = getNativeClassCastingProducer(
    catalog,
    parent,
    replacement?.template ?? target,
    level,
  )
  const classData = found[0]
  const comparisonIdentity = current && parentIdentities.get(current.rule.parent)
  const parentRule = current && parents.get(current.rule.parent)
  if (
    !current ||
    !comparisonIdentity ||
    !parentRule ||
    !castingParsedParentMatches(
      withCanonicalCastingSlotLabels({ ...classData, ...comparisonIdentity }),
      parentRule,
    )
  )
    return undefined

  if (replacement) {
    const refs = classData.classFeatureRefs?.filter(
      (ref) => ref.name.trim().toLowerCase() === 'spellcasting',
    )
    if (refs?.length !== 1 || catalog.ambiguousClassFeatureTargets?.has(replacement.target))
      return undefined
    const roots = classRootDeclarations(classData).filter(isSpellcastingRoot)
    if (roots.length !== 1) return undefined
    const [{ raw, uid }] = roots
    if (typeof uid !== 'string' || !isDirectReplacementRoot(raw, uid)) return undefined
    const attached = refs[0].feature
    const digest = attached && optionalDeclarationDigest(attached)
    const listed = catalog.classFeatures.filter(
      (row) => getClassFeatureIdentity(row) === replacement.target,
    )
    if (!digest || listed.length !== 1 || optionalDeclarationDigest(listed[0]) !== digest)
      return undefined
    const feature = getCurrentDirectClassFeature(
      classData,
      catalog,
      replacement.target,
      (candidate) =>
        [candidate.name, candidate.className, candidate.classSource, candidate.source].every(
          (part) => typeof part === 'string' && !!part.trim(),
        ) &&
        optionalDeclarationDigest(candidate) === digest &&
        hasEquivalentReplacementSpellcasting(
          candidate,
          current.declaration.feature as ClassFeature,
        ),
    )
    if (!feature) return undefined
    return {
      rule: replacement.rule,
      declaration: {
        ...current.declaration,
        classData,
        parent: classData,
        reference: refs[0],
        feature,
      },
      effective: classData,
      templateSources: [current.declaration.classData.source, current.declaration.feature.source],
    }
  }

  const roots = getClassCastingRoots(classData, target)
  const nativeRoots = getClassCastingRoots(current.declaration.classData, target)
  const name = current.declaration.feature.name.trim().toLowerCase()
  const refs = classData.classFeatureRefs?.filter(
    (row) =>
      row.name.trim().toLowerCase() === name &&
      (name === 'spellcasting' || getClassFeatureReferenceLevel(row) === level),
  )
  if (
    roots.length !== 1 ||
    nativeRoots.length !== 1 ||
    (name === 'spellcasting' &&
      classRootDeclarations(classData).filter(isSpellcastingRoot).length !== 1) ||
    optionalDeclarationDigest(roots) !== optionalDeclarationDigest(nativeRoots) ||
    refs?.length !== 1 ||
    !getCurrentDirectClassFeature(
      classData,
      catalog,
      target,
      (feature) =>
        optionalDeclarationDigest(feature) ===
        optionalDeclarationDigest(current.declaration.feature),
    )
  )
    return undefined
  return { ...current, effective: classData }
}

export function getClassCastingGainAuthority(
  catalog: ClassCastingCatalog,
  owner: OptionalDeclarationOwner,
  target: string,
  declarationLevel: number,
  domain: CastingDomain,
  gainLevel: number,
) {
  const current = getCurrentClassCastingProducer(catalog, owner, target, declarationLevel)
  return gainAuthority(catalog, current, domain, gainLevel)
}

/** A synchronous projection may reuse certification; no memo survives a new public source read. */
export function createClassCastingSourceAccess(catalog: ClassCastingCatalog) {
  const memo = new Map<string, ReturnType<typeof getCurrentClassCastingProducer>>()
  return {
    gain(
      owner: OptionalDeclarationOwner,
      target: string,
      declarationLevel: number,
      domain: CastingDomain,
      gainLevel: number,
    ) {
      const key = optionalDeclarationKey(owner, target, declarationLevel)
      if (!memo.has(key))
        memo.set(key, getCurrentClassCastingProducer(catalog, owner, target, declarationLevel))
      return gainAuthority(catalog, memo.get(key), domain, gainLevel)
    },
  }
}

function gainAuthority(
  catalog: ClassCastingCatalog,
  current: ReturnType<typeof getCurrentClassCastingProducer>,
  domain: CastingDomain,
  gainLevel: number,
) {
  const gain = current?.rule.domains[domain]?.find((row) => row.level === gainLevel)
  if (!current || !gain) return undefined
  if (domain === 'class-cantrip')
    return { ...current, gain, maxSpellLevel: 0, provider: undefined as Class5e | undefined }
  if (domain === 'class-arcanum')
    return {
      ...current,
      gain,
      maxSpellLevel: gain.spellLevel!,
      provider: undefined as Class5e | undefined,
    }
  const access = levelAccess(catalog, current, gainLevel)
  return access ? { ...access, gain } : undefined
}

/** Certified access at this owner's class level, including daily producers with no numeric gains. */
export function getClassCastingLevelAccess(
  catalog: ClassCastingCatalog,
  owner: OptionalDeclarationOwner,
  target: string,
  declarationLevel: number,
  classLevel: number,
) {
  if (!Number.isInteger(classLevel) || classLevel < declarationLevel || classLevel > 20)
    return undefined
  const current = getCurrentClassCastingProducer(catalog, owner, target, declarationLevel)
  return levelAccess(catalog, current, classLevel)
}

function levelAccess(
  catalog: ClassCastingCatalog,
  current: ReturnType<typeof getCurrentClassCastingProducer>,
  classLevel: number,
) {
  if (
    !Number.isInteger(classLevel) ||
    !current ||
    classLevel < current.rule.declaration.level ||
    classLevel > 20
  )
    return undefined
  const { effective } = current
  const own = getSpellSlotsFromClassData(effective, classLevel)
  let slots = own
  let provider: Class5e | undefined
  if (slots === null) {
    const progression = (effective.casterProgression ?? 'none') as CasterProgression
    if (progression === 'pact' || progression === 'none') return undefined
    const selected = getCurrentStandardSpellSlotProvider(
      catalog,
      getCasterLevelContribution(progression, classLevel),
      effective.edition === 'one' || effective.source.trim().toUpperCase() === 'XPHB'
        ? '2024'
        : '2014',
    )
    if (!selected) return undefined
    provider = selected.classData
    slots = selected.slots
  }
  const maxSpellLevel = Object.keys(slots)
    .map(Number)
    .reduce((max, level) => Math.max(max, level), 0)
  return { ...current, maxSpellLevel, provider }
}

/** Validate the actual complete-catalog winner, without falling back to a different approved row. */
export function getCurrentStandardSpellSlotProvider(
  catalog: ClassCastingCatalog,
  casterLevel: number,
  ruleset: SpellSlotRuleset,
) {
  const selected = getStandardSpellSlotProvider(catalog.classes ?? [], casterLevel, ruleset)
  if (!selected) return undefined
  const owner = getCastingParentOwner(selected.classData as unknown as Record<string, unknown>)
  const proven = owner && currentParent(catalog, JSON.stringify(owner))
  return proven?.rule.standard && proven.classData === selected.classData ? selected : undefined
}

/** Current selected noncasters can determine the combined ruleset without becoming contributors. */
export function getCurrentClassCastingParent(
  catalog: ClassCastingCatalog,
  owner: readonly ['class', string, string],
) {
  return currentParent(catalog, JSON.stringify(owner))?.classData
}

export function mergeClassCastingSources(
  layers: readonly Pick<GameData, 'classes' | 'classFeatures'>[],
): ClassCastingSourceProof[] {
  let result: ClassCastingSourceProof[] = []
  for (const layer of layers) {
    const replaced = new Set(
      layer.classes.flatMap((row) => {
        const owner = getCastingParentOwner(row as unknown as Record<string, unknown>)
        return owner ? [castingParentKey(owner)] : []
      }),
    )
    const incoming = proofs(layer)
      .filter(
        (row) =>
          (row.kind === 'casting-parent' || row.kind === 'casting-copy') &&
          replaced.has(row.target),
      )
      .map((row) =>
        layer.classes.filter((cls) => {
          const owner = getCastingParentOwner(cls as unknown as Record<string, unknown>)
          return owner && castingParentKey(owner) === row.target
        }).length === 1
          ? row
          : { ...row, verified: false },
      )
    result = [...result.filter((row) => !replaced.has(row.target)), ...incoming]
  }
  return [...declarations.merge(layers), ...result]
}
