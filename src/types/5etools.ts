export interface Race5e {
  name: string
  source: string
  page?: number
  size?: string[]
  speed?: number | { walk?: number }
  ability?: AbilityBonus[]
  entries?: any[]
  darkvision?: number
  languageProficiencies?: LanguageProficiency[]
  skillProficiencies?: SkillProficiency[]
  resist?: string[]
  immune?: string[]
  conditionImmune?: string[]
  subraces?: Race5e[]
  [key: string]: any
}

export interface Class5e {
  name: string
  source: string
  page?: number
  hd?: { faces: number; number?: number }
  proficiency?: string[]
  startingProficiencies?: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    skills?: { choose?: { from: string[]; count: number } }
  }
  startingEquipment?: any
  classTableGroups?: any[]
  classFeatures?: string[] | ClassFeature[]
  spellcastingAbility?: string
  casterProgression?: string
  preparedSpells?: string
  [key: string]: any
}

export interface ClassFeature {
  name: string
  source: string
  page?: number
  level?: number
  entries?: any[]
  className?: string
  classSource?: string
  [key: string]: any
}

export interface Background5e {
  name: string
  source: string
  page?: number
  skillProficiencies?: SkillProficiency[]
  languageProficiencies?: LanguageProficiency[]
  toolProficiencies?: ToolProficiency[]
  startingEquipment?: any[]
  entries?: any[]
  [key: string]: any
}

export interface Spell5e {
  name: string
  source: string
  page?: number
  level: number
  school: string
  time: CastingTime[]
  range: SpellRange
  components?: SpellComponents
  duration: SpellDuration[]
  entries?: any[]
  entriesHigherLevel?: any[]
  classes?: {
    fromClassList?: ClassReference[]
    fromSubclass?: SubclassReference[]
  }
  [key: string]: any
}

export interface Feat5e {
  name: string
  source: string
  page?: number
  prerequisite?: string[]
  ability?: AbilityBonus[]
  entries?: any[]
  [key: string]: any
}

export interface Item5e {
  name: string
  source: string
  page?: number
  type: string
  tier?: string
  rarity?: string
  weight?: number
  value?: number
  entries?: any[]
  weaponCategory?: string
  dmg1?: string
  dmg2?: string
  dmgType?: string
  property?: string[]
  range?: string
  ac?: number
  strength?: string
  stealth?: boolean
  [key: string]: any
}

export type AbilityBonus = {
  [ability: string]: number
} & {
  choose?: {
    from: string[]
    count: number
    amount?: number
  }
}

export type LanguageProficiency = {
  [lang: string]: boolean
} & {
  choose?: {
    from: string[]
    count: number
  }
  anyStandard?: number
}

export type SkillProficiency = {
  [skill: string]: boolean
} & {
  choose?: {
    from: string[]
    count: number
  }
}

export type ToolProficiency = {
  [tool: string]: boolean
} & {
  choose?: {
    from: string[]
    count: number
  }
}

export interface CastingTime {
  number: number
  unit: string
  condition?: string
}

export interface SpellRange {
  type: string
  distance?: {
    type: string
    amount?: number
  }
}

export interface SpellComponents {
  v?: boolean
  s?: boolean
  m?: string | { text: string; cost?: number; consume?: boolean }
}

export interface SpellDuration {
  type: string
  duration?: {
    type: string
    amount?: number
  }
  concentration?: boolean
}

export interface ClassReference {
  name: string
  source: string
}

export interface SubclassReference {
  class: { name: string; source: string }
  subclass: { name: string; source: string }
}

export interface SourceBook {
  abbreviation: string
  name: string
  group: string
  published?: string
  year?: number
  hasCharacterOptions?: boolean
}

export interface DataSourceConfig {
  type: 'local' | 'remote'
  path: string
  isValid: boolean
  lastLoaded?: string
}

export interface GameData {
  races: Race5e[]
  classes: Class5e[]
  backgrounds: Background5e[]
  spells: Spell5e[]
  feats: Feat5e[]
  items: Item5e[]
  itemsBase: Item5e[]
  classFeatures: ClassFeature[]
  actions: any[]
  conditions: any[]
  deities: any[]
  skills: any[]
  senses: any[]
  languages: any[]
  magicvariants: any[]
  optionalfeatures: any[]
  variantrules: any[]
  sources: SourceBook[]
}
