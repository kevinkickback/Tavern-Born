import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from './optionalClassDeclarationStructure'

export const CLASSIC_WILD_SHAPE_RESOURCE_ID = 'druid-wild-shape'
export const CLASSIC_WILD_SHAPE_TARGET = 'class-feature|wild shape|druid|phb|2|phb'
const archdruidTarget = 'class-feature|archdruid|druid|phb|20|phb'
const unlimitedSentence =
  /^At 20th level, you can use your Wild Shape an unlimited number of times\.$/i

export function isClassicDruid(entry: Pick<CharacterClassEntry, 'name' | 'source'>): boolean {
  return (
    normalizeOwnerIdentity(entry.name) === 'druid' && normalizeOwnerIdentity(entry.source) === 'phb'
  )
}

const targetOf = (uid: unknown) =>
  typeof uid === 'string' ? decodeOptionalDeclaration(uid, 'classFeature')?.target : undefined

function getCurrentGain(druid: Class5e, catalogs: ClassFeatureSourceCatalog, target: string) {
  const declared = druid.classFeatures?.filter(
    (row) => (targetOf(row) ?? targetOf(optionalDeclarationObject(row).classFeature)) === target,
  )
  if (declared?.length !== 1 || targetOf(declared[0]) !== target) return undefined
  const refs = druid.classFeatureRefs?.filter(
    (row) => targetOf(row.ref) === target || getClassFeatureIdentity(row) === target,
  )
  const ref = refs?.length === 1 ? refs[0] : undefined
  const refRow = optionalDeclarationObject(ref)
  if (
    !ref?.feature ||
    ref.feature.sourceIdentityConflict ||
    ref.feature.isClassFeatureVariant ||
    refRow.sourceIdentityConflict ||
    refRow.isClassFeatureVariant ||
    ref.gainSubclassFeature ||
    targetOf(ref.ref) !== target ||
    !exactOptionalDeclarationReference(refRow, ref.ref, 'classFeature') ||
    getClassFeatureIdentity(ref.feature) !== target
  )
    return undefined
  const rows = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(target)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  const feature = rows?.length === 1 ? rows[0] : undefined
  return feature &&
    !feature.sourceIdentityConflict &&
    !feature.isClassFeatureVariant &&
    getClassFeatureIdentity(feature) === target
    ? feature
    : undefined
}

/** The classic capstone changes its finite pool only while both exact gains are current. */
export function getClassicArchdruidWildShapeRule(
  progression: readonly CharacterClassEntry[],
  classes: readonly Class5e[] | undefined,
  catalogs: ClassFeatureSourceCatalog | undefined,
): string | undefined {
  if (!catalogs || !progression.some((entry) => isClassicDruid(entry) && entry.levels === 20))
    return undefined
  const owners = classes?.filter(isClassicDruid)
  const druid = owners?.length === 1 ? owners[0] : undefined
  if (!druid || druid.sourceIdentityConflict || druid._copy) return undefined
  const capstone = getCurrentGain(druid, catalogs, archdruidTarget)
  const base = capstone && getCurrentGain(druid, catalogs, CLASSIC_WILD_SHAPE_TARGET)
  if (!base || !Array.isArray(capstone?.entries)) return undefined
  const matches = capstone.entries.filter(
    (line): line is string => typeof line === 'string' && unlimitedSentence.test(line.trim()),
  )
  return matches.length === 1 ? matches[0].trim() : undefined
}
