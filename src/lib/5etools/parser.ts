import { Race5e, Class5e, Spell5e, Background5e, Feat5e, Item5e, ClassFeature } from '@/types/5etools'

export class FiveEToolsParser {
  static parseRaces(rawData: any): Race5e[] {
    const races: Race5e[] = []
    const raceData = rawData.race || (Array.isArray(rawData) ? rawData : [])

    for (const race of raceData) {
      races.push(this.parseRace(race))
    }

    return races
  }

  static parseRace(raw: any): Race5e {
    return {
      name: raw.name || 'Unknown Race',
      source: raw.source || 'Unknown',
      page: raw.page,
      size: this.parseSizeArray(raw.size),
      speed: this.parseSpeed(raw.speed),
      ability: this.parseAbilityBonuses(raw.ability),
      entries: raw.entries || [],
      darkvision: raw.darkvision,
      languageProficiencies: raw.languageProficiencies,
      skillProficiencies: raw.skillProficiencies,
      resist: raw.resist,
      immune: raw.immune,
      conditionImmune: raw.conditionImmune,
      ...raw,
    }
  }

  static parseClasses(rawData: any): Class5e[] {
    const classes: Class5e[] = []
    const classData = rawData.class || (Array.isArray(rawData) ? rawData : [])

    for (const cls of classData) {
      classes.push(this.parseClass(cls))
    }

    return classes
  }

  static parseClass(raw: any): Class5e {
    return {
      name: raw.name || 'Unknown Class',
      source: raw.source || 'Unknown',
      page: raw.page,
      hd: raw.hd,
      proficiency: raw.proficiency || [],
      startingProficiencies: this.parseStartingProficiencies(raw.startingProficiencies),
      startingEquipment: raw.startingEquipment,
      classTableGroups: raw.classTableGroups,
      classFeatures: raw.classFeatures || [],
      spellcastingAbility: raw.spellcastingAbility,
      casterProgression: raw.casterProgression,
      preparedSpells: raw.preparedSpells,
      ...raw,
    }
  }

  static parseSpells(rawData: any): Spell5e[] {
    const spells: Spell5e[] = []
    const spellData = rawData.spell || (Array.isArray(rawData) ? rawData : [])

    for (const spell of spellData) {
      spells.push(this.parseSpell(spell))
    }

    return spells
  }

  static parseSpell(raw: any): Spell5e {
    return {
      name: raw.name || 'Unknown Spell',
      source: raw.source || 'Unknown',
      page: raw.page,
      level: raw.level ?? 0,
      school: raw.school || 'Unknown',
      time: this.parseCastingTime(raw.time),
      range: this.parseSpellRange(raw.range),
      components: this.parseSpellComponents(raw.components),
      duration: this.parseSpellDuration(raw.duration),
      entries: raw.entries || [],
      entriesHigherLevel: raw.entriesHigherLevel,
      classes: this.parseSpellClasses(raw.classes),
      ...raw,
    }
  }

  static parseBackgrounds(rawData: any): Background5e[] {
    const backgrounds: Background5e[] = []
    const bgData = rawData.background || (Array.isArray(rawData) ? rawData : [])

    for (const bg of bgData) {
      backgrounds.push(this.parseBackground(bg))
    }

    return backgrounds
  }

  static parseBackground(raw: any): Background5e {
    return {
      name: raw.name || 'Unknown Background',
      source: raw.source || 'Unknown',
      page: raw.page,
      skillProficiencies: raw.skillProficiencies,
      languageProficiencies: raw.languageProficiencies,
      toolProficiencies: raw.toolProficiencies,
      startingEquipment: raw.startingEquipment,
      entries: raw.entries || [],
      ...raw,
    }
  }

  static parseFeats(rawData: any): Feat5e[] {
    const feats: Feat5e[] = []
    const featData = rawData.feat || (Array.isArray(rawData) ? rawData : [])

    for (const feat of featData) {
      feats.push(this.parseFeat(feat))
    }

    return feats
  }

  static parseFeat(raw: any): Feat5e {
    return {
      name: raw.name || 'Unknown Feat',
      source: raw.source || 'Unknown',
      page: raw.page,
      prerequisite: raw.prerequisite,
      ability: this.parseAbilityBonuses(raw.ability),
      entries: raw.entries || [],
      ...raw,
    }
  }

  static parseItems(rawData: any): Item5e[] {
    const items: Item5e[] = []
    
    if (rawData.item) items.push(...rawData.item.map((i: any) => this.parseItem(i)))
    if (rawData.itemGroup) items.push(...rawData.itemGroup.map((i: any) => this.parseItem(i)))
    if (rawData.baseitem) items.push(...rawData.baseitem.map((i: any) => this.parseItem(i)))
    if (Array.isArray(rawData)) items.push(...rawData.map((i: any) => this.parseItem(i)))

    return items
  }

  static parseItem(raw: any): Item5e {
    return {
      name: raw.name || 'Unknown Item',
      source: raw.source || 'Unknown',
      page: raw.page,
      type: raw.type || 'Unknown',
      tier: raw.tier,
      rarity: raw.rarity,
      weight: raw.weight,
      value: raw.value,
      entries: raw.entries || [],
      weaponCategory: raw.weaponCategory,
      dmg1: raw.dmg1,
      dmg2: raw.dmg2,
      dmgType: raw.dmgType,
      property: raw.property,
      range: raw.range,
      ac: raw.ac,
      strength: raw.strength,
      stealth: raw.stealth,
      ...raw,
    }
  }

  static parseClassFeatures(rawData: any): ClassFeature[] {
    const features: ClassFeature[] = []
    const featureData = rawData.classFeature || (Array.isArray(rawData) ? rawData : [])

    for (const feature of featureData) {
      features.push(this.parseClassFeature(feature))
    }

    return features
  }

  static parseClassFeature(raw: any): ClassFeature {
    return {
      name: raw.name || 'Unknown Feature',
      source: raw.source || 'Unknown',
      page: raw.page,
      level: raw.level,
      entries: raw.entries || [],
      className: raw.className,
      classSource: raw.classSource,
      ...raw,
    }
  }

  private static parseSizeArray(size: any): string[] | undefined {
    if (!size) return undefined
    if (Array.isArray(size)) return size
    return [size]
  }

  private static parseSpeed(speed: any): number | { walk?: number } | undefined {
    if (!speed) return undefined
    if (typeof speed === 'number') return speed
    if (typeof speed === 'object') {
      if (speed.walk !== undefined) return { walk: speed.walk }
      return speed
    }
    return undefined
  }

  private static parseAbilityBonuses(ability: any): any[] | undefined {
    if (!ability) return undefined
    if (Array.isArray(ability)) return ability
    return [ability]
  }

  private static parseStartingProficiencies(prof: any): any {
    if (!prof) return undefined
    return {
      armor: prof.armor || [],
      weapons: prof.weapons || [],
      tools: prof.tools || [],
      skills: prof.skills,
    }
  }

  private static parseCastingTime(time: any): any[] {
    if (!time) return []
    if (Array.isArray(time)) return time
    return [time]
  }

  private static parseSpellRange(range: any): any {
    if (!range) return { type: 'special' }
    return range
  }

  private static parseSpellComponents(components: any): any {
    if (!components) return {}
    return components
  }

  private static parseSpellDuration(duration: any): any[] {
    if (!duration) return []
    if (Array.isArray(duration)) return duration
    return [duration]
  }

  private static parseSpellClasses(classes: any): any {
    if (!classes) return {}
    return classes
  }
}

export function filterBySource(items: any[], allowedSources: string[]): any[] {
  if (!allowedSources || allowedSources.length === 0) return items
  return items.filter(item => allowedSources.includes(item.source))
}

export function searchByName<T extends { name: string }>(
  items: T[],
  query: string
): T[] {
  if (!query || query.trim() === '') return items
  
  const lowerQuery = query.toLowerCase()
  return items.filter(item => 
    item.name.toLowerCase().includes(lowerQuery)
  )
}

export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}
