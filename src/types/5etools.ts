export interface Race5e {
  name: string
  source: string
  page?: number
  fluffEntries?: unknown[]
  lineage?: string | boolean
  size?: string[]
  speed?:
    | number
    | {
        walk?: number
        fly?: number | boolean
        swim?: number | boolean
        climb?: number | boolean
        burrow?: number | boolean
      }
  ability?: AbilityBonus[]
  entries?: unknown[]
  darkvision?: number
  languageProficiencies?: LanguageProficiency[]
  skillProficiencies?: SkillProficiency[]
  toolProficiencies?: ToolProficiency[]
  weaponProficiencies?: Record<string, unknown>[]
  armorProficiencies?: Record<string, unknown>[]
  feats?: unknown[]
  additionalSpells?: RaceAdditionalSpells[]
  resist?: string[]
  immune?: string[]
  conditionImmune?: string[]
  traitTags?: string[]
  subraces?: Race5e[]
  [key: string]: unknown
}

export interface MulticlassRequirements {
  or?: Array<Record<string, number>>
  [ability: string]: number | Array<Record<string, number>> | undefined
}

export interface Class5e {
  name: string
  source: string
  page?: number
  /** Primary ability scores for the class (XPHB format). Each array item is an
   *  alternative group (OR); within a group all listed abilities are required (AND).
   *  Used to derive multiclassing prerequisites when requirements are absent. */
  primaryAbility?: Array<Record<string, boolean>>
  fluffEntries?: unknown[]
  classFluffSections?: ClassFluffSection[]
  classFluffImages?: ClassFluffImage[]
  hd?: { faces: number; number?: number }
  multiclassing?: {
    requirements?: MulticlassRequirements
    proficienciesGained?: {
      armor?: string[]
      weapons?: string[]
      tools?: string[]
      toolProficiencies?: Array<
        Record<string, boolean | number | { choose?: { from?: string[]; count?: number } }>
      >
      skills?: Array<string | Record<string, unknown>>
    }
  }
  proficiency?: string[]
  startingProficiencies?: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    skills?: Array<string | Record<string, unknown>>
  }
  startingEquipment?: unknown
  classTableGroups?: unknown[]
  classFeatures?: string[] | ClassFeature[]
  classFeatureRefs?: ClassFeatureReference[]
  subclasses?: Subclass5e[]
  isSidekick?: boolean
  spellcastingAbility?: string
  casterProgression?: string
  isSpellcaster?: boolean
  spellSlotProgression?: number[][]
  preparedSpells?: string
  preparedSpellsProgression?: number[]
  preparedSpellsChange?: string
  optionalfeatureProgression?: OptFeatureProg[]
  [key: string]: unknown
}

export interface ClassFeature {
  name: string
  source: string
  page?: number
  level?: number
  entries?: unknown[]
  className?: string
  classSource?: string
  [key: string]: unknown
}

export interface ClassFluffSection {
  name: string
  entries: unknown[]
}

export interface ClassFluffImage {
  type: 'image'
  href?: {
    url?: string
    path?: string
  }
  title?: string
}

export interface ClassFluff {
  name: string
  source: string
  summary: string
  sections: ClassFluffSection[]
  images?: ClassFluffImage[]
}

export interface ClassFeatureReference {
  ref: string
  name: string
  source?: string
  className: string
  classSource?: string
  level?: number
  gainSubclassFeature?: boolean
  feature?: ClassFeature
}

export interface Subclass5e {
  name: string
  shortName: string
  source: string
  className: string
  classSource?: string
  entries?: unknown[]
  subclassFeatures?: string[] | SubclassFeature[]
  subclassFeatureRefs?: SubclassFeatureReference[]
  levelFeatures?: Array<{ level: number; features: SubclassFeature[] }>
  spellcastingAbility?: string
  casterProgression?: string
  cantripProgression?: number[]
  spellsKnownProgression?: number[]
  additionalSpells?: SubclassAdditionalSpells[]
  [key: string]: unknown
}

export interface RaceAdditionalSpells {
  name?: string
  innate?: Record<string, Record<string, Record<string, string[]>>>
  known?: Record<string, string[] | { _: Array<string | { choose: string }> }>
  ability?: string | { choose: string[] }
}

export interface SubclassAdditionalSpells {
  prepared?: Record<string, string[]>
  expanded?: Record<string, string[]>
  innate?: Record<string, unknown>
  known?: Record<string, string[]>
  ability?: string | { choose: string[] }
  name?: string
}

export interface SubclassFeature {
  name: string
  source: string
  page?: number
  level?: number
  entries?: unknown[]
  className?: string
  classSource?: string
  subclassShortName?: string
  subclassSource?: string
  [key: string]: unknown
}

export interface SubclassFeatureReference {
  ref: string
  name: string
  source?: string
  className: string
  classSource?: string
  subclassShortName: string
  subclassSource?: string
  level?: number
  feature?: SubclassFeature
}

export interface OptFeatureProg {
  name: string
  featureType: string[]
  progression: number[] | Record<string, number>
}

export interface OptionalFeatureLike {
  name: string
  source?: string
  featureType?: string | string[]
  entries?: unknown[]
}

export interface GameDataLookups {
  classesByKey: Record<string, Class5e>
  classFeaturesByKey: Record<string, ClassFeature>
  spellsByKey: Record<string, Spell5e>
  optionalFeaturesByKey: Record<string, unknown>
  subclassesByKey: Record<string, Subclass5e>
  itemLookup: Map<string, Item5e>
}

export interface Background5e {
  name: string
  source: string
  page?: number
  /** Present on 2024 (XPHB/one-D&D) backgrounds; value is 'one'. */
  edition?: string
  ability?: unknown[]
  skillProficiencies?: SkillProficiency[]
  languageProficiencies?: LanguageProficiency[]
  toolProficiencies?: ToolProficiency[]
  startingEquipment?: unknown[]
  entries?: unknown[]
  [key: string]: unknown
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
  entries?: unknown[]
  entriesHigherLevel?: unknown[]
  classes?: {
    fromClassList?: ClassReference[]
    fromSubclass?: SubclassReference[]
  }
  [key: string]: unknown
}

export interface Feat5e {
  name: string
  source: string
  page?: number
  category?: string
  prerequisite?: Raw5ePrereq[]
  ability?: AbilityBonus[]
  entries?: unknown[]
  [key: string]: unknown
}

export type Raw5eAbilityPrereq = string | { ability: string; score?: number }
export type Raw5eRacePrereq = string | { name: string }
export type Raw5eClassPrereq = string | { name: string }

export interface Raw5ePrereq {
  level?: number | { level: number }
  ability?: Raw5eAbilityPrereq[]
  race?: Raw5eRacePrereq[]
  class?: Raw5eClassPrereq[]
  spellcasting?: boolean
  spell?: string | string[]
  pact?: string
  patron?: string
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
  entries?: unknown[]
  weaponCategory?: string
  firearm?: boolean
  dmg1?: string
  dmg2?: string
  dmgType?: string
  property?: string[]
  range?: string
  ac?: number
  strength?: string
  stealth?: boolean
  /** True for wondrous items (rings, amulets, cloaks, belts, etc.). */
  wondrous?: boolean
  /** True for magical tattoo items. */
  tattoo?: boolean
  /** Classes for which this item can serve as a spellcasting focus. */
  focus?: string[]
  /** Whether the item requires attunement; may be a class restriction string. */
  reqAttune?: boolean | string
  [key: string]: unknown
}

export type AbilityBonus = {
  choose?: {
    from: string[]
    count: number
    amount?: number
  }
  [ability: string]: number | { from: string[]; count: number; amount?: number } | undefined
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

export interface Language5e {
  name: string
  source?: string
  type?: string
  entries?: unknown[]
  [key: string]: unknown
}

export interface Organization5e {
  name: string
  source: string
  description: string
  imagePath?: string
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
  organizations: Organization5e[]
  spells: Spell5e[]
  feats: Feat5e[]
  items: Item5e[]
  itemsBase: Item5e[]
  classFeatures: ClassFeature[]
  actions: unknown[]
  conditions: unknown[]
  deities: unknown[]
  skills: unknown[]
  senses: unknown[]
  languages: Language5e[]
  magicvariants: unknown[]
  optionalfeatures: unknown[]
  variantrules: unknown[]
  trapHazards: unknown[]
  rewards: unknown[]
  cultsBoons: unknown[]
  sources: SourceBook[]
  lookups?: GameDataLookups
}
