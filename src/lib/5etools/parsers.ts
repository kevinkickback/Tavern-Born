import type { z } from 'zod'
import type { Language5e } from '@/types/5etools'
import { SOURCE_FALLBACKS } from './sourceFallbacks'

function _validateData<T>(data: unknown, schema: z.ZodType<T>, resourceName: string): T[] {
  try {
    if (Array.isArray(data)) {
      return data.map((item, index) => {
        try {
          return schema.parse(item)
        } catch (error) {
          console.warn(`Validation error in ${resourceName}[${index}]:`, error)
          return item
        }
      })
    }
    return []
  } catch (error) {
    console.warn(`Failed to validate ${resourceName}:`, error)
    return []
  }
}

type ParsedObject = Record<string, unknown>

function asObject(data: unknown): ParsedObject {
  return typeof data === 'object' && data !== null ? (data as ParsedObject) : {}
}

function asArray(data: unknown): unknown[] {
  return Array.isArray(data) ? data : []
}

type SpellSourceLookup = Record<string, Record<string, unknown>>

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getSpellLookupEntry(
  sourceLookup: SpellSourceLookup,
  spell: ParsedObject,
): ParsedObject | null {
  const source = normalizeKey(spell.source)
  const name = normalizeKey(spell.name)
  if (!source || !name) return null

  const bySource = sourceLookup[source]
  if (!bySource || typeof bySource !== 'object') return null

  const entry = bySource[name]
  return typeof entry === 'object' && entry !== null ? (entry as ParsedObject) : null
}

function mergeSpellClassList(spell: ParsedObject, lookupEntry: ParsedObject): void {
  const classLookup = asObject(lookupEntry.class)
  if (!Object.keys(classLookup).length) return

  const classes = asObject(spell.classes)
  const fromClassList = asArray(classes.fromClassList)
  const seen = new Set(
    fromClassList
      .map((it) => asObject(it))
      .map((it) => `${normalizeKey(it.name)}|${normalizeKey(it.source)}`),
  )

  for (const [source, classNameTo] of Object.entries(classLookup)) {
    const classNameMap = asObject(classNameTo)
    for (const [name, val] of Object.entries(classNameMap)) {
      const key = `${normalizeKey(name)}|${normalizeKey(source)}`
      if (seen.has(key)) continue

      const toAdd: ParsedObject = { name, source }
      if (val && typeof val === 'object') {
        const valObj = asObject(val)
        if (typeof valObj.definedInSource === 'string') {
          toAdd.definedInSource = valObj.definedInSource
        }
        if (Array.isArray(valObj.definedInSources)) {
          toAdd.definedInSources = valObj.definedInSources
        }
      }

      fromClassList.push(toAdd)
      seen.add(key)
    }
  }

  classes.fromClassList = fromClassList
  spell.classes = classes
}

function mergeSpellSubclassList(spell: ParsedObject, lookupEntry: ParsedObject): void {
  const subclassLookup = asObject(lookupEntry.subclass)
  if (!Object.keys(subclassLookup).length) return

  const classes = asObject(spell.classes)
  const fromSubclass = asArray(classes.fromSubclass)
  const seen = new Set(
    fromSubclass
      .map((it) => asObject(it))
      .map((it) => {
        const classObj = asObject(it.class)
        const subclassObj = asObject(it.subclass)
        return `${normalizeKey(classObj.name)}|${normalizeKey(classObj.source)}|${normalizeKey(subclassObj.shortName ?? subclassObj.name)}|${normalizeKey(subclassObj.source)}`
      }),
  )

  for (const [classSource, classNameTo] of Object.entries(subclassLookup)) {
    const classNameMap = asObject(classNameTo)
    for (const [className, subclassSourceTo] of Object.entries(classNameMap)) {
      const subclassSourceMap = asObject(subclassSourceTo)
      for (const [subclassSource, shortNameTo] of Object.entries(subclassSourceMap)) {
        const shortNameMap = asObject(shortNameTo)
        for (const [shortName, value] of Object.entries(shortNameMap)) {
          const valueObj = asObject(value)
          const fullName = typeof valueObj.name === 'string' ? valueObj.name : shortName
          const key = `${normalizeKey(className)}|${normalizeKey(classSource)}|${normalizeKey(shortName)}|${normalizeKey(subclassSource)}`
          if (seen.has(key)) continue

          fromSubclass.push({
            class: { name: className, source: classSource },
            subclass: {
              name: fullName,
              shortName,
              source: subclassSource,
            },
          })
          seen.add(key)
        }
      }
    }
  }

  classes.fromSubclass = fromSubclass
  spell.classes = classes
}

function enrichSpellFromLookup(
  spell: ParsedObject,
  sourceLookup?: SpellSourceLookup,
): ParsedObject {
  if (!sourceLookup) return spell

  const lookupEntry = getSpellLookupEntry(sourceLookup, spell)
  if (!lookupEntry) return spell

  const out = { ...spell }
  mergeSpellClassList(out, lookupEntry)
  mergeSpellSubclassList(out, lookupEntry)
  return out
}

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

export function parseRaces(data: unknown): unknown[] {
  const obj = asObject(data)
  const races: unknown[] = obj.race ? [...asArray(obj.race)] : Array.isArray(data) ? [...data] : []
  const subraceEntries: unknown[] = asArray(obj.subrace)

  if (subraceEntries.length === 0) return races

  // Group subraces by parent race. The parent is identified by raceName + raceSource.
  // Some subraces store this directly; others use _copy.raceName / _copy.raceSource.
  const subraceMap = new Map<string, unknown[]>()
  for (const sr of subraceEntries) {
    const srObj = asObject(sr)
    const copyObj = asObject(srObj._copy)
    const raceName: string | undefined =
      typeof srObj.raceName === 'string' ? srObj.raceName : (copyObj.raceName as string | undefined)
    const raceSource: string | undefined =
      (typeof srObj.raceSource === 'string' ? srObj.raceSource : undefined) ??
      (typeof copyObj.raceSource === 'string' ? copyObj.raceSource : undefined) ??
      (typeof srObj.source === 'string' ? srObj.source : undefined)
    if (!raceName) continue
    const key = `${raceName}|${raceSource ?? ''}`
    if (!subraceMap.has(key)) subraceMap.set(key, [])
    subraceMap.get(key)?.push(sr)
  }

  return races.map((race) => {
    const raceObj = asObject(race)
    const key = `${String(raceObj.name ?? '')}|${String(raceObj.source ?? '')}`
    const nested = subraceMap.get(key)
    if (!nested || nested.length === 0) return race
    return {
      ...raceObj,
      subraces: nested.map((subrace) => {
        const subraceObj = asObject(subrace)
        if (typeof subraceObj.name === 'string' && subraceObj.name.trim().length > 0) {
          return subraceObj
        }
        return { ...subraceObj, name: 'Default' }
      }),
    }
  })
}

function getFirstStringFromEntries(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry
    }
    const entryObj = asObject(entry)
    const nestedEntries = asArray(entryObj.entries)
    if (nestedEntries.length > 0) {
      const nested = getFirstStringFromEntries(nestedEntries)
      if (nested) return nested
    }
  }

  return null
}

export function parseRaceFluffSummaries(
  data: unknown,
): Array<{ name: string; source: string; summary: string }> {
  const obj = asObject(data)
  const raceFluff = asArray(obj.raceFluff)

  return raceFluff
    .map((entry) => {
      const fluff = asObject(entry)
      const name = typeof fluff.name === 'string' ? fluff.name : ''
      const source = typeof fluff.source === 'string' ? fluff.source : ''
      const summary = getFirstStringFromEntries(asArray(fluff.entries))

      if (!name || !source || !summary) return null
      return { name, source, summary }
    })
    .filter(
      (
        value,
      ): value is {
        name: string
        source: string
        summary: string
      } => value !== null,
    )
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
      // XPHB-style intro: name === shortName — capture for shortName-keyed lookup
      if (!introEntriesMap.has(key)) introEntriesMap.set(key, asArray(scfObj.entries))
    } else {
      // PHB-style: feature name is the full subclass name (e.g. "School of Abjuration").
      // Index by feature name so the lookup below can find it via sc.name.
      const nameKey = `${String(scfObj.name ?? '')}|${String(scfObj.className)}|${String(scfObj.classSource ?? '')}`
      if (!fullNameIntroMap.has(nameKey)) fullNameIntroMap.set(nameKey, asArray(scfObj.entries))

      // Content feature — group by level for the rich detail pane
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

export function parseBackgrounds(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.background) return asArray(obj.background)
  if (Array.isArray(data)) return data
  return []
}

export function parseSpells(
  data: unknown,
  options?: { sourceLookup?: SpellSourceLookup },
): unknown[] {
  const obj = asObject(data)
  const spells = obj.spell ? asArray(obj.spell) : Array.isArray(data) ? data : []
  return spells.map((spell) => enrichSpellFromLookup(asObject(spell), options?.sourceLookup))
}

export function parseFeats(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.feat) return asArray(obj.feat)
  if (Array.isArray(data)) return data
  return []
}

export function parseItems(data: unknown): unknown[] {
  const obj = asObject(data)
  const items: unknown[] = []

  if (obj.item) items.push(...asArray(obj.item))
  if (obj.itemGroup) items.push(...asArray(obj.itemGroup))
  if (obj.baseitem) items.push(...asArray(obj.baseitem))
  if (Array.isArray(data)) items.push(...data)

  return items
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

export function parseActions(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.action) return asArray(obj.action)
  if (Array.isArray(data)) return data
  return []
}

export function parseConditions(data: unknown): unknown[] {
  const obj = asObject(data)
  const conditions: unknown[] = []
  if (obj.condition) conditions.push(...asArray(obj.condition))
  if (obj.disease) conditions.push(...asArray(obj.disease))
  if (Array.isArray(data)) conditions.push(...data)
  return conditions
}

export function parseDeities(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.deity) return asArray(obj.deity)
  if (Array.isArray(data)) return data
  return []
}

export function parseSkills(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.skill) return asArray(obj.skill)
  if (Array.isArray(data)) return data
  return []
}

export function parseSenses(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.sense) return asArray(obj.sense)
  if (Array.isArray(data)) return data
  return []
}

export function parseLanguages(data: unknown): Language5e[] {
  const obj = asObject(data)
  if (obj.language) return asArray(obj.language) as Language5e[]
  if (Array.isArray(data)) return data as Language5e[]
  return []
}

export function parseMagicVariants(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.variant) return asArray(obj.variant)
  if (obj.magicvariant) return asArray(obj.magicvariant)
  if (Array.isArray(data)) return data
  return []
}

export function parseOptionalFeatures(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.optionalfeature) return asArray(obj.optionalfeature)
  if (Array.isArray(data)) return data
  return []
}

export function parseVariantRules(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.variantrule) return asArray(obj.variantrule)
  if (Array.isArray(data)) return data
  return []
}

export function parseBooks(data: unknown): unknown[] {
  const obj = asObject(data)
  if (!data) return []
  if (obj.book) return asArray(obj.book)
  if (obj.adventure) return asArray(obj.adventure)
  if (Array.isArray(data)) return data
  return []
}

/**
 * Extract named proficiencies from a 5etools proficiency/language block array.
 * Returns an array of string labels (name, "choose N", "any N standard").
 * Omits structural keys like `choose` and `anyStandard`.
 *
 * @param blocks  - e.g. `race.languageProficiencies`, `bg.skillProficiencies`, etc.
 * @param includeAnyStandard - include "any N standard" entries (default true)
 */
export function extractProficiencyBlockNames(
  blocks: unknown[],
  { includeAnyStandard = true } = {},
): string[] {
  const out: string[] = []
  for (const block of blocks) {
    const blockObj = asObject(block)
    for (const [key, val] of Object.entries(blockObj)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    const anyStandard = blockObj.anyStandard
    if (includeAnyStandard && typeof anyStandard === 'number')
      out.push(`any ${anyStandard} standard`)
    const chooseObj = asObject(blockObj.choose)
    if (typeof chooseObj.count === 'number') out.push(`choose ${chooseObj.count}`)
  }
  return out
}

export function buildSourcesList(
  sourceAbbreviations: string[],
  booksData: unknown,
  adventuresData?: unknown,
): Array<{
  abbreviation: string
  name: string
  group: string
  year?: number
  hasCharacterOptions: boolean
}> {
  const booksList = parseBooks(booksData)
  const adventuresList = adventuresData ? parseBooks(adventuresData) : []
  const allEntries = [...booksList, ...adventuresList]
  // Key by both id AND source so entries like {id:"PS-A", source:"PSA"} resolve under both keys
  const booksMap = new Map<string, ParsedObject>()
  for (const entry of allEntries) {
    const entryObj = asObject(entry)
    const id = typeof entryObj.id === 'string' ? entryObj.id : undefined
    const source = typeof entryObj.source === 'string' ? entryObj.source : undefined
    if (id) booksMap.set(id, entryObj)
    if (source && source !== id) booksMap.set(source, entryObj)
  }

  const characterRelevantGroups = [
    'core',
    'supplement',
    'supplement-alt',
    'setting',
    'setting-alt',
    'adventure',
    'organized-play',
  ]

  return sourceAbbreviations
    .map((abbr) => {
      const book =
        booksMap.get(abbr) ??
        (SOURCE_FALLBACKS[abbr] ? { id: abbr, source: abbr, ...SOURCE_FALLBACKS[abbr] } : null)
      if (!book) {
        return {
          abbreviation: abbr,
          name: abbr,
          group: 'other',
          hasCharacterOptions: true,
        }
      }
      const bookObj = asObject(book)
      const group = typeof bookObj.group === 'string' ? bookObj.group : 'other'

      const hasCharacterOptions = characterRelevantGroups.includes(group)
      const published = typeof bookObj.published === 'string' ? bookObj.published : undefined

      return {
        abbreviation:
          typeof bookObj.id === 'string'
            ? bookObj.id
            : typeof bookObj.source === 'string'
              ? bookObj.source
              : abbr,
        name: typeof bookObj.name === 'string' ? bookObj.name : abbr,
        group,
        year: published ? Number.parseInt(published, 10) : undefined,
        hasCharacterOptions,
      }
    })
    .filter((source) => source.hasCharacterOptions !== false)
    .sort((a, b) => {
      const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']
      const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
      if (groupDiff !== 0) return groupDiff
      // Within core: PHB first, DMG second, MM third
      if (a.group === 'core') {
        const coreSlot = (abbr: string) => {
          if (abbr === 'PHB' || abbr === 'XPHB') return 0
          if (abbr === 'DMG' || abbr === 'XDMG') return 1
          if (abbr === 'MM' || abbr === 'XMM') return 2
          return 3
        }
        const slotDiff = coreSlot(a.abbreviation) - coreSlot(b.abbreviation)
        if (slotDiff !== 0) return slotDiff
      }
      if (a.year && b.year && a.year !== b.year) return b.year - a.year
      return a.name.localeCompare(b.name)
    })
}
