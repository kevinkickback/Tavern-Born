import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  optionalDeclarationDigest,
} from './optionalClassDeclarationStructure'

type CurrentClassCatalog = ClassFeatureSourceCatalog & {
  classes?: readonly Class5e[]
  ambiguousClassFeatureTargets?: ReadonlySet<string>
}

export function permitsClassRuleSource(character: Character, source: string | undefined) {
  return (
    !!source?.trim() &&
    getSourceCompatibility(source, character.originSystem).compatible &&
    (!character.allowedSources?.length ||
      getEffectiveSources(character.allowedSources, character.originSystem).some(
        (allowed) => norm(allowed) === norm(source),
      ))
  )
}

export function getCurrentSelectedClass(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: CurrentClassCatalog | undefined,
) {
  if (
    !permitsClassRuleSource(character, entry.source) ||
    character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1
  )
    return undefined
  const classes = catalogs?.classes?.filter((cls) => findClassReference(entry, [cls]))
  const cls = classes?.[0]
  return classes?.length === 1 && cls && !cls._copy && !cls.sourceIdentityConflict ? cls : undefined
}

/** The actor's declaration authorizes the rule. The target can have a different printing. */
export function getEarnedDirectClassFeature(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: CurrentClassCatalog | undefined,
  target: string,
  verify?: (feature: ClassFeature) => boolean,
) {
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  if (!cls || !catalogs || catalogs.ambiguousClassFeatureTargets?.has(target)) return undefined
  if (!cls.classFeatureRefs?.some((ref) => getClassFeatureIdentity(ref) === target))
    return undefined
  const rows = catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  if (rows.length !== 1) return undefined
  const digest = optionalDeclarationDigest(rows[0])
  if (!digest) return undefined
  const feature = getCurrentDirectClassFeature(
    cls,
    catalogs,
    target,
    (row) =>
      !!row.level &&
      row.level <= entry.levels &&
      !!row.className?.trim() &&
      permitsClassRuleSource(character, row.classSource) &&
      permitsClassRuleSource(character, row.source) &&
      optionalDeclarationDigest(row) === digest &&
      (!verify || verify(row)),
  )
  return feature && { cls, feature, target, owner: entry }
}

/** A direct variant can replace a gain for one explicitly named subclass printing. */
export function hasCurrentSubclassFeatureReplacement(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: CurrentClassCatalog | undefined,
  cls: Class5e,
  target: string,
  level: number,
) {
  if (!catalogs || !permitsClassRuleSource(character, entry.subclassSource)) return false
  const subclasses = cls.subclasses?.filter(
    (row) =>
      !row.sourceIdentityConflict &&
      findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]) &&
      findClassReference(entry, [{ name: row.className, source: row.classSource }]),
  )
  if (subclasses?.length !== 1) return false
  const [subclass] = subclasses
  return (
    cls.classFeatureRefs?.some((ref) => {
      const replacement = getClassFeatureIdentity(ref)
      if (
        !replacement ||
        ref.level !== level ||
        replacement === target ||
        catalogs.ambiguousClassFeatureTargets?.has(replacement)
      )
        return false
      const variant = getCurrentDirectClassFeature(
        cls,
        catalogs,
        replacement,
        (feature) => {
          const line = feature.entries?.[0]
          if (
            feature.isClassFeatureVariant !== true ||
            !permitsClassRuleSource(character, feature.classSource) ||
            !permitsClassRuleSource(character, feature.source) ||
            typeof line !== 'string'
          )
            return false
          const clause =
            /^This feature replaces the \{@classFeature ([^{}]+)\} feature for a \{@class ([^{}]+)\} with the \{@subclass ([^{}]+)\} subclass\.$/.exec(
              line,
            )
          if (!clause || decodeOptionalDeclaration(clause[1], 'classFeature')?.target !== target)
            return false
          const actor = clause[2].split('|').map(norm)
          const selection = clause[3].split('|').map(norm)
          return (
            actor.length === 2 &&
            actor[0] === norm(entry.name) &&
            actor[1] === norm(entry.source) &&
            selection.length === 4 &&
            [norm(subclass.name), norm(subclass.shortName)].includes(selection[0]) &&
            selection[1] === actor[0] &&
            selection[2] === actor[1] &&
            selection[3] === norm(subclass.source)
          )
        },
        { includeDisplayOnly: true },
      )
      return !!variant
    }) ?? false
  )
}
