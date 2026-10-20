import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { auditClassProficiencySources } from '@/lib/5etools/classProficiencyChoices'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { auditFeatureOptionSources } from '@/lib/5etools/featureTableOptions'
import {
  auditDirectFixedClassDeclarations,
  auditFixedClassFeatures,
} from '@/lib/5etools/fixedProficiencySource'
import { auditNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { auditOptionalClassFeatureSources } from '@/lib/5etools/optionalClassFeatureSource'
import { getSubclassIntroEntries, getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import { subclassProficiencyDigest } from '@/lib/5etools/subclassProficiencyCertificates'
import {
  auditSubclassProficiencyFeatures,
  auditSubclassProficiencyRoots,
} from '@/lib/5etools/subclassProficiencySource'
import {
  materializeSubclassCopies,
  materializeSubclassFeatureCopies,
} from '@/lib/5etools/subclassSourcePreparation'
import type { ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'
import { asArray, asObject, normalizeKey, type ParsedObject } from './shared'

function getClassFeatureIndex(classFeatureRecords: unknown[]): Map<string, ParsedObject> {
  const index = new Map<string, ParsedObject>()

  for (const record of classFeatureRecords) {
    const feature = asObject(record)
    const key = getClassFeatureIdentity(feature)
    if (!key) continue
    if (!index.has(key)) {
      index.set(key, feature)
    }
  }

  return index
}

function getClassSpellSlotProgression(classObj: ParsedObject): number[][] | undefined {
  const groups = asArray(classObj.classTableGroups)
  for (const group of groups) {
    const rows = asObject(group).rowsSpellProgression
    if (!Array.isArray(rows)) continue
    return rows.filter(Array.isArray) as number[][]
  }

  return undefined
}

function getIsSpellcasterClass(classObj: ParsedObject): boolean {
  if (typeof classObj.isSpellcaster === 'boolean') {
    return classObj.isSpellcaster
  }

  if (typeof classObj.spellcastingAbility === 'string') return true

  const casterProgression = normalizeKey(classObj.casterProgression)
  if (casterProgression && casterProgression !== 'none') return true

  return !!getClassSpellSlotProgression(classObj)
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
): ParsedObject | undefined {
  const identity = getSubclassFeatureIdentity(ref)
  if (!identity) return undefined
  return subclassFeatureRecords
    .map(asObject)
    .find((feature) => getSubclassFeatureIdentity(feature) === identity)
}

function parseSubclassFeatureReference(
  rawRef: unknown,
  subclassFeatureRecords: unknown[],
): ParsedObject | null {
  if (typeof rawRef !== 'string') return null

  const parsedRef = { ...decodeSubclassFeatureReference(rawRef) }

  const feature = resolveSubclassFeatureRecord(parsedRef, subclassFeatureRecords)
  if (!feature) return parsedRef

  return {
    ...parsedRef,
    source:
      typeof feature.source === 'string' && feature.source.length > 0
        ? feature.source
        : parsedRef.source,
    classSource:
      typeof feature.classSource === 'string' && feature.classSource.length > 0
        ? feature.classSource
        : parsedRef.classSource,
    subclassSource:
      typeof feature.subclassSource === 'string' && feature.subclassSource.length > 0
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

  return classes.map((cls) => {
    const clsObj = asObject(cls)
    const key = `${String(clsObj.name ?? '')}|${String(clsObj.source ?? '')}`
    const nested = subclassMap.get(key)
    const classFeatureRefs = parseClassFeatureReferences(clsObj, classFeatureIndex)
    const spellSlotProgression = getClassSpellSlotProgression(clsObj)

    return {
      ...clsObj,
      subclasses: nested ?? [],
      classFeatureRefs,
      normalizedRules: normalizeClassRules(
        clsObj as unknown as import('@/types/5etools').Class5e,
        classFeatureRefs as unknown as ClassFeatureReference[],
      ),
      isSpellcaster: getIsSpellcasterClass(clsObj),
      spellSlotProgression,
    }
  })
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
  const feature = resolveSubclassFeatureRecord(parsedRef, subclassFeatureRecords)
  if (!feature) return entry
  return {
    ...entry,
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

/** Materialize internal feature copies before any reference enrichment; never mutate source JSON. */
function prepareClassDocument(data: unknown, sourceId?: string): unknown {
  if (Array.isArray(data)) return data
  const obj = asObject(data)
  const records = asArray(obj.subclassFeature).map(asObject)
  const origin = sourceId ?? `class-document:${subclassProficiencyDigest(obj)}`
  const materializedSubclasses = materializeSubclassCopies(asArray(obj.subclass))
  const materialized = materializeSubclassFeatureCopies(records)
  const optionalClassFeatureSources = auditOptionalClassFeatureSources(data, origin, {
    subclasses: materializedSubclasses,
    subclassFeatures: materialized,
  })
  const classFeature = auditFixedClassFeatures(
    auditClassProficiencySources(
      auditNaturalExplorerSources(asArray(obj.classFeature).map(asObject)),
    ),
    origin,
  )
  const classes = auditDirectFixedClassDeclarations(asArray(obj.class).map(asObject), origin)
  const subclass = auditSubclassProficiencyRoots(
    asArray(obj.subclass).map(asObject),
    materializedSubclasses,
    origin,
  )
  if (!records.length)
    return { ...obj, class: classes, classFeature, subclass, optionalClassFeatureSources }
  return {
    ...obj,
    class: classes,
    classFeature,
    subclass,
    optionalClassFeatureSources,
    subclassFeature: auditSubclassProficiencyFeatures(
      records,
      auditFeatureOptionSources(materialized),
      origin,
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
} {
  const prepared = prepareClassDocument(data, sourceId)
  return {
    classes: parsePreparedClasses(prepared),
    classFeatures: parsePreparedClassFeatures(prepared),
    optionalClassFeatureSources: asArray(
      asObject(prepared).optionalClassFeatureSources,
    ) as import('@/types/5etools').OptionalClassFeatureSourceProof[],
  }
}

export function parseClasses(data: unknown): unknown[] {
  return parsePreparedClasses(prepareClassDocument(data))
}

export function parseClassFeatures(data: unknown): unknown[] {
  return parsePreparedClassFeatures(prepareClassDocument(data))
}
