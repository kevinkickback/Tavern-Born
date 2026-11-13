import {
  auditInheritedBarbarianRoots,
  isGiantPowerSourceFeature,
} from '@/lib/5etools/barbarianGiantPower'
import { isRevisedZealotResourceSource } from '@/lib/5etools/barbarianJourneySources'
import { isBarbarianPathChoiceSource } from '@/lib/5etools/barbarianPathChoices'
import { isDirectBarbarianRitualTarget } from '@/lib/5etools/barbarianRitualSpells'
import { isDirectBardCollegeFeature } from '@/lib/5etools/bardCollegeFeatures'
import { isDirectBardLoreSpellSource } from '@/lib/5etools/bardSpellSources'
import { auditClassCastingSources } from '@/lib/5etools/classCastingSource'
import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { auditClassProficiencySources } from '@/lib/5etools/classProficiencyChoices'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { getParsedClassSpellSlotProgression } from '@/lib/5etools/classSpellSlotTable'
import {
  auditDirectFixedClassDeclarations,
  auditFixedClassFeatures,
} from '@/lib/5etools/directFixedProficiencySource'
import { isNativeResilienceTarget } from '@/lib/5etools/draconicResilience'
import { getNativeDraconicFeatureOwner } from '@/lib/5etools/draconicSubclassFeatureSource'
import { isEpicBoonAdvancement } from '@/lib/5etools/epicBoonAdvancement'
import { auditFavoredEnemySources } from '@/lib/5etools/favoredEnemySource'
import { auditFeatureOptionSources } from '@/lib/5etools/featureTableOptions'
import {
  auditFixedLayerMultiplicity,
  auditProficiencySubclassLayerMultiplicity,
} from '@/lib/5etools/fixedProficiencySource'
import { auditInheritedDomainSpellRoots } from '@/lib/5etools/legacyClericDomainSpells'
import {
  auditInheritedOathSpellRoots,
  isInheritedOathSourceFeature,
} from '@/lib/5etools/legacyPaladinOathSpells'
import { isDirectMysticFeatureTarget } from '@/lib/5etools/mysticFeatureIdentity'
import {
  auditInheritedSubclassRoots,
  isDirectArtificerRuleTarget,
  isDirectFighterRuleTarget,
  isDirectMonkSpellTarget,
  isDirectRangerRuleTarget,
  isDirectRogueRuleTarget,
} from '@/lib/5etools/nativeSubclassFeatureSource'
import { auditNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { auditOptionalClassFeatureSources } from '@/lib/5etools/optionalClassFeatureSource'
import {
  auditPsionicFeatureSources,
  isDirectPsionicSourceTarget,
} from '@/lib/5etools/psionicSources'
import { REVISED_AFFINITY_TARGET } from '@/lib/5etools/revisedElementalAffinity'
import { isSavantSpellbookSourceTarget } from '@/lib/5etools/savantSpellbookRules'
import { areEquivalentStormEnvironmentGroups } from '@/lib/5etools/stormAuraSource'
import { getSubclassIntroEntries, getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import {
  getSubclassCopyLookupKey,
  subclassProficiencyDigest,
} from '@/lib/5etools/subclassProficiencyCertificates'
import {
  auditSubclassProficiencyFeatures,
  auditSubclassProficiencyPackages,
  auditSubclassProficiencyRoots,
} from '@/lib/5etools/subclassProficiencySource'
import {
  createIndexedClassResolver,
  createIndexedSubclassFeatureResolver,
  createIndexedSubclassResolver,
  getIndexedClassDependencyFiles,
  materializeSubclassCopies,
  materializeSubclassFeatureCopies,
} from '@/lib/5etools/subclassSourcePreparation'
import { getNativeWarlockPatronFeatureOwner } from '@/lib/5etools/warlockPatronFeatureSource'
import { isDirectWizardTraditionSpellSource } from '@/lib/5etools/wizardTraditionSpellSources'
import type { ClassFeature, ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'
import { asArray, asObject, normalizeKey, type ParsedObject } from './shared'

function getClassFeatureIndex(classFeatureRecords: unknown[]): Map<string, ParsedObject> {
  const index = new Map<string, ParsedObject>()

  for (const record of classFeatureRecords) {
    const feature = asObject(record)
    const key = getClassFeatureIdentity(feature)
    if (!key) continue
    const previous = index.get(key)
    if (!previous) {
      index.set(key, feature)
    } else if (
      isEpicBoonAdvancement(previous as ClassFeature) ||
      isEpicBoonAdvancement(feature as ClassFeature)
    ) {
      // Preserve ambiguity before the reference index selects a producer.
      index.set(key, { ...previous, sourceIdentityConflict: true })
    }
  }

  return index
}

function getIsSpellcasterClass(classObj: ParsedObject): boolean {
  if (typeof classObj.isSpellcaster === 'boolean') {
    return classObj.isSpellcaster
  }

  if (typeof classObj.spellcastingAbility === 'string') return true

  const casterProgression = normalizeKey(classObj.casterProgression)
  if (casterProgression && casterProgression !== 'none') return true

  return !!getParsedClassSpellSlotProgression(classObj)
}

function parseClassFeatureReference(
  rawRef: unknown,
  featureIndex: Map<string, ParsedObject>,
): ParsedObject | null {
  const refObj = typeof rawRef === 'object' && rawRef !== null ? asObject(rawRef) : {}
  const refText =
    typeof rawRef === 'string'
      ? rawRef
      : typeof refObj.classFeature === 'string'
        ? refObj.classFeature
        : null

  if (!refText) return null

  const parsedRef = {
    ...decodeClassFeatureReference(refText),
    gainSubclassFeature: refObj.gainSubclassFeature === true,
  }
  const key = getClassFeatureIdentity(parsedRef)
  const feature = key ? featureIndex.get(key) : undefined
  return feature ? { ...parsedRef, feature } : parsedRef
}

function parseClassFeatureReferences(
  classObj: ParsedObject,
  featureIndex: Map<string, ParsedObject>,
): ParsedObject[] {
  const refs = asArray(classObj.classFeatures)
  return refs
    .map((ref) => parseClassFeatureReference(ref, featureIndex))
    .filter((ref): ref is ParsedObject => ref !== null)
}

interface SubclassFeatureScope {
  records: ReadonlyMap<string, readonly ParsedObject[]>
  dependencies?: () => readonly SubclassFeatureScope[]
  scoped?: true
  copyParent?: (subclass: ParsedObject) => SubclassFeatureScope | undefined
}

function subclassFeatureScope(
  data: unknown,
  dependencies?: SubclassFeatureScope['dependencies'],
): SubclassFeatureScope {
  const records = new Map<string, ParsedObject[]>()
  for (const value of asArray(asObject(data).subclassFeature)) {
    const row = asObject(value)
    const identity = getSubclassFeatureIdentity(row)
    if (identity) {
      const matches = records.get(identity)
      if (matches) matches.push(row)
      else records.set(identity, [row])
    }
  }
  return { records, dependencies }
}

function resolveSubclassFeatureRecord(ref: ParsedObject, scope: SubclassFeatureScope) {
  const identity = getSubclassFeatureIdentity(ref)
  if (!identity) return undefined
  const matches = [scope, ...(scope.dependencies?.() ?? [])].flatMap((producer) =>
    (producer.records.get(identity) ?? []).map((feature) => ({ feature, producer })),
  )
  const match = matches[0]
  return (
    match && {
      ...match,
      identity,
      conflict:
        matches.length > 1 &&
        !areEquivalentStormEnvironmentGroups(
          identity,
          matches.map((row) => row.feature),
        ),
    }
  )
}

function parseSubclassFeatureReference(
  rawRef: unknown,
  scope: SubclassFeatureScope,
): ParsedObject | null {
  if (typeof rawRef !== 'string') return null

  const parsedRef = { ...decodeSubclassFeatureReference(rawRef) }

  const match = resolveSubclassFeatureRecord(parsedRef, scope)
  if (!match) return parsedRef
  const { feature, producer, identity, conflict } = match

  return {
    ...parsedRef,
    ...(conflict && { sourceIdentityConflict: true }),
    source:
      typeof feature.source === 'string' && feature.source.trim().length > 0
        ? feature.source
        : parsedRef.source,
    classSource:
      typeof feature.classSource === 'string' && feature.classSource.trim().length > 0
        ? feature.classSource
        : parsedRef.classSource,
    subclassSource:
      typeof feature.subclassSource === 'string' && feature.subclassSource.trim().length > 0
        ? feature.subclassSource
        : parsedRef.subclassSource,
    level: typeof feature.level === 'number' ? feature.level : parsedRef.level,
    feature: {
      ...feature,
      ...(conflict && { sourceIdentityConflict: true }),
      ...(Array.isArray(feature.entries) && {
        entries: enrichEntriesSubclassRefs(
          feature.entries,
          producer,
          isDirectArtificerRuleTarget(identity),
          false,
          new Set([identity]),
        ),
      }),
    },
  }
}

function parseSubclassFeatureReferences(
  subclassObj: ParsedObject,
  scope: SubclassFeatureScope,
): ParsedObject[] {
  return asArray(subclassObj.subclassFeatures)
    .map((ref) => parseSubclassFeatureReference(ref, scope))
    .filter((ref): ref is ParsedObject => ref !== null)
}

function groupSubclassFeaturesByLevel(
  refs: ParsedObject[],
): Array<{ level: number; features: ParsedObject[] }> {
  const groups = new Map<number, ParsedObject[]>()

  for (const ref of refs) {
    const feature = asObject(ref.feature)
    const level =
      typeof feature.level === 'number'
        ? feature.level
        : typeof ref.level === 'number'
          ? ref.level
          : undefined
    if (level === undefined || !Object.keys(feature).length) continue
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level)?.push(feature)
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, features]) => ({ level, features }))
}

function parsePreparedClasses(data: unknown, scope = subclassFeatureScope(data)): unknown[] {
  const obj = asObject(data)
  const classes: unknown[] = obj.class
    ? [...asArray(obj.class)]
    : Array.isArray(data)
      ? [...data]
      : []
  const subclassEntries = asArray(obj.subclass).map(asObject)
  const classFeatureRecords: unknown[] = asArray(obj.classFeature)
  const classFeatureIndex = getClassFeatureIndex(classFeatureRecords)

  // Group subclasses by parent class (by className + classSource)
  const subclassMap = new Map<string, unknown[]>()
  for (const sc of subclassEntries) {
    const { scopedSubclassFeatureDependencies: _rawScope, ...scObj } = asObject(sc)
    const className = typeof scObj.className === 'string' ? scObj.className : undefined
    const classSource = typeof scObj.classSource === 'string' ? scObj.classSource : undefined
    if (!className) continue
    const parentKey = `${className}|${classSource ?? ''}`
    if (!subclassMap.has(parentKey)) subclassMap.set(parentKey, [])
    const copiedFrom = scope.copyParent?.(scObj)
    const declarationScope = copiedFrom
      ? {
          ...scope,
          dependencies: () => [...new Set([...(scope.dependencies?.() ?? []), copiedFrom])],
        }
      : scope
    const subclassFeatureRefs = parseSubclassFeatureReferences(scObj, declarationScope)
    const introFeatureRef = getSubclassIntroReference(
      scObj,
      subclassFeatureRefs as unknown as SubclassFeatureReference[],
    )?.ref
    const entries = getSubclassIntroEntries(
      { introFeatureRef },
      subclassFeatureRefs as unknown as SubclassFeatureReference[],
    )
    const levelFeatures = groupSubclassFeaturesByLevel(subclassFeatureRefs)
    subclassMap.get(parentKey)?.push({
      ...scObj,
      ...(scope.scoped && { scopedSubclassFeatureDependencies: true }),
      entries,
      introFeatureRef,
      subclassFeatureRefs,
      levelFeatures,
      normalizedRules: normalizeSubclassRules(
        { name: className, source: classSource ?? '' },
        {
          ...scObj,
          name: String(scObj.name ?? scObj.shortName ?? ''),
          source: String(scObj.source ?? ''),
          introFeatureRef,
          ...(Array.isArray(scObj.optionalfeatureProgression)
            ? {
                optionalfeatureProgression:
                  scObj.optionalfeatureProgression as import('@/types/5etools').OptFeatureProg[],
              }
            : {}),
          ...(Array.isArray(scObj.featProgression)
            ? {
                featProgression:
                  scObj.featProgression as import('@/types/5etools').OptFeatureProg[],
              }
            : {}),
        },
        subclassFeatureRefs as unknown as import('@/types/5etools').SubclassFeatureReference[],
      ),
    })
  }

  const parsed = classes.map((cls) => {
    const clsObj = asObject(cls)
    const key = `${String(clsObj.name ?? '')}|${String(clsObj.source ?? '')}`
    const nested = subclassMap.get(key)
    const classFeatureRefs = parseClassFeatureReferences(clsObj, classFeatureIndex)
    const spellSlotProgression = getParsedClassSpellSlotProgression(clsObj)

    return {
      ...clsObj,
      subclasses: (nested ?? []).map((row) => {
        const sub = row as import('@/types/5etools').Subclass5e
        return {
          ...sub,
          normalizedRules: normalizeSubclassRules(
            { ...clsObj, classFeatureRefs } as unknown as import('@/types/5etools').Class5e,
            sub,
            sub.subclassFeatureRefs ?? [],
          ),
        }
      }),
      classFeatureRefs,
      normalizedRules: normalizeClassRules(
        clsObj as unknown as import('@/types/5etools').Class5e,
        classFeatureRefs as unknown as ClassFeatureReference[],
      ),
      isSpellcaster: getIsSpellcasterClass(clsObj),
      spellSlotProgression,
    }
  })
  return auditProficiencySubclassLayerMultiplicity(
    parsed as unknown as import('@/types/5etools').Class5e[],
  )
}

function getLastStringFromEntries(entries: unknown[]): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry
    }
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = asObject(entries[index])
    const nestedEntries = asArray(entry.entries)
    if (nestedEntries.length === 0) continue
    const nested = getLastStringFromEntries(nestedEntries)
    if (nested) return nested
  }

  return null
}

export function parseClassFluff(data: unknown): Array<{
  name: string
  source: string
  summary: string
  sections: Array<{ name: string; entries: unknown[] }>
  images?: Array<{ type: 'image'; href?: { url?: string; path?: string }; title?: string }>
}> {
  const obj = asObject(data)
  const classFluff = asArray(obj.classFluff)

  return classFluff
    .map((entry) => {
      const fluff = asObject(entry)
      const name = typeof fluff.name === 'string' ? fluff.name : ''
      const source = typeof fluff.source === 'string' ? fluff.source : ''
      const topEntries = asArray(fluff.entries)
      const firstSection = asObject(topEntries[0])
      const summary = getLastStringFromEntries(asArray(firstSection.entries))

      if (!name || !source || !summary) return null

      const sections = topEntries
        .map((sectionEntry) => {
          const section = asObject(sectionEntry)
          const sectionName = typeof section.name === 'string' ? section.name : ''
          const sectionEntries = asArray(section.entries)
          if (!sectionName || sectionEntries.length === 0) return null
          return {
            name: sectionName,
            entries: sectionEntries,
          }
        })
        .filter((section): section is { name: string; entries: unknown[] } => section !== null)

      const images = asArray(fluff.images)
        .map((imageEntry) => {
          const image = asObject(imageEntry)
          if (image.type !== 'image') return null
          const hrefObj = asObject(image.href)
          const href = {
            ...(typeof hrefObj.url === 'string' ? { url: hrefObj.url } : {}),
            ...(typeof hrefObj.path === 'string' ? { path: hrefObj.path } : {}),
          }
          return {
            type: 'image' as const,
            ...(Object.keys(href).length > 0 ? { href } : {}),
            ...(typeof image.title === 'string' ? { title: image.title } : {}),
          }
        })
        .filter(
          (
            image,
          ): image is { type: 'image'; href?: { url?: string; path?: string }; title?: string } =>
            image !== null,
        )

      return {
        name,
        source,
        summary,
        sections,
        ...(images.length > 0 ? { images } : {}),
      }
    })
    .filter(
      (
        value,
      ): value is {
        name: string
        source: string
        summary: string
        sections: Array<{ name: string; entries: unknown[] }>
        images?: Array<{ type: 'image'; href?: { url?: string; path?: string }; title?: string }>
      } => value !== null,
    )
}

export function parseClassFluffSummaries(
  data: unknown,
): Array<{ name: string; source: string; summary: string }> {
  return parseClassFluff(data).map((item) => ({
    name: item.name,
    source: item.source,
    summary: item.summary,
  }))
}

function resolveInlineSubclassFeatureRef(
  entry: ParsedObject,
  scope: SubclassFeatureScope,
  requiresSourceRecord: boolean,
  ancestors: ReadonlySet<string>,
): ParsedObject {
  const refStr = typeof entry.subclassFeature === 'string' ? entry.subclassFeature : ''
  if (!refStr && !requiresSourceRecord) return entry
  const parsedRef = { ...decodeSubclassFeatureReference(refStr) }
  const match = resolveSubclassFeatureRecord(parsedRef, scope)
  if (match && ancestors.has(match.identity)) {
    const { feature: _attachment, ...declaration } = entry
    return declaration
  }
  if (!match) {
    const target = getSubclassFeatureIdentity(parsedRef)
    const directArtificer = isDirectArtificerRuleTarget(target)
    const declaredCoreSubclass =
      target &&
      ['druid', 'fighter', 'paladin', 'sorcerer', 'warlock', 'wizard'].includes(
        parsedRef.className?.trim().toLowerCase() ?? '',
      ) &&
      ['phb', 'xphb'].includes(parsedRef.classSource?.trim().toLowerCase() ?? '')
    if (
      'feature' in entry &&
      (scope.scoped ||
        requiresSourceRecord ||
        isNativeResilienceTarget(target) ||
        declaredCoreSubclass ||
        directArtificer)
    ) {
      // Raw inline data cannot stand in for the missing declared source record.
      const { feature: _attachment, ...declaration } = entry
      return declaration
    }
    return entry
  }
  const { feature, producer, identity, conflict } = match
  return {
    ...entry,
    ...(conflict && { sourceIdentityConflict: true }),
    feature: Array.isArray(feature.entries)
      ? {
          ...feature,
          ...(conflict && { sourceIdentityConflict: true }),
          entries: enrichEntriesSubclassRefs(
            feature.entries,
            producer,
            isDirectArtificerRuleTarget(identity),
            false,
            new Set([...ancestors, identity]),
          ),
        }
      : conflict
        ? { ...feature, sourceIdentityConflict: true }
        : feature,
  }
}

function enrichEntriesSubclassRefs(
  entries: unknown[],
  scope: SubclassFeatureScope,
  includeListItems = false,
  requiresSourceRecord = false,
  ancestors: ReadonlySet<string> = new Set(),
): unknown[] {
  return entries.map((e) => {
    if (typeof e !== 'object' || e === null) return e
    const obj = e as ParsedObject
    if (obj.type === 'refSubclassFeature') {
      return resolveInlineSubclassFeatureRef(obj, scope, requiresSourceRecord, ancestors)
    }
    if (Array.isArray(obj.entries)) {
      return {
        ...obj,
        entries: enrichEntriesSubclassRefs(
          obj.entries,
          scope,
          includeListItems,
          obj.type === 'options' && obj.style === 'list-hang-notitle' && !('count' in obj),
          ancestors,
        ),
      }
    }
    if (includeListItems && obj.type === 'list' && Array.isArray(obj.items)) {
      return { ...obj, items: enrichEntriesSubclassRefs(obj.items, scope, true, false, ancestors) }
    }
    return e
  })
}

function parsePreparedClassFeatures(data: unknown, scope = subclassFeatureScope(data)): unknown[] {
  const obj = asObject(data)
  const features = asArray(obj.classFeature)
  if (!scope.records.size && !scope.dependencies) return features
  return features.map((feature) => {
    const f = asObject(feature)
    if (!Array.isArray(f.entries)) return feature
    return {
      ...f,
      entries: enrichEntriesSubclassRefs(f.entries, scope),
    }
  })
}

/** These native grants require direct bodies. Copy materialization removes the directive. */
function auditNativeSubclassCopies(
  raw: readonly ParsedObject[],
  materialized: ParsedObject[],
): ParsedObject[] {
  // Inheritance and copy operations can change the feature's target identity.
  const copied = new Set(
    raw
      .flatMap((row, index) =>
        '_copy' in row
          ? [getSubclassFeatureIdentity(row), getSubclassFeatureIdentity(materialized[index])]
          : [],
      )
      .filter(
        (target) =>
          target === REVISED_AFFINITY_TARGET ||
          isDirectBardCollegeFeature(target) ||
          isDirectBardLoreSpellSource(target) ||
          isBarbarianPathChoiceSource(target) ||
          isRevisedZealotResourceSource(target) ||
          isDirectBarbarianRitualTarget(target) ||
          isDirectFighterRuleTarget(target) ||
          isDirectMonkSpellTarget(target) ||
          isDirectRangerRuleTarget(target) ||
          isDirectRogueRuleTarget(target) ||
          isDirectArtificerRuleTarget(target) ||
          isDirectMysticFeatureTarget(target) ||
          isDirectPsionicSourceTarget(target) ||
          isGiantPowerSourceFeature(target) ||
          isNativeResilienceTarget(target) ||
          isSavantSpellbookSourceTarget(target) ||
          isDirectWizardTraditionSpellSource(target) ||
          isInheritedOathSourceFeature(target) ||
          getNativeDraconicFeatureOwner(target) ||
          getNativeWarlockPatronFeatureOwner(target),
      ),
  )
  if (!copied.size) return materialized
  return materialized.map((row) =>
    copied.has(getSubclassFeatureIdentity(row))
      ? { ...row, featureOptionSourceConflict: true }
      : row,
  )
}

/** Materialize internal feature copies before any reference enrichment; never mutate source JSON. */
interface PreparedClassOwners {
  classes: ParsedObject[]
  subclasses: ParsedObject[]
  subclassDependencies?: ParsedObject[]
}

function prepareClassDocument(
  data: unknown,
  sourceId?: string,
  preparedSubclassFeatures?: ParsedObject[],
  preparedOwners?: PreparedClassOwners,
): unknown {
  if (Array.isArray(data)) return auditFixedLayerMultiplicity(data.map(asObject), 'classes')
  const obj = asObject(data)
  const records = asArray(obj.subclassFeature).map(asObject)
  const classRecords = asArray(obj.class).map(asObject)
  const subclassRecords = asArray(obj.subclass).map(asObject)
  const origin = sourceId ?? `class-document:${subclassProficiencyDigest(obj)}`
  const packages = auditSubclassProficiencyPackages(classRecords, subclassRecords, records, origin)
  const materializedSubclasses = auditInheritedDomainSpellRoots(
    subclassRecords,
    auditInheritedOathSpellRoots(
      subclassRecords,
      auditInheritedBarbarianRoots(
        subclassRecords,
        auditInheritedSubclassRoots(
          subclassRecords,
          preparedOwners?.subclasses ?? materializeSubclassCopies(subclassRecords),
        ),
      ),
    ),
    records,
  )
  const materialized = auditPsionicFeatureSources(
    preparedSubclassFeatures ?? materializeSubclassFeatureCopies(records),
    true,
  )
  const optionalClassFeatureSources = auditOptionalClassFeatureSources(data, origin, {
    subclasses: materializedSubclasses,
    subclassFeatures: materialized,
  })
  const classCastingSources = auditClassCastingSources(
    data,
    origin,
    { subclasses: materializedSubclasses, subclassFeatures: materialized },
    preparedOwners?.classes,
  )
  const classFeature = auditFixedClassFeatures(
    auditClassProficiencySources(
      auditFavoredEnemySources(
        auditNaturalExplorerSources(
          auditPsionicFeatureSources(asArray(obj.classFeature).map(asObject)),
        ),
      ),
    ),
    origin,
  )
  const auditedClasses = auditDirectFixedClassDeclarations(
    classRecords,
    origin,
    preparedOwners?.classes,
  )
  const classes = auditFixedLayerMultiplicity(
    auditedClasses.map((row, index) => {
      const preparedClass = preparedOwners?.classes[index]
      if (!preparedClass || !Object.getOwnPropertyDescriptor(classRecords[index], '_copy'))
        return row
      // The materialized class has inherited data. Direct declarations still use raw evidence.
      return Object.getOwnPropertyDescriptor(row, 'fixedProficiencySourceAudit')
        ? { ...preparedClass, fixedProficiencySourceAudit: row.fixedProficiencySourceAudit }
        : preparedClass
    }),
    'classes',
  )
  const subclass = auditSubclassProficiencyRoots(
    subclassRecords,
    materializedSubclasses,
    origin,
    packages,
    preparedOwners?.subclassDependencies,
  )
  if (!records.length)
    return {
      ...obj,
      class: classes,
      classFeature,
      subclass,
      optionalClassFeatureSources,
      classCastingSources,
    }
  return {
    ...obj,
    class: classes,
    classFeature,
    subclass,
    optionalClassFeatureSources,
    classCastingSources,
    subclassFeature: auditSubclassProficiencyFeatures(
      records,
      auditNativeSubclassCopies(records, auditFeatureOptionSources(materialized)),
      origin,
      packages,
    ),
  }
}

/** The loader prepares once for both projections of a class document. */
export function parseClassDocument(
  data: unknown,
  sourceId?: string,
  preparedSubclassFeatures?: ParsedObject[],
  preparedOwners?: PreparedClassOwners,
): {
  classes: unknown[]
  classFeatures: unknown[]
  optionalClassFeatureSources: import('@/types/5etools').OptionalClassFeatureSourceProof[]
  classCastingSources: import('@/types/classCasting').ClassCastingSourceProof[]
} {
  const prepared = prepareClassDocument(data, sourceId, preparedSubclassFeatures, preparedOwners)
  return parsePreparedClassDocument(prepared)
}

function parsePreparedClassDocument(prepared: unknown, scope = subclassFeatureScope(prepared)) {
  return {
    classes: parsePreparedClasses(prepared, scope),
    classFeatures: parsePreparedClassFeatures(prepared, scope),
    optionalClassFeatureSources: asArray(
      asObject(prepared).optionalClassFeatureSources,
    ) as import('@/types/5etools').OptionalClassFeatureSourceProof[],
    classCastingSources: asArray(
      asObject(prepared).classCastingSources,
    ) as import('@/types/classCasting').ClassCastingSourceProof[],
  }
}

/** Give each class file only its declared indexed dependencies, as in the runtime loader. */
export function createIndexedClassDocumentParser(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
) {
  const features = createIndexedSubclassFeatureResolver(index, documents)
  const classes = createIndexedClassResolver(index, documents)
  const subclasses = createIndexedSubclassResolver(index, documents)
  const prepared = new Map<string, unknown>()
  const scopes = new Map<string, SubclassFeatureScope>()
  const subclassDependencies = (file: string) =>
    getIndexedClassDependencyFiles(index, documents, file, 'subclass')
  const prepare = (file: string) => {
    if (prepared.has(file)) return prepared.get(file)
    const document = prepareClassDocument(documents.get(file), `class/${file}`, features(file), {
      classes: classes(file),
      subclasses: subclasses(file),
      subclassDependencies: subclassDependencies(file).flatMap((dependency) =>
        asArray(asObject(documents.get(dependency)).subclass).map(asObject),
      ),
    })
    prepared.set(file, document)
    return document
  }
  const scopeFor = (file: string): SubclassFeatureScope => {
    const existing = scopes.get(file)
    if (existing) return existing
    const files = getIndexedClassDependencyFiles(index, documents, file, 'subclassFeature')
    let dependencies: SubclassFeatureScope[] | undefined
    const scope = subclassFeatureScope(
      prepare(file),
      files.length ? () => (dependencies ??= files.map(scopeFor)) : undefined,
    )
    scope.scoped = true
    scope.copyParent = (subclass) => {
      const key = getSubclassCopyLookupKey(asObject(subclass._copy))
      if (!key) return undefined
      const parents = subclassDependencies(file).filter((dependency) =>
        asArray(asObject(documents.get(dependency)).subclass).some(
          (row) => getSubclassCopyLookupKey(asObject(row)) === key,
        ),
      )
      return parents.length === 1 ? scopeFor(parents[0]) : undefined
    }
    scopes.set(file, scope)
    return scope
  }
  return (file: string) => parsePreparedClassDocument(prepare(file), scopeFor(file))
}

export function parseClasses(data: unknown): unknown[] {
  return parsePreparedClasses(prepareClassDocument(data))
}

export function parseClassFeatures(data: unknown): unknown[] {
  return parsePreparedClassFeatures(prepareClassDocument(data))
}
