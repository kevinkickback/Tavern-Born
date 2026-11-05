import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'

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
  if (!druid) return undefined
  const capstone = getCurrentDirectClassFeature(druid, catalogs, archdruidTarget)
  const base = capstone && getCurrentDirectClassFeature(druid, catalogs, CLASSIC_WILD_SHAPE_TARGET)
  if (!base || !Array.isArray(capstone?.entries)) return undefined
  const matches = capstone.entries.filter(
    (line): line is string => typeof line === 'string' && unlimitedSentence.test(line.trim()),
  )
  return matches.length === 1 ? matches[0].trim() : undefined
}
