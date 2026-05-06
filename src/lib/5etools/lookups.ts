import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { ABILITY_ABBREV_TO_FULL } from '@/lib/calculations/abilityNames'
import type {
  Class5e,
  ClassFeature,
  GameData,
  GameDataLookups,
  ItemProperty5e,
  ItemType5e,
  Spell5e,
  Subclass5e,
} from '@/types/5etools'

export function getEntityLookupKey(name?: unknown, source?: unknown): string {
  const safeName = typeof name === 'string' ? name.trim() : ''
  const safeSource = typeof source === 'string' ? source.trim() : ''
  return `${safeName}|${safeSource}`
}

export function getSubclassLookupKey(
  className?: unknown,
  classSource?: unknown,
  subclassName?: unknown,
  subclassSource?: unknown,
): string {
  return [
    typeof className === 'string' ? className.trim() : '',
    typeof classSource === 'string' ? classSource.trim() : '',
    typeof subclassName === 'string' ? subclassName.trim() : '',
    typeof subclassSource === 'string' ? subclassSource.trim() : '',
  ].join('|')
}

export function buildClassFeatureLookup(
  classFeatures: ClassFeature[],
): Record<string, ClassFeature> {
  return classFeatures.reduce<Record<string, ClassFeature>>((lookup, feature) => {
    const key = getEntityLookupKey(feature.name, feature.source)
    if (key !== '|' && !lookup[key]) {
      lookup[key] = feature
    }
    return lookup
  }, {})
}

export function buildClassLookup(classes: Class5e[]): Record<string, Class5e> {
  return classes.reduce<Record<string, Class5e>>((lookup, cls) => {
    const key = getEntityLookupKey(cls.name, cls.source)
    if (key !== '|' && !lookup[key]) {
      lookup[key] = cls
    }
    return lookup
  }, {})
}

export function buildSpellLookup(spells: Spell5e[]): Record<string, Spell5e> {
  return spells.reduce<Record<string, Spell5e>>((lookup, spell) => {
    const key = getEntityLookupKey(spell.name, spell.source)
    if (key !== '|' && !lookup[key]) {
      lookup[key] = spell
    }
    return lookup
  }, {})
}

export function buildOptionalFeatureLookup(optionalFeatures: unknown[]): Record<string, unknown> {
  return optionalFeatures.reduce<Record<string, unknown>>((lookup, feature) => {
    if (typeof feature !== 'object' || feature === null) return lookup
    const key = getEntityLookupKey(
      (feature as { name?: unknown }).name,
      (feature as { source?: unknown }).source,
    )
    if (key !== '|' && !lookup[key]) {
      lookup[key] = feature
    }
    return lookup
  }, {})
}

export function buildSubclassLookup(classes: Class5e[]): Record<string, Subclass5e> {
  return classes.reduce<Record<string, Subclass5e>>((lookup, cls) => {
    for (const subclass of cls.subclasses ?? []) {
      const key = getSubclassLookupKey(cls.name, cls.source, subclass.name, subclass.source)
      if (key !== '|||' && !lookup[key]) {
        lookup[key] = subclass
      }

      const shortKey = getSubclassLookupKey(
        cls.name,
        cls.source,
        subclass.shortName,
        subclass.source,
      )
      if (shortKey !== '|||' && !lookup[shortKey]) {
        lookup[shortKey] = subclass
      }
    }
    return lookup
  }, {})
}

export function buildGameDataLookups(gameData: GameData): GameDataLookups {
  return {
    classesByKey: buildClassLookup(gameData.classes),
    classFeaturesByKey: buildClassFeatureLookup(gameData.classFeatures),
    spellsByKey: buildSpellLookup(gameData.spells),
    optionalFeaturesByKey: buildOptionalFeatureLookup(gameData.optionalfeatures),
    subclassesByKey: buildSubclassLookup(gameData.classes),
    itemLookup: buildItemLookup([...(gameData.items ?? []), ...(gameData.itemsBase ?? [])]),
    itemPropertyByAbbr: buildItemPropertyLookup(gameData.itemProperties ?? []),
    itemTypeByAbbr: buildItemTypeLookup(gameData.itemTypes ?? []),
    skillToAbilityMap: buildSkillToAbilityMap(gameData.skills ?? []),
    skillList: buildSkillList(gameData.skills ?? []),
    conditionNames: buildConditionNames(gameData.conditions ?? []),
  }
}

/** Build an abbreviation → display name map from parsed itemProperty records. */
export function buildItemPropertyLookup(itemProperties: ItemProperty5e[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const prop of itemProperties) {
    if (!prop.abbreviation || result[prop.abbreviation]) continue
    const first = Array.isArray(prop.entries) && prop.entries.length > 0 ? prop.entries[0] : null
    const name = (first as { name?: string } | null)?.name ?? prop.abbreviation
    result[prop.abbreviation] = name
  }
  return result
}

/** Build an abbreviation → display name map from parsed itemType records. */
export function buildItemTypeLookup(itemTypes: ItemType5e[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const t of itemTypes) {
    if (!t.abbreviation || result[t.abbreviation]) continue
    result[t.abbreviation] = t.name
  }
  return result
}

/**
 * Build a lowercase skill name → full ability name map from parsed skills records.
 * Deduplicates PHB/XPHB reprints by keeping the first occurrence per skill name.
 */
export function buildSkillToAbilityMap(skills: unknown[]): Record<string, string> {
  const result: Record<string, string> = {}
  const seen = new Set<string>()
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object') continue
    const s = skill as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name.toLowerCase().trim() : null
    const abbrv = typeof s.ability === 'string' ? s.ability.toLowerCase().trim() : null
    if (!name || !abbrv || seen.has(name)) continue
    seen.add(name)
    const fullAbility = ABILITY_ABBREV_TO_FULL[abbrv]
    if (fullAbility) result[name] = fullAbility
  }
  return result
}

/**
 * Build the ordered list of lowercase skill names from parsed skills records.
 * Deduplicates PHB/XPHB reprints; order reflects JSON declaration order.
 */
export function buildSkillList(skills: unknown[]): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object') continue
    const s = skill as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name.toLowerCase().trim() : null
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }
  return result
}

/**
 * Extract sorted condition names from parsed conditionsdiseases records.
 * Includes only entries tagged as 'condition' by parseConditions (excludes diseases).
 */
export function buildConditionNames(conditions: unknown[]): readonly string[] {
  const names: string[] = []
  for (const c of conditions) {
    if (!c || typeof c !== 'object') continue
    const entry = c as Record<string, unknown>
    if (entry._sourceType !== 'condition') continue
    const name = typeof entry.name === 'string' ? entry.name : null
    if (name) names.push(name)
  }
  return names.sort()
}
