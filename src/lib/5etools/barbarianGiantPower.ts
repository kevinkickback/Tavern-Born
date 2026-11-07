import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Spell5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import { GIANT_POWER_TARGET } from './barbarianPathChoiceIdentity'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

const introTarget = 'subclass-feature|path of the giant|barbarian|phb|giant|bgg|3|bgg'
export const isGiantPowerSourceFeature = (target?: string) =>
  target === introTarget || target === GIANT_POWER_TARGET

const giantPath = { name: 'Path of the Giant', shortName: 'Giant', source: 'BGG' }
const includedSrdGiantSpells = new Map([
  ['druidcraft', '36c624dc226e2091417341b2f7106880fca4ad176b789efa1bc038cc5310f81e'],
  ['thaumaturgy', 'ea96e00f8aa18a2302179559a2e34d2f4705706ca439e2cb0bd43aefc2040ad3'],
])
const parsedSpellFields = new Set([
  'classes',
  'classSpellRoutes',
  'classSpellRouteSource',
  'classSpellRouteDiagnostics',
])

/** The Included SRD omits editorial reprint metadata. Require its exact classic record. */
export function hasIncludedSrdGiantSpellProof(
  name: string,
  spells: Readonly<Record<string, Spell5e>> | undefined,
) {
  const key = norm(name)
  const digest = includedSrdGiantSpells.get(key)
  if (!digest) return false
  const classics = Object.values(spells ?? {}).filter(
    (spell) => norm(spell.name) === key && norm(spell.source) === 'phb',
  )
  const classic = classics[0]
  if (classics.length !== 1 || classic.classSpellRouteSource?.input.targetOccurrences.length !== 1)
    return false
  const original = Object.fromEntries(
    Object.entries(classic).filter(([key]) => !parsedSpellFields.has(key)),
  )
  return getFeatureSourceDigest([original], false) === digest
}
export const ancestralPath = {
  name: 'Path of the Ancestral Guardian',
  shortName: 'Ancestral Guardian',
  source: 'XGE',
}
export const matchesBarbarianPath = (
  row: Record<string, unknown>,
  path: typeof giantPath,
  source: string,
) =>
  row.name === path.name &&
  row.shortName === path.shortName &&
  row.source === path.source &&
  row.className === 'Barbarian' &&
  row.classSource === source

export function auditInheritedBarbarianRoots(
  raw: readonly Record<string, unknown>[],
  materialized: readonly Record<string, unknown>[],
) {
  return materialized.map((row, index) => {
    const path = [giantPath, ancestralPath].find((path) => matchesBarbarianPath(row, path, 'XPHB'))
    if (!path) return row
    const bases = raw.filter((row) => matchesBarbarianPath(row, path, 'PHB'))
    const original = raw[index]
    const copy = record(original._copy)
    return matchesBarbarianPath(copy, path, 'PHB') &&
      !('_mod' in copy) &&
      !('additionalSpells' in original) &&
      !('subclassFeatures' in original) &&
      (path !== giantPath || !('spellcastingAbility' in original)) &&
      bases.length === 1 &&
      !('_copy' in bases[0]) &&
      !bases[0].sourceIdentityConflict
      ? row
      : { ...row, sourceIdentityConflict: true }
  })
}

export function getCurrentGiantPower(cls: Class5e, subclass: Subclass5e) {
  const source = norm(cls.source)
  if (source !== 'phb' && source !== 'xphb') return undefined
  const revised = source === 'xphb'
  if (
    norm(cls.name) !== 'barbarian' ||
    !matchesBarbarianPath(record(subclass), giantPath, cls.source) ||
    subclass.sourceIdentityConflict ||
    subclass.spellcastingAbility !== 'wis' ||
    (revised
      ? !matchesBarbarianPath(record(subclass._copy), giantPath, 'PHB')
      : !!subclass._copy) ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !==
      '87f2529c285cb4ca33c89f792d36083aec7490a2d10c2879f5ccafa449f83008' ||
    !matchesNativeSubclassGain(
      cls,
      revised
        ? 'class-feature|barbarian subclass|barbarian|xphb|3|xphb'
        : 'class-feature|primal path|barbarian|phb|3|phb',
      3,
    )
  )
    return undefined
  const exact = (feature: SubclassFeature | undefined, target: string, body: string) =>
    !!feature &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    getFeatureSourceDigest(feature.entries ?? []) === body
  const intro = getDirectSubclassFeatureReference(subclass, introTarget)
  if (
    !intro ||
    intro.ref !== subclass.introFeatureRef ||
    !exact(
      intro.feature,
      introTarget,
      'a1ec17a7adacf21ff156b8748da5c088a0fcfcc2ad421eda00245632a2d561d0',
    )
  )
    return undefined
  const refs = (intro.feature?.entries ?? [])
    .map(record)
    .filter(
      (row) =>
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target ===
          GIANT_POWER_TARGET,
    )
  const child = refs[0]
  const power = child?.feature as SubclassFeature | undefined
  return refs.length === 1 &&
    exactOptionalDeclarationReference(child, String(child.subclassFeature), 'subclassFeature') &&
    exact(
      power,
      GIANT_POWER_TARGET,
      'c109955cf9249ef99e5a92e48a36544b97a62b2a48cd2d5db92a71ba7e2f3dab',
    )
    ? power
    : undefined
}
