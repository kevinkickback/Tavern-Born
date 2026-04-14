import { asArray, asObject, normalizeKey, type ParsedObject } from './shared'

function getClassFeatureIndex(classFeatureRecords: unknown[]): Map<string, ParsedObject> {
  const index = new Map<string, ParsedObject>()

  for (const record of classFeatureRecords) {
    const feature = asObject(record)
    const name = normalizeKey(feature.name)
    const source = normalizeKey(feature.source)
    if (!name || !source) continue

    const key = `${name}|${source}`
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

function resolveClassFeatureRecord(
  ref: ParsedObject,
  featureIndex: Map<string, ParsedObject>,
  classFeatureRecords: unknown[],
): ParsedObject | undefined {
  const name = normalizeKey(ref.name)
  const source = normalizeKey(ref.source)

  if (name && source) {
    const exact = featureIndex.get(`${name}|${source}`)
    if (exact) return exact
  }

  const className = normalizeKey(ref.className)
  const classSource = normalizeKey(ref.classSource)
  const level = typeof ref.level === 'number' ? ref.level : undefined

  for (const record of classFeatureRecords) {
    const feature = asObject(record)
    if (normalizeKey(feature.name) !== name) continue
    if (className && normalizeKey(feature.className) !== className) continue
    if (classSource && normalizeKey(feature.classSource) !== classSource) continue
    if (level !== undefined && feature.level !== level) continue
    if (source && typeof feature.source === 'string' && normalizeKey(feature.source) !== source)
      continue
    return feature
  }

  if (!source) {
    for (const record of classFeatureRecords) {
      const feature = asObject(record)
      if (normalizeKey(feature.name) !== name) continue
      if (className && normalizeKey(feature.className) !== className) continue
      if (classSource && normalizeKey(feature.classSource) !== classSource) continue
      if (level !== undefined && feature.level !== level) continue
      return feature
    }
  }

  return undefined
}

function parseClassFeatureReference(
  rawRef: unknown,
  classObj: ParsedObject,
  featureIndex: Map<string, ParsedObject>,
  classFeatureRecords: unknown[],
): ParsedObject | null {
  const refObj = typeof rawRef === 'object' && rawRef !== null ? asObject(rawRef) : {}
  const refText =
    typeof rawRef === 'string'
      ? rawRef
      : typeof refObj.classFeature === 'string'
        ? refObj.classFeature
        : null

  if (!refText) return null

  const parts = refText.split('|')
  const level = Number.parseInt(parts[3] ?? '', 10)
  const parsedRef: ParsedObject = {
    ref: refText,
    name: parts[0] ?? '',
    className: parts[1] || classObj.name || '',
    classSource: parts[2] || classObj.source,
    source: parts[4] || parts[2] || classObj.source,
    gainSubclassFeature: refObj.gainSubclassFeature === true,
  }

  if (!Number.isNaN(level)) {
    parsedRef.level = level
  }

  const feature = resolveClassFeatureRecord(parsedRef, featureIndex, classFeatureRecords)
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
    level: typeof feature.level === 'number' ? feature.level : parsedRef.level,
    feature,
  }
}

function parseClassFeatureReferences(
  classObj: ParsedObject,
  classFeatureRecords: unknown[],
  featureIndex: Map<string, ParsedObject>,
): ParsedObject[] {
  const refs = asArray(classObj.classFeatures)
  return refs
    .map((ref) => parseClassFeatureReference(ref, classObj, featureIndex, classFeatureRecords))
    .filter((ref): ref is ParsedObject => ref !== null)
}

function resolveSubclassFeatureRecord(
  ref: ParsedObject,
  subclassFeatureRecords: unknown[],
): ParsedObject | undefined {
  const name = normalizeKey(ref.name)
  const source = normalizeKey(ref.source)
  const className = normalizeKey(ref.className)
  const classSource = normalizeKey(ref.classSource)
  const subclassShortName = normalizeKey(ref.subclassShortName)
  const subclassSource = normalizeKey(ref.subclassSource)
  const level = typeof ref.level === 'number' ? ref.level : undefined

  for (const record of subclassFeatureRecords) {
    const feature = asObject(record)
    if (normalizeKey(feature.name) !== name) continue
    if (className && normalizeKey(feature.className) !== className) continue
    if (
      classSource &&
      typeof feature.classSource === 'string' &&
      normalizeKey(feature.classSource) !== classSource
    )
      continue
    if (
      subclassShortName &&
      typeof feature.subclassShortName === 'string' &&
      normalizeKey(feature.subclassShortName) !== subclassShortName
    )
      continue
    if (
      subclassSource &&
      typeof feature.subclassSource === 'string' &&
      normalizeKey(feature.subclassSource) !== subclassSource
    )
      continue
    if (level !== undefined && feature.level !== level) continue
    if (source && typeof feature.source === 'string' && normalizeKey(feature.source) !== source)
      continue
    return feature
  }

  if (!source) {
    for (const record of subclassFeatureRecords) {
      const feature = asObject(record)
      if (normalizeKey(feature.name) !== name) continue
      if (className && normalizeKey(feature.className) !== className) continue
      if (
        classSource &&
        typeof feature.classSource === 'string' &&
        normalizeKey(feature.classSource) !== classSource
      )
        continue
      if (
        subclassShortName &&
        typeof feature.subclassShortName === 'string' &&
        normalizeKey(feature.subclassShortName) !== subclassShortName
      )
        continue
      if (
        subclassSource &&
        typeof feature.subclassSource === 'string' &&
        normalizeKey(feature.subclassSource) !== subclassSource
      )
        continue
      if (level !== undefined && feature.level !== level) continue
      return feature
    }
  }

  return undefined
}

function parseSubclassFeatureReference(
  rawRef: unknown,
  subclassObj: ParsedObject,
  subclassFeatureRecords: unknown[],
): ParsedObject | null {
  if (typeof rawRef !== 'string') return null

  const parts = rawRef.split('|')
  const level = Number.parseInt(parts[5] ?? '', 10)
  const parsedRef: ParsedObject = {
    ref: rawRef,
    name: parts[0] ?? '',
    className: parts[1] || subclassObj.className || '',
    classSource: parts[2] || subclassObj.classSource,
    subclassShortName: parts[3] || subclassObj.shortName || subclassObj.subclassShortName || '',
    subclassSource: parts[4] || subclassObj.source,
    source: parts[6] || subclassObj.source,
  }

  if (!Number.isNaN(level)) {
    parsedRef.level = level
  }

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
    .map((ref) => parseSubclassFeatureReference(ref, subclassObj, subclassFeatureRecords))
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

export function parseClasses(data: unknown): unknown[] {
  const obj = asObject(data)
  const classes: unknown[] = obj.class
    ? [...asArray(obj.class)]
    : Array.isArray(data)
      ? [...data]
      : []
  const subclassEntries: unknown[] = asArray(obj.subclass)
  const classFeatureRecords: unknown[] = asArray(obj.classFeature)
  const classFeatureIndex = getClassFeatureIndex(classFeatureRecords)

  // Build maps for intro entries and per-level features from subclassFeature records.
  // XPHB-style subclasses have an intro record whose name === shortName (e.g. "Abjurer").
  // PHB-style subclasses have an intro record whose name === the full subclass name (e.g.
  // "School of Abjuration"), which never matches the shortName ("Abjuration").
  // We capture both patterns: introEntriesMap keyed by shortName, fullNameIntroMap keyed
  // by feature name, so that the lookup below can fall back for PHB-style entries.
  const introEntriesMap = new Map<string, unknown[]>()
  const fullNameIntroMap = new Map<string, unknown[]>()
  const levelFeaturesMap = new Map<string, { level: number; features: unknown[] }[]>()
  const subclassFeatureRecords: unknown[] = asArray(obj.subclassFeature)
  for (const scf of subclassFeatureRecords) {
    const scfObj = asObject(scf)
    if (!scfObj.subclassShortName || !scfObj.className || !scfObj.entries) continue
    const key = `${String(scfObj.subclassShortName)}|${String(scfObj.className)}|${String(scfObj.classSource ?? '')}`
    if (scfObj.name === scfObj.subclassShortName) {
      // XPHB-style intro: name === shortName - capture for shortName-keyed lookup
      if (!introEntriesMap.has(key)) introEntriesMap.set(key, asArray(scfObj.entries))
    } else {
      // PHB-style: feature name is the full subclass name (e.g. "School of Abjuration").
      // Index by feature name so the lookup below can find it via sc.name.
      const nameKey = `${String(scfObj.name ?? '')}|${String(scfObj.className)}|${String(scfObj.classSource ?? '')}`
      if (!fullNameIntroMap.has(nameKey)) fullNameIntroMap.set(nameKey, asArray(scfObj.entries))

      // Content feature - group by level for the rich detail pane
      if (!levelFeaturesMap.has(key)) levelFeaturesMap.set(key, [])
      const levels = levelFeaturesMap.get(key)
      if (!levels) continue
      const level = typeof scfObj.level === 'number' ? scfObj.level : 0
      const existing = levels.find((l) => l.level === level)
      if (existing) {
        existing.features.push(scf)
      } else {
        levels.push({ level, features: [scf] })
      }
    }
  }

  // Group subclasses by parent class (by className + classSource)
  const subclassMap = new Map<string, unknown[]>()
  for (const sc of subclassEntries) {
    const scObj = asObject(sc)
    const className = typeof scObj.className === 'string' ? scObj.className : undefined
    const classSource = typeof scObj.classSource === 'string' ? scObj.classSource : undefined
    if (!className) continue
    const parentKey = `${className}|${classSource ?? ''}`
    if (!subclassMap.has(parentKey)) subclassMap.set(parentKey, [])
    const introKey = `${String(scObj.shortName ?? '')}|${className}|${classSource ?? ''}`
    // Fallback: PHB-style subclasses where shortName != feature name; look up by sc.name
    const fullNameKey = `${String(scObj.name ?? '')}|${className}|${classSource ?? ''}`
    const entries = introEntriesMap.get(introKey) ?? fullNameIntroMap.get(fullNameKey) ?? []
    const subclassFeatureRefs = parseSubclassFeatureReferences(scObj, subclassFeatureRecords)
    const levelFeatures =
      groupSubclassFeaturesByLevel(subclassFeatureRefs).length > 0
        ? groupSubclassFeaturesByLevel(subclassFeatureRefs)
        : (levelFeaturesMap.get(introKey) ?? [])
    subclassMap.get(parentKey)?.push({
      ...scObj,
      entries,
      subclassFeatureRefs,
      levelFeatures,
    })
  }

  return classes.map((cls) => {
    const clsObj = asObject(cls)
    const key = `${String(clsObj.name ?? '')}|${String(clsObj.source ?? '')}`
    const nested = subclassMap.get(key)
    const classFeatureRefs = parseClassFeatureReferences(
      clsObj,
      classFeatureRecords,
      classFeatureIndex,
    )
    const spellSlotProgression = getClassSpellSlotProgression(clsObj)

    return {
      ...clsObj,
      subclasses: nested ?? [],
      classFeatureRefs,
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
  const parts = refStr.split('|')
  const parsedRef: ParsedObject = {
    name: parts[0] ?? '',
    className: parts[1] ?? '',
    classSource: parts[2] ?? '',
    subclassShortName: parts[3] ?? '',
    subclassSource: parts[4] ?? '',
    source: parts[4] ?? '',
  }
  const level = Number.parseInt(parts[5] ?? '', 10)
  if (!Number.isNaN(level)) parsedRef.level = level
  const feature = resolveSubclassFeatureRecord(parsedRef, subclassFeatureRecords)
  if (!feature) return entry
  return { ...entry, feature }
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

export function parseClassFeatures(data: unknown): unknown[] {
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
