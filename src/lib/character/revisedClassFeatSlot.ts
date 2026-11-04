import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getCurrentClassCastingProducer } from '@/lib/5etools/classCastingSource'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisiteRules'
import { getTotalClassLevels } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'

function getCurrentClassFeature(target: string, catalogs: ClassChoiceFeatureCatalogs) {
  const candidates = catalogs.classFeatureCandidates
    ? (catalogs.classFeatureCandidates.get(target) ?? [])
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  return candidates.length === 1 && !candidates[0].sourceIdentityConflict
    ? candidates[0]
    : undefined
}

function hasOpenFeatDeclaration(
  cls: Class5e,
  level: number,
  catalogs: ClassChoiceFeatureCatalogs,
): boolean {
  const gains = collectUnconditionalFeatureReferences(
    cls.classFeatureRefs ?? [],
    'classFeature',
  ).filter(
    (gain) =>
      gain.kind === 'classFeature' &&
      gain.level === level &&
      /^(ability score improvement|epic boon)$/i.test(gain.reference.name.trim()),
  )
  if (gains.length !== 1 || gains[0].reference.feature?.sourceIdentityConflict) return false
  const feature = getCurrentClassFeature(gains[0].target, catalogs)
  return (
    !!feature &&
    !!findClassReference({ name: feature.className, source: feature.classSource }, [cls]) &&
    (feature.entries ?? []).some(
      (entry) =>
        typeof entry === 'string' &&
        /\bor another (?:feat|\{@5etools feat\|feats\.html\}) of your choice for which you qualify\./i.test(
          entry,
        ),
    )
  )
}

function progressionAtGain(
  character: Character,
  owner: CharacterClassEntry,
  level: number,
): CharacterClassEntry[] | undefined {
  const progression = character.classProgression
  const total = getTotalClassLevels(progression)
  const gains = [...(character.hitPointGains ?? [])].sort(
    (a, b) => a.characterLevel - b.characterLevel,
  )
  const first = findClassReference(character.initialClass ?? progression[0], progression)
  if (!first || gains.length !== total - 1) return undefined

  const counts = new Map<CharacterClassEntry, number>([[first, 1]])
  let earned: Map<CharacterClassEntry, number> | undefined
  for (const [index, gain] of gains.entries()) {
    const entry = findClassReference(
      { name: gain.className, source: gain.classSource },
      progression,
    )
    if (!entry || gain.characterLevel !== index + 2) return undefined
    if (gain.classLevel !== (counts.get(entry) ?? 0) + 1 || gain.classLevel > entry.levels)
      return undefined
    counts.set(entry, gain.classLevel)
    if (entry === owner && gain.classLevel === level) earned = new Map(counts)
  }
  if (!earned || progression.some((entry) => counts.get(entry) !== entry.levels)) return undefined
  return progression.flatMap((entry) => {
    const levels = earned.get(entry)
    return levels ? [{ ...entry, levels }] : []
  })
}

function getEarnedSpellcasting(
  progression: readonly CharacterClassEntry[],
  catalogs: ClassChoiceFeatureCatalogs,
): boolean | undefined {
  let unverified = false
  const found = progression.some((entry) => {
    const classes = catalogs.classes?.filter((row) => findClassReference(entry, [row])) ?? []
    const cls = classes[0]
    if (classes.length !== 1 || cls.sourceIdentityConflict) {
      unverified = true
      return false
    }
    const subclasses =
      cls.subclasses?.filter((candidate) =>
        findClassReference({ name: entry.subclass, source: entry.subclassSource }, [candidate]),
      ) ?? []
    const subclass =
      subclasses.length === 1 && !subclasses[0].sourceIdentityConflict ? subclasses[0] : undefined
    if (entry.subclass && !subclass) unverified = true
    const castingEntry = subclass
      ? entry
      : { ...entry, subclass: undefined, subclassSource: undefined }
    const declaration = getClassSpellProfilePolicy(castingEntry).rule?.declaration
    if (declaration && declaration.level <= entry.levels) {
      const { owner, target, level } = declaration
      const scoped = scopeClassChoiceFeatureCatalogs(
        catalogs,
        owner[0] === 'subclass'
          ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
          : undefined,
      )
      const current = getCurrentClassCastingProducer(scoped, owner, target, level)
      if (current && /^(spellcasting|pact magic)$/i.test(current.declaration.feature.name))
        return true
      unverified = true
    } else if (!declaration) {
      const references = [
        ...collectUnconditionalFeatureReferences(cls.classFeatureRefs ?? [], 'classFeature'),
        ...collectUnconditionalFeatureReferences(
          subclass?.subclassFeatureRefs ?? [],
          'subclassFeature',
        ),
      ]
      if (
        references.some(
          ({ reference, level }) =>
            level <= entry.levels && /^(spellcasting|pact magic)$/i.test(reference.name.trim()),
        )
      )
        unverified = true
    }
    return false
  })
  return found ? true : unverified ? undefined : false
}

/** Resolve an earned revised slot and the progression we can prove at its gain. */
export function getRevisedClassFeatSlot(
  character: Character,
  request: { name: string; source: string; level: number },
  catalogs: ClassChoiceFeatureCatalogs,
):
  | (Pick<
      PrereqCharacterSnapshot,
      'progression' | 'maximumCharacterLevel' | 'hasSpellcastingFeature'
    > & { openFeatCategories: boolean })
  | undefined {
  const owner = findClassReference(request, character.classProgression)
  const classes = catalogs.classes?.filter((row) => findClassReference(request, [row])) ?? []
  const cls = classes[0]
  if (
    !owner ||
    classes.length !== 1 ||
    cls.sourceIdentityConflict ||
    (cls.edition !== 'one' && cls.source.toUpperCase() !== 'XPHB') ||
    request.level > owner.levels ||
    !getASILevelsFromClass(cls).includes(request.level)
  )
    return undefined

  const known = progressionAtGain(character, owner, request.level)
  const progression = known ?? [{ ...owner, levels: request.level }]
  const earnedSpellcasting = getEarnedSpellcasting(progression, catalogs)
  return {
    openFeatCategories: hasOpenFeatDeclaration(cls, request.level, catalogs),
    progression,
    maximumCharacterLevel: known
      ? getTotalClassLevels(known)
      : getTotalClassLevels(character.classProgression) - owner.levels + request.level,
    hasSpellcastingFeature:
      earnedSpellcasting === false &&
      !known &&
      getEarnedSpellcasting(character.classProgression, catalogs) !== false
        ? undefined
        : earnedSpellcasting,
  }
}
