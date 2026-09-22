import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { isRitualSpell } from '@/lib/calculations/spellUtils'
import type {
  Background5e,
  Class5e,
  ClassFeature,
  ClassFeatureReference,
  Feat5e,
  Item5e,
  Language5e,
  Race5e,
  Spell5e,
  Subclass5e,
  SubclassFeature,
  SubclassFeatureReference,
} from '@/types/5etools'

export interface RaceFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  allowedKeys?: ReadonlySet<string>
  sizes?: string[]
  hasAbilityScore?: string[]
  hasDarkvision?: boolean
}

export interface ClassFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  allowedSubclassKeys?: ReadonlySet<string>
  hasProficiency?: string[]
  spellcaster?: boolean
  hitDice?: number[]
}

export interface SpellFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  levels?: number[]
  schools?: string[]
  classes?: string[]
  concentration?: boolean
  ritual?: boolean
  components?: {
    verbal?: boolean
    somatic?: boolean
    material?: boolean
  }
}

export interface BackgroundFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  hasSkill?: string[]
  hasLanguage?: string[]
}

export interface FeatFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  allowedKeys?: ReadonlySet<string>
  categories?: string[]
  hasPrerequisite?: boolean
  grantsAbilityScore?: boolean
}

export interface ItemFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  types?: string[]
  rarities?: string[]
  weaponCategories?: string[]
  armorCategories?: string[]
}

export interface LanguageFilters {
  sources?: string[]
}

const isSuppressed = (
  name: string | undefined,
  source: string | undefined,
  suppressedKeys?: Set<string>,
) => {
  if (!name || !source || !suppressedKeys || suppressedKeys.size === 0) {
    return false
  }
  return suppressedKeys.has(`${name}|${source}`)
}

type SubclassFeatureInclusion = (name: string | undefined, source: string) => boolean

const removedNestedSubclassFeature = Symbol('removedNestedSubclassFeature')

function subclassFeatureIdentity(
  feature: string | SubclassFeature,
  fallbackSource: string,
): { name: string | undefined; source: string } {
  if (typeof feature !== 'string') {
    return { name: feature.name, source: feature.source || fallbackSource }
  }
  const parts = feature.split('|')
  return { name: parts[0], source: parts[6] || fallbackSource }
}

function pruneNestedSubclassFeatureRecords(
  value: unknown,
  include: SubclassFeatureInclusion,
  fallbackSource: string,
): unknown | typeof removedNestedSubclassFeature {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const filtered = pruneNestedSubclassFeatureRecords(entry, include, fallbackSource)
      return filtered === removedNestedSubclassFeature ? [] : [filtered]
    })
  }
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  let nestedSource = fallbackSource
  if (record.type === 'refSubclassFeature') {
    const parts =
      typeof record.subclassFeature === 'string' ? record.subclassFeature.split('|') : []
    const embeddedFeature =
      record.feature && typeof record.feature === 'object'
        ? (record.feature as Record<string, unknown>)
        : undefined
    const name =
      parts[0] || (typeof embeddedFeature?.name === 'string' ? embeddedFeature.name : undefined)
    nestedSource =
      parts[6] ||
      (typeof embeddedFeature?.source === 'string' ? embeddedFeature.source : fallbackSource)
    if (!include(name, nestedSource)) return removedNestedSubclassFeature
  }

  const filteredEntries = Object.entries(record).flatMap(([key, entry]) => {
    const filtered = pruneNestedSubclassFeatureRecords(entry, include, nestedSource)
    return filtered === removedNestedSubclassFeature ? [] : [[key, filtered] as const]
  })
  return Object.fromEntries(filteredEntries)
}

function pruneNestedSubclassFeatures(
  feature: SubclassFeature,
  include: SubclassFeatureInclusion,
  fallbackSource: string,
): SubclassFeature {
  if (feature.entries === undefined) return feature
  const entries = pruneNestedSubclassFeatureRecords(feature.entries, include, fallbackSource)
  return {
    ...feature,
    entries: entries === removedNestedSubclassFeature ? [] : (entries as unknown[]),
  }
}

function filterSubclassContent(
  subclass: Subclass5e,
  include: SubclassFeatureInclusion,
): Pick<Subclass5e, 'subclassFeatures' | 'subclassFeatureRefs' | 'levelFeatures'> {
  const prune = (feature: SubclassFeature) =>
    pruneNestedSubclassFeatures(feature, include, feature.source || subclass.source)
  const subclassFeatures = subclass.subclassFeatures?.flatMap((feature) => {
    const identity = subclassFeatureIdentity(feature, subclass.source)
    if (!include(identity.name, identity.source)) return []
    return [typeof feature === 'string' ? feature : prune(feature)]
  }) as typeof subclass.subclassFeatures
  const subclassFeatureRefs = subclass.subclassFeatureRefs?.flatMap((reference) => {
    const source = reference.source || reference.feature?.source || subclass.source
    if (!include(reference.name, source)) return []
    return [reference.feature ? { ...reference, feature: prune(reference.feature) } : reference]
  })
  const levelFeatures = subclass.levelFeatures
    ?.map((group) => ({
      ...group,
      features: group.features.flatMap((feature) => {
        const identity = subclassFeatureIdentity(feature, subclass.source)
        return include(identity.name, identity.source) ? [prune(feature)] : []
      }),
    }))
    .filter((group) => group.features.length > 0)
  return { subclassFeatures, subclassFeatureRefs, levelFeatures }
}

function directClassFeatureReferences(classData: Class5e): ClassFeatureReference[] {
  return (classData.classFeatures ?? []).flatMap((feature) => {
    if (typeof feature === 'string') return []
    const typedFeature = feature as ClassFeature
    const level = typedFeature.level
    return [
      {
        ref: `${typedFeature.name}|${typedFeature.className || classData.name}|${typedFeature.classSource || classData.source}|${level ?? ''}|${typedFeature.source || classData.source}`,
        name: typedFeature.name,
        source: typedFeature.source || classData.source,
        className: typedFeature.className || classData.name,
        classSource: typedFeature.classSource || classData.source,
        level,
        feature: typedFeature,
      },
    ]
  })
}

function directSubclassFeatureReferences(
  classData: Class5e,
  subclass: Subclass5e,
): SubclassFeatureReference[] {
  const features = new Map<string, { feature: SubclassFeature; level?: number }>()
  const add = (feature: SubclassFeature, fallbackLevel?: number) => {
    const level = feature.level ?? fallbackLevel
    const key = `${feature.name}|${feature.source}|${level ?? ''}`
    if (!features.has(key)) features.set(key, { feature, level })
  }
  for (const feature of subclass.subclassFeatures ?? []) {
    if (typeof feature === 'object') add(feature)
  }
  for (const group of subclass.levelFeatures ?? []) {
    for (const feature of group.features) add(feature, group.level)
  }
  return [...features.values()].map(({ feature, level }) => {
    const className = feature.className || subclass.className || classData.name
    const classSource = feature.classSource || subclass.classSource || classData.source
    const subclassShortName = feature.subclassShortName || subclass.shortName
    const subclassSource = feature.subclassSource || subclass.source
    return {
      ref: `${feature.name}|${className}|${classSource}|${subclassShortName}|${subclassSource}|${level ?? ''}|${feature.source || subclass.source}`,
      name: feature.name,
      source: feature.source || subclass.source,
      className,
      classSource,
      subclassShortName,
      subclassSource,
      level,
      feature,
    }
  })
}

function rebuildFilteredClassRules(classData: Class5e, originalClassData: Class5e): Class5e {
  const subclasses = classData.subclasses?.map((subclass) => {
    const originalSubclass = originalClassData.subclasses?.find(
      (candidate) => candidate.name === subclass.name && candidate.source === subclass.source,
    )
    const filteredDirectRefs = directSubclassFeatureReferences(classData, subclass)
    const originalDirectRefs = originalSubclass
      ? directSubclassFeatureReferences(originalClassData, originalSubclass)
      : []
    const directContentWasFiltered =
      (originalSubclass?.subclassFeatures?.length ?? 0) !==
        (subclass.subclassFeatures?.length ?? 0) ||
      (originalSubclass?.levelFeatures?.reduce(
        (total, group) => total + group.features.length,
        0,
      ) ?? 0) !==
        (subclass.levelFeatures?.reduce((total, group) => total + group.features.length, 0) ?? 0)
    const shouldRebuild =
      (originalSubclass?.subclassFeatureRefs?.length ?? 0) > 0 ||
      originalDirectRefs.length > 0 ||
      directContentWasFiltered
    const featureRefs =
      (originalSubclass?.subclassFeatureRefs?.length ?? 0) > 0
        ? (subclass.subclassFeatureRefs ?? [])
        : filteredDirectRefs
    return {
      ...subclass,
      normalizedRules: shouldRebuild
        ? normalizeSubclassRules(classData, subclass, featureRefs)
        : subclass.normalizedRules,
    }
  })
  const filteredDirectClassRefs = directClassFeatureReferences(classData)
  const originalDirectClassRefs = directClassFeatureReferences(originalClassData)
  const directClassContentWasFiltered =
    (originalClassData.classFeatures?.length ?? 0) !== (classData.classFeatures?.length ?? 0)
  const shouldRebuildClass =
    (originalClassData.classFeatureRefs?.length ?? 0) > 0 ||
    originalDirectClassRefs.length > 0 ||
    directClassContentWasFiltered
  const classFeatureRefs =
    (originalClassData.classFeatureRefs?.length ?? 0) > 0
      ? (classData.classFeatureRefs ?? [])
      : filteredDirectClassRefs
  return {
    ...classData,
    normalizedRules: shouldRebuildClass
      ? normalizeClassRules(classData, classFeatureRefs)
      : classData.normalizedRules,
    subclasses,
  }
}

const isExplicitlyAllowed = (
  name: string | undefined,
  source: string | undefined,
  allowedKeys?: ReadonlySet<string>,
): boolean => Boolean(name && source && allowedKeys?.has(`${name}|${source}`))

const getSubclassKey = (
  className: string,
  classSource: string,
  subclassName: string,
  subclassSource: string,
): string => `${className}|${classSource}|${subclassName}|${subclassSource}`

export class DataFilter {
  static filterRaces(races: Race5e[], filters: RaceFilters): Race5e[] {
    let filtered = [...races]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter(
        (r) =>
          sourcesUpper.has(r.source.toUpperCase()) ||
          isExplicitlyAllowed(r.name, r.source, filters.allowedKeys),
      )
      filtered = filtered.map((r) => {
        if (!r.subraces || r.subraces.length === 0) return r
        const parentExplicitlyAllowed = isExplicitlyAllowed(r.name, r.source, filters.allowedKeys)
        const filteredSubraces = r.subraces.filter((sr) => {
          const subrace = sr as { name?: string; source?: string }
          const source = subrace.source ?? r.source
          return (
            sourcesUpper.has(source.toUpperCase()) ||
            parentExplicitlyAllowed ||
            isExplicitlyAllowed(subrace.name, source, filters.allowedKeys)
          )
        })
        return { ...r, subraces: filteredSubraces }
      })
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered
        .filter((r) => !isSuppressed(r.name, r.source, filters.suppressedKeys))
        .map((r) => {
          if (!r.subraces || r.subraces.length === 0) return r
          const visibleSubraces = r.subraces.filter((sr) => {
            const subrace = sr as { name?: string; source?: string }
            return !isSuppressed(subrace.name, subrace.source ?? r.source, filters.suppressedKeys)
          })
          return { ...r, subraces: visibleSubraces }
        })
    }

    if (filters.sizes && filters.sizes.length > 0) {
      filtered = filtered.filter((r) => {
        if (!r.size) return false
        return r.size.some((s) => filters.sizes?.includes(s))
      })
    }

    if (filters.hasAbilityScore && filters.hasAbilityScore.length > 0) {
      filtered = filtered.filter((r) => {
        if (!r.ability) return false
        return r.ability.some((ab) => {
          return filters.hasAbilityScore?.some((ability) => ability in ab)
        })
      })
    }

    if (filters.hasDarkvision !== undefined) {
      filtered = filtered.filter((r) => {
        const hasDV = r.darkvision !== undefined && r.darkvision > 0
        return filters.hasDarkvision ? hasDV : !hasDV
      })
    }

    return filtered
  }

  static filterClasses(classes: Class5e[], filters: ClassFilters): Class5e[] {
    let filtered = [...classes]
    const originalClassesByKey = new Map(
      classes.map((classData) => [`${classData.name}|${classData.source}`, classData]),
    )

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((c) => sourcesUpper.has(c.source.toUpperCase()))
      filtered = filtered.map((cls) => ({
        ...cls,
        classFeatures: cls.classFeatures?.filter((feature) => {
          const source =
            typeof feature === 'string'
              ? feature.split('|')[4] || feature.split('|')[2] || cls.source
              : feature.source || cls.source
          return sourcesUpper.has(source.toUpperCase())
        }) as typeof cls.classFeatures,
        classFeatureRefs: cls.classFeatureRefs?.filter((reference) =>
          sourcesUpper.has(
            (reference.source || reference.feature?.source || cls.source).toUpperCase(),
          ),
        ),
        subclasses: cls.subclasses
          ?.filter((subclass) => {
            const key = getSubclassKey(
              subclass.className || cls.name,
              subclass.classSource || cls.source,
              subclass.name,
              subclass.source,
            )
            return (
              sourcesUpper.has(subclass.source.toUpperCase()) ||
              Boolean(filters.allowedSubclassKeys?.has(key))
            )
          })
          .map((subclass) => {
            const key = getSubclassKey(
              subclass.className || cls.name,
              subclass.classSource || cls.source,
              subclass.name,
              subclass.source,
            )
            const isExplicitlyAllowed = Boolean(filters.allowedSubclassKeys?.has(key))
            const isNestedSourceAllowed = (source: string) =>
              sourcesUpper.has(source.toUpperCase()) ||
              (isExplicitlyAllowed && source.toUpperCase() === subclass.source.toUpperCase())
            return {
              ...subclass,
              ...filterSubclassContent(subclass, (_name, source) => isNestedSourceAllowed(source)),
            }
          }),
      }))
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered
        .filter((c) => !isSuppressed(c.name, c.source, filters.suppressedKeys))
        .map((cls) => ({
          ...cls,
          classFeatures: cls.classFeatures?.filter((feature) => {
            const [name, source] =
              typeof feature === 'string'
                ? [feature.split('|')[0], feature.split('|')[4] || feature.split('|')[2]]
                : [feature.name, feature.source]
            return !isSuppressed(name, source || cls.source, filters.suppressedKeys)
          }) as typeof cls.classFeatures,
          classFeatureRefs: cls.classFeatureRefs?.filter(
            (reference) =>
              !isSuppressed(
                reference.name,
                reference.source || reference.feature?.source || cls.source,
                filters.suppressedKeys,
              ),
          ),
          subclasses: cls.subclasses
            ?.filter(
              (subclass) => !isSuppressed(subclass.name, subclass.source, filters.suppressedKeys),
            )
            .map((subclass) => {
              return {
                ...subclass,
                ...filterSubclassContent(
                  subclass,
                  (name, source) => !isSuppressed(name, source, filters.suppressedKeys),
                ),
              }
            }),
        }))
    }

    if (
      (filters.sources && filters.sources.length > 0) ||
      (filters.suppressedKeys && filters.suppressedKeys.size > 0)
    ) {
      filtered = filtered.map((classData) =>
        rebuildFilteredClassRules(
          classData,
          originalClassesByKey.get(`${classData.name}|${classData.source}`) ?? classData,
        ),
      )
    }

    if (filters.hasProficiency && filters.hasProficiency.length > 0) {
      filtered = filtered.filter((c) => {
        if (!c.proficiency) return false
        return filters.hasProficiency?.some((prof) => c.proficiency?.includes(prof))
      })
    }

    if (filters.spellcaster !== undefined) {
      filtered = filtered.filter((c) => {
        const isSpellcaster =
          typeof c.isSpellcaster === 'boolean'
            ? c.isSpellcaster
            : !!c.spellcastingAbility || !!c.casterProgression
        return filters.spellcaster ? isSpellcaster : !isSpellcaster
      })
    }

    if (filters.hitDice && filters.hitDice.length > 0) {
      filtered = filtered.filter((c) => {
        if (!c.hd) return false
        return filters.hitDice?.includes(c.hd.faces)
      })
    }

    return filtered
  }

  static filterSpells(spells: Spell5e[], filters: SpellFilters): Spell5e[] {
    let filtered = [...spells]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((s) => sourcesUpper.has(s.source.toUpperCase()))
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered.filter((s) => !isSuppressed(s.name, s.source, filters.suppressedKeys))
    }

    if (filters.levels && filters.levels.length > 0) {
      filtered = filtered.filter((s) => filters.levels?.includes(s.level))
    }

    if (filters.schools && filters.schools.length > 0) {
      filtered = filtered.filter((s) => filters.schools?.includes(s.school))
    }

    if (filters.classes && filters.classes.length > 0) {
      filtered = filtered.filter((s) => {
        if (!s.classes?.fromClassList) return false
        return s.classes.fromClassList.some((c) => filters.classes?.includes(c.name))
      })
    }

    if (filters.concentration !== undefined) {
      filtered = filtered.filter((s) => {
        const hasConcentration = s.duration.some((d) => d.concentration === true)
        return filters.concentration ? hasConcentration : !hasConcentration
      })
    }

    if (filters.ritual !== undefined) {
      filtered = filtered.filter((s) => {
        const isRitual = isRitualSpell(s)
        return filters.ritual ? isRitual : !isRitual
      })
    }

    if (filters.components) {
      if (filters.components.verbal !== undefined) {
        filtered = filtered.filter((s) => {
          const hasVerbal = s.components?.v === true
          return filters.components?.verbal ? hasVerbal : !hasVerbal
        })
      }

      if (filters.components.somatic !== undefined) {
        filtered = filtered.filter((s) => {
          const hasSomatic = s.components?.s === true
          return filters.components?.somatic ? hasSomatic : !hasSomatic
        })
      }

      if (filters.components.material !== undefined) {
        filtered = filtered.filter((s) => {
          const hasMaterial = s.components?.m !== undefined
          return filters.components?.material ? hasMaterial : !hasMaterial
        })
      }
    }

    return filtered
  }

  static filterBackgrounds(
    backgrounds: Background5e[],
    filters: BackgroundFilters,
  ): Background5e[] {
    let filtered = [...backgrounds]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((b) => sourcesUpper.has(b.source.toUpperCase()))
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered.filter((b) => !isSuppressed(b.name, b.source, filters.suppressedKeys))
    }

    if (filters.hasSkill && filters.hasSkill.length > 0) {
      filtered = filtered.filter((b) => {
        if (!b.skillProficiencies) return false
        return b.skillProficiencies.some((sp) => {
          return filters.hasSkill?.some((skill) => skill in sp)
        })
      })
    }

    if (filters.hasLanguage && filters.hasLanguage.length > 0) {
      filtered = filtered.filter((b) => {
        if (!b.languageProficiencies) return false
        return b.languageProficiencies.some((lp) => {
          return filters.hasLanguage?.some((lang) => lang in lp)
        })
      })
    }

    return filtered
  }

  static filterFeats(feats: Feat5e[], filters: FeatFilters): Feat5e[] {
    let filtered = [...feats]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter(
        (f) =>
          sourcesUpper.has(f.source.toUpperCase()) ||
          isExplicitlyAllowed(f.name, f.source, filters.allowedKeys),
      )
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered.filter((f) => !isSuppressed(f.name, f.source, filters.suppressedKeys))
    }

    if (filters.categories && filters.categories.length > 0) {
      filtered = filtered.filter((f) => {
        if (!f.category) return false
        return filters.categories?.includes(f.category)
      })
    }

    if (filters.hasPrerequisite !== undefined) {
      filtered = filtered.filter((f) => {
        const hasPrereq = !!f.prerequisite && f.prerequisite.length > 0
        return filters.hasPrerequisite ? hasPrereq : !hasPrereq
      })
    }

    if (filters.grantsAbilityScore !== undefined) {
      filtered = filtered.filter((f) => {
        const grantsASI = !!f.ability && f.ability.length > 0
        return filters.grantsAbilityScore ? grantsASI : !grantsASI
      })
    }

    return filtered
  }

  static filterItems(items: Item5e[], filters: ItemFilters): Item5e[] {
    let filtered = [...items]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((i) => sourcesUpper.has(i.source.toUpperCase()))
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered.filter((i) => !isSuppressed(i.name, i.source, filters.suppressedKeys))
    }

    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((i) => filters.types?.includes(i.type))
    }

    if (filters.rarities && filters.rarities.length > 0) {
      filtered = filtered.filter((i) => {
        if (!i.rarity) return false
        return filters.rarities?.includes(i.rarity)
      })
    }

    if (filters.weaponCategories && filters.weaponCategories.length > 0) {
      filtered = filtered.filter((i) => {
        if (!i.weaponCategory) return false
        return filters.weaponCategories?.includes(i.weaponCategory)
      })
    }

    return filtered
  }

  static filterLanguages(languages: Language5e[], filters: LanguageFilters): Language5e[] {
    if (!filters.sources || filters.sources.length === 0) return languages
    const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
    return languages.filter((l) => sourcesUpper.has((l.source ?? '').toUpperCase()))
  }
}

/** Filter any array of named entries to those whose `name` contains the query (case-insensitive). */
export function searchByName<T extends { name: string }>(entries: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((e) => e.name.toLowerCase().includes(q))
}

/** Sort any array of named entries alphabetically by `name`. */
export function sortByName<T extends { name: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name))
}

export function extractUniqueSources(items: { source: string }[]): string[] {
  const sources = new Set<string>()
  items.forEach((item) => {
    sources.add(item.source)
  })
  return Array.from(sources).sort()
}

export function extractUniqueSizes(races: Race5e[]): string[] {
  const sizes = new Set<string>()
  races.forEach((race) => {
    if (race.size) {
      race.size.forEach((s) => {
        sizes.add(s)
      })
    }
  })
  return Array.from(sizes).sort()
}

export function extractUniqueSchools(spells: Spell5e[]): string[] {
  const schools = new Set<string>()
  spells.forEach((spell) => {
    schools.add(spell.school)
  })
  return Array.from(schools).sort()
}

export function extractUniqueSpellLevels(spells: Spell5e[]): number[] {
  const levels = new Set<number>()
  spells.forEach((spell) => {
    levels.add(spell.level)
  })
  return Array.from(levels).sort((a, b) => a - b)
}

export function extractUniqueClasses(spells: Spell5e[]): string[] {
  const classes = new Set<string>()
  spells.forEach((spell) => {
    if (spell.classes?.fromClassList) {
      spell.classes.fromClassList.forEach((c) => {
        classes.add(c.name)
      })
    }
  })
  return Array.from(classes).sort()
}

export function extractUniqueItemTypes(items: Item5e[]): string[] {
  const types = new Set<string>()
  items.forEach((item) => {
    types.add(item.type)
  })
  return Array.from(types).sort()
}

export function extractUniqueRarities(items: Item5e[]): string[] {
  const rarities = new Set<string>()
  items.forEach((item) => {
    if (item.rarity) rarities.add(item.rarity)
  })
  return Array.from(rarities).sort()
}

export function extractUniqueFeatCategories(feats: Feat5e[]): string[] {
  const categories = new Set<string>()
  feats.forEach((feat) => {
    if (typeof feat.category === 'string' && feat.category.length > 0) {
      categories.add(feat.category)
    }
  })
  return Array.from(categories).sort()
}
