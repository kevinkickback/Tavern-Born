import {
  type CasterProgression,
  getCasterLevelContribution,
  getSpellSlotsFromClassData,
  getStandardSpellSlotProvider,
} from '@/lib/calculations/spellSlots'
import type { Class5e, GameData } from '@/types/5etools'
import type { ClassCastingSourceProof } from '@/types/classCasting'
import { CLASS_CASTING_PRODUCERS } from './classCastingRules'
import generated from './classCastingRuntime.generated'
import {
  type CastingDomain,
  type CastingParentRule,
  castingParentKey,
  castingParentProjection,
  castingParsedParentMatches,
  getCastingParentOwner,
} from './classCastingStructure'
import { getEffectiveSpellcastingClassData } from './classData'
import { createDeclarationSourceAccess, type DeclarationCatalog } from './declarationSourceAccess'
import {
  type OptionalDeclarationOwner,
  optionalDeclarationDigest,
  optionalDeclarationKey,
  optionalDeclarationObject,
  type PreparedOptionalDeclarationSources,
} from './optionalClassDeclarationStructure'

export interface ClassCastingCatalog extends DeclarationCatalog {
  classCastingSources?: readonly ClassCastingSourceProof[]
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
const proofs = (value: object) => {
  const rows = (value as ClassCastingCatalog).classCastingSources
  return Array.isArray(rows)
    ? rows.filter((row) => !!row && typeof row === 'object' && !Array.isArray(row))
    : []
}
const declarations = createDeclarationSourceAccess(
  CLASS_CASTING_PRODUCERS.map((row) => row.declaration),
  'casting-declaration',
  (value) =>
    proofs(value).filter(
      (row): row is ClassCastingSourceProof & { kind: 'casting-declaration' } =>
        row.kind === 'casting-declaration',
    ),
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
    access: createDeclarationSourceAccess(rules, 'casting-declaration', (value) =>
      proofs(value).filter(
        (row): row is ClassCastingSourceProof & { kind: 'casting-declaration' } =>
          row.kind === 'casting-declaration' && certificates.get(row.target) === row.certificate,
      ),
    ),
  }
})

/** Raw exact-one dependency evidence is captured before class/feature Maps can collapse it. */
export function auditClassCastingSources(
  value: unknown,
  origin: string,
  prepared?: PreparedOptionalDeclarationSources,
): ClassCastingSourceProof[] {
  const document = optionalDeclarationObject(value)
  const classes = Array.isArray(document.class) ? document.class.map(optionalDeclarationObject) : []
  const result: ClassCastingSourceProof[] = currentDeclarations.flatMap(({ access }) =>
    access.audit(value, origin, prepared),
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
  if (
    found.length !== 1 ||
    !evidence.length ||
    new Set(evidence.map((row) => row.origin)).size !== 1 ||
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
    !castingParsedParentMatches(found[0] as unknown as Record<string, unknown>, rule)
  )
    return undefined
  return { classData: found[0], rule }
}

/** Source authority only: actor level, sources, adoption and occupied slots are checked separately. */
export function getCurrentClassCastingProducer(
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
  const declaration = selected?.access.current(catalog, owner, target, level)
  const parent = currentParent(catalog, rule.parent)
  if (!declaration || !parent) return undefined
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

export function getClassCastingGainAuthority(
  catalog: ClassCastingCatalog,
  owner: OptionalDeclarationOwner,
  target: string,
  declarationLevel: number,
  domain: CastingDomain,
  gainLevel: number,
) {
  const current = getCurrentClassCastingProducer(catalog, owner, target, declarationLevel)
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
  const access = getClassCastingLevelAccess(catalog, owner, target, declarationLevel, gainLevel)
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
  if (!current) return undefined
  const { effective } = current
  const own = getSpellSlotsFromClassData(effective, classLevel)
  let slots = own
  let provider: Class5e | undefined
  if (slots === null) {
    const progression = (effective.casterProgression ?? 'none') as CasterProgression
    if (progression === 'pact' || progression === 'none') return undefined
    const selected = getStandardSpellSlotProvider(
      catalog.classes ?? [],
      getCasterLevelContribution(progression, classLevel),
      effective.edition === 'one' || effective.source.trim().toUpperCase() === 'XPHB'
        ? '2024'
        : '2014',
    )
    if (!selected) return undefined
    provider = selected.classData
    const owner = getCastingParentOwner(provider as unknown as Record<string, unknown>)
    const proven = owner && currentParent(catalog, JSON.stringify(owner))
    // Validate the actual helper winner; never select again from an approved-only reduced pool.
    if (!proven?.rule.standard || proven.classData !== provider) return undefined
    slots = selected.slots
  }
  const maxSpellLevel = Object.keys(slots)
    .map(Number)
    .reduce((max, level) => Math.max(max, level), 0)
  return { ...current, maxSpellLevel, provider }
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
      .filter((row) => row.kind === 'casting-parent' && replaced.has(row.target))
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
