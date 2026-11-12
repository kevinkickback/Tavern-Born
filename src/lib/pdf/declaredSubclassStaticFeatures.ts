import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import {
  getDirectSubclassFeatureReference,
  isInheritedClassicSubclass,
} from '@/lib/5etools/nativeSubclassFeatureSource'
import {
  getCurrentNativeSubclassGain,
  matchesNativeSubclassGain,
} from '@/lib/5etools/nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from '@/lib/5etools/ownedSubclassFeature'
import {
  getPsaKnowledgeIntroDependency,
  isPsaKnowledgeDependency,
} from '@/lib/5etools/psaKnowledgeFeatures'
import { XPHB_LEGACY_SUBCLASS_KEYS } from '@/lib/5etools/rulesetMetadata'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

/** A configured subclass may retain its classic feature UID on a revised owner. */
export function getDeclaredSubclassStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  gain: { expandNestedRules?: true; expandUncountedFixedGroups?: true } & (
    | { level: number; intro: string; later: string }
    | { sourceDeclaredGains: true; inheritedCharacter?: Character }
  ),
) {
  const first = 'level' in gain ? gain.level : getCurrentNativeSubclassGain(cls)?.level
  if (
    !entry.subclass ||
    !entry.subclassSource ||
    !Number.isInteger(entry.levels) ||
    first === undefined ||
    entry.levels < first ||
    entry.levels > 20 ||
    !findClassReference(entry, [cls])
  )
    return []
  const source = norm(cls.source)
  const className = norm(cls.name)
  const classTarget = (name: string, level: number) =>
    `class-feature|${name}|${className}|${source}|${level}|${source}`
  const matches = cls.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  const subclass = matches?.[0]
  if (
    matches?.length !== 1 ||
    !subclass ||
    typeof subclass.shortName !== 'string' ||
    subclass.sourceIdentityConflict ||
    !findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return []
  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const current = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)
    : catalogs.subclassFeatureCandidates
  const verified = (feature: SubclassFeature | undefined, target: string) => {
    if (!feature || !Array.isArray(feature.entries) || !feature.entries.length) return undefined
    const digest = getFeatureSourceDigest(feature.entries)
    const candidates =
      current?.get(target) ??
      (catalogs.subclassTargets || current
        ? []
        : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target))
    const valid = (row: SubclassFeature) =>
      !row.sourceIdentityConflict &&
      !row.featureOptionSourceConflict &&
      !row.isClassFeatureVariant &&
      getSubclassFeatureIdentity(row) === target &&
      !!digest &&
      Array.isArray(row.entries) &&
      getFeatureSourceDigest(row.entries) === digest
    return valid(feature) && candidates.length && candidates.every(valid) ? feature : undefined
  }
  const matchesOwner = (ref: string, dependency?: string) => {
    const declaration = decodeOptionalDeclaration(ref, 'subclassFeature')
    const row = declaration?.decoded
    return row &&
      'subclassShortName' in row &&
      norm(row.className) === className &&
      (norm(row.classSource) === source ||
        (source === 'xphb' && norm(row.classSource) === 'phb')) &&
      ((norm(row.subclassShortName) === norm(subclass.shortName) &&
        norm(row.subclassSource) === norm(subclass.source)) ||
        isPsaKnowledgeDependency(subclass, declaration.target) ||
        declaration.target === dependency)
      ? declaration
      : undefined
  }
  const hasLaterGain = (level: number) =>
    'later' in gain
      ? matchesNativeSubclassGain(cls, classTarget(gain.later, level), level, 'at-level')
      : !!getCurrentNativeSubclassGain(cls, level)
  const refs = (subclass.subclassFeatureRefs ?? []).flatMap(({ ref }) => {
    const declaration = matchesOwner(ref)
    const level = declaration?.decoded.level
    if (!declaration || !level || level > entry.levels) return []
    const attached = getDirectSubclassFeatureReference(subclass, declaration.target)?.feature
    if (!attached || attached.sourceIdentityConflict || attached.isClassFeatureVariant) return []
    const intro = ref === subclass.introFeatureRef && level === first
    return [{ declaration, attached, intro, level }]
  })
  const directFeatures = new Map(
    refs.flatMap(({ declaration, attached, intro, level }) => {
      if (intro || !hasLaterGain(level)) return []
      const feature = verified(attached, declaration.target)
      return feature ? [[declaration.target, feature] as const] : []
    }),
  )
  const withNestedRules = (feature: SubclassFeature, parentDependency?: string) => {
    if (!gain.expandNestedRules || !feature.entries) return feature
    const dependency =
      parentDependency && getSubclassFeatureIdentity(feature) === parentDependency
        ? 'subclass-feature|blessings of knowledge|cleric|phb|knowledge|phb|1|phb'
        : undefined
    // Only certified automatic groups may expand all their uncounted references.
    const entries = feature.entries.flatMap((entry) => {
      const group = record(entry)
      return gain.expandUncountedFixedGroups &&
        group.type === 'options' &&
        Object.keys(group).every((key) => key === 'type' || key === 'entries') &&
        Array.isArray(group.entries) &&
        group.entries.every((child) => record(child).type === 'refSubclassFeature')
        ? group.entries
        : [entry]
    })
    const siblings = entries.map(record)
    return {
      ...feature,
      entries: entries.flatMap((entry, index) => {
        const row = siblings[index]
        const uid = row.subclassFeature
        if (row.type !== 'refSubclassFeature' || typeof uid !== 'string') return [entry]
        const child = matchesOwner(uid, dependency)
        if (
          !child ||
          child.decoded.level !== feature.level ||
          siblings.filter(
            (sibling) =>
              typeof sibling.subclassFeature === 'string' &&
              matchesOwner(sibling.subclassFeature, dependency)?.target === child.target,
          ).length !== 1 ||
          !exactOptionalDeclarationReference(row, uid, 'subclassFeature') ||
          Object.keys(row).some(
            (key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature',
          )
        )
          return [entry]
        const exact = verified(row.feature as SubclassFeature | undefined, child.target)
        if (!exact) return [entry]
        return directFeatures.has(child.target)
          ? []
          : [{ type: 'entries', name: exact.name, entries: exact.entries }]
      }),
    }
  }
  const inherited = 'inheritedCharacter' in gain && gain.inheritedCharacter
  if (inherited) {
    const intro = subclass.introFeatureRef && matchesOwner(subclass.introFeatureRef)
    if (
      !catalogs.subclassTargets ||
      getCurrentSelectedClass(inherited, entry, catalogs) !== cls ||
      !isInheritedClassicSubclass(subclass) ||
      (!permitsClassRuleSource(inherited, subclass.source) &&
        !XPHB_LEGACY_SUBCLASS_KEYS.has(
          `${cls.name}|${cls.source}|${subclass.name}|${subclass.source}`,
        )) ||
      !intro ||
      intro.decoded.level !== first ||
      ![norm(subclass.name), norm(subclass.shortName)].includes(norm(intro.decoded.name)) ||
      !verified(getDirectSubclassFeatureReference(subclass, intro.target)?.feature, intro.target)
    )
      return []
  }
  if ('level' in gain && !matchesNativeSubclassGain(cls, classTarget(gain.intro, first), first))
    return []
  return refs.flatMap(({ declaration, attached, intro }) => {
    if (intro) {
      if (!Array.isArray(attached.entries)) return []
      const entries = attached.entries.map(record)
      const dependency = getPsaKnowledgeIntroDependency(subclass, declaration.target)
      const nested = entries.flatMap((row) => {
        const uid = row.subclassFeature
        if (typeof uid !== 'string') return []
        const nested = matchesOwner(uid, dependency)
        if (!nested?.decoded.level || nested.decoded.level > first) return []
        return [{ target: nested.target, uid, row }]
      })
      const features = nested.flatMap(({ target, uid, row }) => {
        if (
          directFeatures.has(target) ||
          nested.filter((entry) => entry.target === target).length !== 1 ||
          row.type !== 'refSubclassFeature' ||
          !exactOptionalDeclarationReference(row, uid, 'subclassFeature') ||
          Object.keys(row).some(
            (key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature',
          )
        )
          return []
        const exact = verified(row.feature as SubclassFeature | undefined, target)
        return exact ? [withNestedRules(exact, dependency)] : []
      })
      if ('sourceDeclaredGains' in gain && verified(attached, declaration.target)) {
        for (const row of entries) {
          if (
            row.type !== 'entries' ||
            typeof row.name !== 'string' ||
            !row.name.trim() ||
            !Array.isArray(row.entries) ||
            !row.entries.length ||
            entries.filter((other) => other.name === row.name).length !== 1 ||
            features.some((feature) => feature.name === row.name)
          )
            continue
          features.push({ ...attached, name: row.name, entries: row.entries })
        }
      }
      return features
    }
    const feature = directFeatures.get(declaration.target)
    return feature ? [withNestedRules(feature)] : []
  })
}

/** Leave unselected menus and unresolved references to their dedicated projections. */
function fixedRuleEntries(entries: readonly unknown[]): unknown[] {
  return entries.flatMap((entry) => {
    const row = record(entry)
    if (
      (row.type === 'options' && 'count' in row) ||
      (typeof row.type === 'string' && row.type.startsWith('ref'))
    )
      return []
    if (Array.isArray(row.entries)) {
      const entries = fixedRuleEntries(row.entries)
      return entries.length ? [{ ...row, entries }] : []
    }
    return Array.isArray(row.items) ? [{ ...row, items: fixedRuleEntries(row.items) }] : [entry]
  })
}

const mysticBrewTarget = 'subclass-feature|mystic brew|monk|xphb|mystic brews|wow|6|wow'
const copiedSheetRules = new Map([
  [getFeatureOwnerKey('Monk', 'WoW', 'Warrior of Mystic Brews', 'WoW'), mysticBrewTarget],
  [
    getFeatureOwnerKey('Priest', 'WoW', 'Shadow Domain', 'WoW'),
    'subclass-feature|vampiric embrace|cleric|xphb|shadow|wow|17|wow',
  ],
  [
    getFeatureOwnerKey('Death Knight', 'WoW', 'Oath of the Ebon Blade', 'WoW'),
    'subclass-feature|aspect of the horsemen|death knight|wow|ebon blade|wow|20|wow',
  ],
])

export function getCopiedSubclassSheetFeature(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (
    !entry.subclass ||
    !entry.subclassSource ||
    !permitsClassRuleSource(character, entry.subclassSource)
  )
    return undefined
  const key = getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource)
  const target = copiedSheetRules.get(key)
  if (!target) return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const selected = cls?.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  if (!cls || selected?.length !== 1 || !catalogs.subclassTargets) return undefined
  const scoped = scopeClassChoiceFeatureCatalogs(catalogs, key)
  const earned = getOwnedSubclassFeature(cls, selected[0], target, scoped)
  if (
    !earned ||
    earned.level > entry.levels ||
    !permitsClassRuleSource(character, earned.feature.source) ||
    !permitsClassRuleSource(character, earned.feature.classSource)
  )
    return undefined
  const entries = fixedRuleEntries(earned.feature.entries ?? [])
  if (target === mysticBrewTarget) {
    const enhancement = getOwnedSubclassFeature(
      cls,
      selected[0],
      'subclass-feature|enhancing a magical beverage|monk|xphb|mystic brews|wow|6|wow',
      scoped,
    )
    if (
      enhancement?.level === earned.level &&
      enhancement.refs.length === 2 &&
      decodeOptionalDeclaration(enhancement.refs[0], 'subclassFeature')?.target === target
    )
      entries.push({
        type: 'entries',
        name: enhancement.feature.name,
        entries: fixedRuleEntries(enhancement.feature.entries ?? []),
      })
  }
  return { ...earned.feature, entries }
}

/** Resolve fixed rules from an exact, source-declared classic subclass on a revised class. */
export function getInheritedSubclassStaticFeatures(
  character: Character,
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (norm(cls.source) !== 'xphb') return []
  const first = getCurrentNativeSubclassGain(cls)?.level
  if (first === undefined) return []
  return getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
    sourceDeclaredGains: true,
    expandNestedRules: true,
    inheritedCharacter: character,
  })
    .filter(
      (feature) =>
        norm(feature.source) === norm(entry.subclassSource) ||
        permitsClassRuleSource(character, feature.source),
    )
    .map((feature) => ({
      ...feature,
      level: Math.max(first, feature.level ?? first),
      entries: fixedRuleEntries(feature.entries ?? []),
    }))
}
