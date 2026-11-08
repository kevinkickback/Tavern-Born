import type { ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

/** Materialize the same earned strike options for Details and the sheet. */
export function getRogueStrikeEntries(feature: ClassFeature, catalogs: ClassFeatureSourceCatalog) {
  if (
    feature.className !== 'Rogue' ||
    !['Cunning Strike', 'Devious Strikes'].includes(feature.name)
  )
    return feature.entries ?? []
  return (feature.entries ?? []).map((entry) => {
    const group = record(entry)
    if (group.type !== 'entries' || !Array.isArray(group.entries)) return entry
    return {
      ...group,
      entries: group.entries.flatMap((value) => {
        const reference = record(value)
        const uid = reference.classFeature
        if (reference.type !== 'refClassFeature' || typeof uid !== 'string') return [value]
        const target = decodeOptionalDeclaration(uid, 'classFeature')?.target
        if (!target || !exactOptionalDeclarationReference(reference, uid, 'classFeature')) return []
        const candidates = catalogs.classFeatureCandidates
          ? (catalogs.classFeatureCandidates.get(target) ?? [])
          : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
        const [candidate] = candidates
        return candidates.length === 1 &&
          getClassFeatureIdentity(candidate) === target &&
          !candidate.sourceIdentityConflict &&
          !candidate.featureOptionSourceConflict &&
          !candidate.isClassFeatureVariant &&
          !('_copy' in candidate) &&
          candidate.className === feature.className &&
          candidate.classSource === feature.classSource &&
          candidate.source === feature.source &&
          candidate.level === feature.level &&
          candidate.name !== feature.name &&
          candidate.entries?.length
          ? [{ type: 'entries', name: candidate.name, entries: candidate.entries }]
          : []
      }),
    }
  })
}
