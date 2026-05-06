import type { Background5e, Class5e, Feat5e, Item5e, Race5e, Spell5e } from '@/types/5etools'

export interface RaceFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
  sizes?: string[]
  hasAbilityScore?: string[]
  hasDarkvision?: boolean
}

export interface ClassFilters {
  sources?: string[]
  suppressedKeys?: Set<string>
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

export class DataFilter {
  static filterRaces(races: Race5e[], filters: RaceFilters): Race5e[] {
    let filtered = [...races]

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((r) => sourcesUpper.has(r.source.toUpperCase()))
      filtered = filtered.map((r) => {
        if (!r.subraces || r.subraces.length === 0) return r
        const filteredSubraces = r.subraces.filter((sr) =>
          sourcesUpper.has(((sr as { source?: string }).source ?? r.source).toUpperCase()),
        )
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

    if (filters.sources && filters.sources.length > 0) {
      const sourcesUpper = new Set(filters.sources.map((s) => s.toUpperCase()))
      filtered = filtered.filter((c) => sourcesUpper.has(c.source.toUpperCase()))
    }

    if (filters.suppressedKeys && filters.suppressedKeys.size > 0) {
      filtered = filtered.filter((c) => !isSuppressed(c.name, c.source, filters.suppressedKeys))
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
        const isRitual = (s as { ritual?: unknown }).ritual === true
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
      filtered = filtered.filter((f) => sourcesUpper.has(f.source.toUpperCase()))
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
