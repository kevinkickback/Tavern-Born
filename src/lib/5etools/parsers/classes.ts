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
import { auditNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { auditOptionalClassFeatureSources } from '@/lib/5etools/optionalClassFeatureSource'
import { auditPsionicFeatureSources } from '@/lib/5etools/psionicSources'
import { REVISED_AFFINITY_TARGET } from '@/lib/5etools/revisedElementalAffinity'
import { getSubclassIntroEntries, getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import { subclassProficiencyDigest } from '@/lib/5etools/subclassProficiencyCertificates'
import {
  auditSubclassProficiencyFeatures,
  auditSubclassProficiencyPackages,
  auditSubclassProficiencyRoots,
} from '@/lib/5etools/subclassProficiencySource'
import {
  materializeSubclassCopies,
  materializeSubclassFeatureCopies,
} from '@/lib/5etools/subclassSourcePreparation'
import { getNativeWarlockPatronFeatureOwner } from '@/lib/5etools/warlockPatronFeatureSource'
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

function resolveSubclassFeatureRecord(
  ref: ParsedObject,
  subclassFeatureRecords: unknown[],
): { feature?: ParsedObject; sourceIdentityConflict?: true } {
  const identity = getSubclassFeatureIdentity(ref)
  if (!identity) return {}
  const matches = subclassFeatureRecords
    .map(asObject)
    .filter((feature) => getSubclassFeatureIdentity(feature) === identity)
  return matches.length > 1
    ? { feature: { ...matches[0], sourceIdentityConflict: true }, sourceIdentityConflict: true }
    : { feature: matches[0] }
}

function parseSubclassFeatureReference(
  rawRef: unknown,
  subclassFeatureRecords: unknown[],
): ParsedObject | null {
  if (typeof rawRef !== 'string') return null

  const parsedRef = { ...decodeSubclassFeatureReference(rawRef) }

  const { feature, sourceIdentityConflict } = resolveSubclassFeatureRecord(
    parsedRef,
    subclassFeatureRecords,
  )
  if (!feature) return parsedRef

  return {
    ...parsedRef,
    ...(sourceIdentityConflict ? { sourceIdentityConflict } : {}),
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
    feature,
  }
}

function parseSubclassFeatureReferences(
  subclassObj: ParsedObject,
  subclassFeatureRecords: unknown[],
): ParsedObject[] {
  return asArray(subclassObj.subclassFeatures)
    .map((ref) => parseSubclassFeatureReference(ref, subclassFeatureRecords))
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

function parsePreparedClasses(data: unknown): unknown[] {
  const obj = asObject(data)
  const classes: unknown[] = obj.class
    ? [...asArray(obj.class)]
    : Array.isArray(data)
      ? [...data]
      : []
  const subclassEntries = asArray(obj.subclass).map(asObject)
  const classFeatureRecords: unknown[] = asArray(obj.classFeature)
  const classFeatureIndex = getClassFeatureIndex(classFeatureRecords)

  const rawSubclassFeatureRecords: unknown[] = asArray(obj.subclassFeature)
  const subclassFeatureRecords: unknown[] = rawSubclassFeatureRecords.map((feature) => {
    const record = asObject(feature)
    return Array.isArray(record.entries)
      ? {
          ...record,
          entries: enrichEntriesSubclassRefs(record.entries, rawSubclassFeatureRecords),
        }
      : feature
  })
  // Group subclasses by parent class (by className + classSource)
  const subclassMap = new Map<string, unknown[]>()
  for (const sc of subclassEntries) {
    const scObj = asObject(sc)
    const className = typeof scObj.className === 'string' ? scObj.className : undefined
    const classSource = typeof scObj.classSource === 'string' ? scObj.classSource : undefined
    if (!className) continue
    const parentKey = `${className}|${classSource ?? ''}`
    if (!subclassMap.has(parentKey)) subclassMap.set(parentKey, [])
    const subclassFeatureRefs = parseSubclassFeatureReferences(scObj, subclassFeatureRecords)
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
  subclassFeatureRecords: unknown[],
): ParsedObject {
  const refStr = typeof entry.subclassFeature === 'string' ? entry.subclassFeature : ''
  if (!refStr) return entry
  const parsedRef = { ...decodeSubclassFeatureReference(refStr) }
  const { feature, sourceIdentityConflict } = resolveSubclassFeatureRecord(
    parsedRef,
    subclassFeatureRecords,
  )
  if (!feature) {
    const target = getSubclassFeatureIdentity(parsedRef)
    const warlockPatron =
      target &&
      parsedRef.className?.trim().toLowerCase() === 'warlock' &&
      ['phb', 'xphb'].includes(parsedRef.classSource?.trim().toLowerCase() ?? '')
    if ('feature' in entry && (isNativeResilienceTarget(target) || warlockPatron)) {
      // Raw inline data cannot stand in for the missing declared source record.
      const { feature: _attachment, ...declaration } = entry
      return declaration
    }
    return entry
  }
  return {
    ...entry,
    ...(sourceIdentityConflict ? { sourceIdentityConflict } : {}),
    feature: Array.isArray(feature.entries)
      ? {
          ...feature,
          entries: enrichEntriesSubclassRefs(feature.entries, subclassFeatureRecords),
        }
      : feature,
  }
}

function enrichEntriesSubclassRefs(
  entries: unknown[],
  subclassFeatureRecords: unknown[],
): unknown[] {
  return entries.map((e) => {
    if (typeof e !== 'object' || e === null) return e
    const obj = e as ParsedObject
    if (obj.type === 'refSubclassFeature') {
      return resolveInlineSubclassFeatureRef(obj, subclassFeatureRecords)
    }
    if (Array.isArray(obj.entries)) {
      return {
        ...obj,
        entries: enrichEntriesSubclassRefs(obj.entries, subclassFeatureRecords),
      }
    }
    return e
  })
}

function parsePreparedClassFeatures(data: unknown): unknown[] {
  const obj = asObject(data)
  const subclassFeatureRecords = asArray(obj.subclassFeature)
  const features = asArray(obj.classFeature)
  if (!subclassFeatureRecords.length) return features
  return features.map((feature) => {
    const f = asObject(feature)
    if (!Array.isArray(f.entries)) return feature
    return {
      ...f,
      entries: enrichEntriesSubclassRefs(f.entries, subclassFeatureRecords),
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
          isNativeResilienceTarget(target) ||
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
function prepareClassDocument(data: unknown, sourceId?: string): unknown {
  if (Array.isArray(data)) return auditFixedLayerMultiplicity(data.map(asObject), 'classes')
  const obj = asObject(data)
  const records = asArray(obj.subclassFeature).map(asObject)
  const classRecords = asArray(obj.class).map(asObject)
  const subclassRecords = asArray(obj.subclass).map(asObject)
  const origin = sourceId ?? `class-document:${subclassProficiencyDigest(obj)}`
  const packages = auditSubclassProficiencyPackages(classRecords, subclassRecords, records, origin)
  const materializedSubclasses = materializeSubclassCopies(subclassRecords)
  const materialized = auditPsionicFeatureSources(materializeSubclassFeatureCopies(records), true)
  const optionalClassFeatureSources = auditOptionalClassFeatureSources(data, origin, {
    subclasses: materializedSubclasses,
    subclassFeatures: materialized,
  })
  const classCastingSources = auditClassCastingSources(data, origin, {
    subclasses: materializedSubclasses,
    subclassFeatures: materialized,
  })
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
  const classes = auditFixedLayerMultiplicity(
    auditDirectFixedClassDeclarations(classRecords, origin),
    'classes',
  )
  const subclass = auditSubclassProficiencyRoots(
    subclassRecords,
    materializedSubclasses,
    origin,
    packages,
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
): {
  classes: unknown[]
  classFeatures: unknown[]
  optionalClassFeatureSources: import('@/types/5etools').OptionalClassFeatureSourceProof[]
  classCastingSources: import('@/types/classCasting').ClassCastingSourceProof[]
} {
  const prepared = prepareClassDocument(data, sourceId)
  return {
    classes: parsePreparedClasses(prepared),
    classFeatures: parsePreparedClassFeatures(prepared),
    optionalClassFeatureSources: asArray(
      asObject(prepared).optionalClassFeatureSources,
    ) as import('@/types/5etools').OptionalClassFeatureSourceProof[],
    classCastingSources: asArray(
      asObject(prepared).classCastingSources,
    ) as import('@/types/classCasting').ClassCastingSourceProof[],
  }
}

export function parseClasses(data: unknown): unknown[] {
  return parsePreparedClasses(prepareClassDocument(data))
}

export function parseClassFeatures(data: unknown): unknown[] {
  return parsePreparedClassFeatures(prepareClassDocument(data))
}
