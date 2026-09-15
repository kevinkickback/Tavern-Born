import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { FeatOptionSelections } from '@/types/feat'

export type { FeatOptionSelections } from '@/types/feat'

export type OriginSystem = '2014' | '2024'

export type AbilityName =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma'

export interface CharacterClassEntry {
  name: string
  source?: string
  levels: number
  subclass?: string
  subclassSource?: string
}

export type HitPointGainMethod = 'average' | 'rolled' | 'manual'

/** The raw hit-die result chosen for a level after character level 1. */
export interface HitPointGain {
  className: string
  classSource?: string
  classLevel: number
  characterLevel: number
  hitDie: number
  dieResult: number
  method: HitPointGainMethod
}

type HitPointAdjustmentMode = 'flat' | 'per-level'
type AdjustmentSource = 'manual' | 'item' | 'feat' | 'other'
type HitPointAdjustmentSource = AdjustmentSource

/** A permanent additive change applied after class and Constitution HP. */
export interface HitPointAdjustment {
  id: string
  label: string
  amount: number
  mode: HitPointAdjustmentMode
  sourceType: HitPointAdjustmentSource
  sourceRef?: string
  createdAt: string
}

/** A lasting additive change applied after equipment and Dexterity AC. */
export interface ArmorClassAdjustment {
  id: string
  label: string
  amount: number
  sourceType: AdjustmentSource
  sourceRef?: string
  createdAt: string
}

export type MovementMode = 'walk' | 'climb' | 'swim' | 'fly' | 'burrow'

export interface CharacterMovement {
  speeds: Partial<Record<MovementMode, number>>
  hover?: boolean
  /** Numeric or boolean movement keys not yet understood by Tavern-Born. */
  other?: Record<string, number | boolean>
  unresolvedInheritedModes?: MovementMode[]
  source: {
    kind: 'race' | 'legacy' | 'manual'
    name: string
    source?: string
  }
}

export interface MovementAdjustment {
  id: string
  label: string
  mode: string
  amount: number
  sourceType: AdjustmentSource
  sourceRef?: string
  createdAt: string
}

type CharacterClassChoiceKind = 'class-feature' | 'feat' | 'item' | 'optional-feature'

export interface CharacterClassChoiceOption {
  entityType: 'classFeature' | 'feat' | 'item' | 'optionalFeature'
  name: string
  source?: string
  /** Class level at which this selection occupied an available choice slot. */
  slotLevel: number
}

export interface CharacterClassChoiceSelection {
  choiceId: string
  label: string
  kind: CharacterClassChoiceKind
  className: string
  classSource: string
  classLevel: number
  selected: CharacterClassChoiceOption[]
}

export interface Character {
  id: string
  version: string
  name: string
  originSystem: OriginSystem
  race: string
  raceSource?: string
  subrace?: string
  subraceSource?: string
  /** Primary class name — always mirrors classProgression[0].name when classProgression is present */
  class: string
  classSource?: string
  subclass?: string
  subclassSource?: string
  background: string
  backgroundSource?: string
  currency?: Currency
  /** Total character level — always mirrors sum of classProgression[*].levels when classProgression is present */
  level: number
  experiencePoints: number
  /** Authoritative multiclass progression. When present, class/level are derived from it. */
  classProgression?: CharacterClassEntry[]

  abilityScores: AbilityScores

  proficiencies: Proficiencies
  features: Feature[]
  feats: Feat[]
  spells: SpellSelection
  equipment: Equipment[]
  /** Vision types granted by race, class features, or magic items (e.g., darkvision, truesight). */
  visions?: Array<{ type: string; range?: number }>

  hitPoints: HitPoints
  /** Whether current HP has been deliberately initialized or edited. */
  hitPointsInitialized?: boolean
  /** Per-level hit-die results. Constitution is deliberately applied at calculation time. */
  hitPointGains?: HitPointGain[]
  /** Permanent flat or per-character-level changes to maximum HP. */
  hitPointAdjustments?: HitPointAdjustment[]
  /** Exact maximum HP override. When set, derived HP and adjustments do not change the maximum. */
  maxHitPointsOverride?: number
  /** Stored AC — retained for migration compatibility only; never read for display. Use `computeEffectiveCharacterArmorClass` instead. */
  armorClass?: number
  /** Optional manual override that takes precedence over calculated AC in UI reads. */
  armorClassOverride?: number
  /** Lasting bonuses or penalties applied to calculated AC. */
  armorClassAdjustments?: ArmorClassAdjustment[]
  initiative: number
  /** Legacy walking-speed mirror retained for import/export compatibility. */
  speed: number
  /** Canonical structured base movement, normally supplied by the selected race/species. */
  movement?: CharacterMovement
  /** Labeled additive changes applied to individual movement modes. */
  movementAdjustments?: MovementAdjustment[]
  /** Exact per-mode values applied after base movement and adjustments. */
  movementOverrides?: Record<string, number>
  /** Exact hover override applied after the base movement profile. */
  movementHoverOverride?: boolean

  /** Damage resistances granted by race or other sources. */
  damageResistances?: string[]

  /** Damage immunities granted by race or other sources. */
  damageImmunities?: string[]

  /** Condition immunities granted by race or other sources. */
  conditionImmunities?: string[]
  savingThrows: SavingThrows
  skills: Skills

  details: CharacterDetails
  portrait?: string
  portraitTransform?: PortraitTransform

  allowedSources?: string[]
  variantRules?: VariantRules
  /** Per-block ability score increase choices for races with choosable bonuses (Tasha's variant). */
  raceAsiChoices?: string[][]

  /** Selected ASI block for lineage races (0 = +2/+1, 1 = +1/+1/+1). */
  raceAsiBlockIndex?: 0 | 1

  /**
   * Which weighted-choice block from the background's ability array the player chose.
   * 0 = +2/+1 method (default), 1 = +1/+1/+1 method.
   */
  backgroundAsiBlockIndex?: number

  /** Preferred background starting-equipment option keys per block. */
  backgroundEquipmentChoices?: string[]
  /** Concrete item references selected for generic background equipment choices. */
  backgroundEquipmentItemChoices?: Record<string, string>

  /** Last currency grant applied from background starting equipment. */
  backgroundCurrencyGrant?: Currency

  /** Equipment option choices for each class, keyed by "className|source". Per-block choice keys array. */
  classEquipmentChoices?: Record<string, string[]>
  /** Concrete item references selected for generic class equipment choices, keyed by class. */
  classEquipmentItemChoices?: Record<string, Record<string, string>>
  /**
   * Ordered ability selections for the chosen background ability block.
   * selections[i] receives weights[i] bonus from the selected block.
   */
  backgroundAsiChoices?: string[]

  /** Per-level ASI slot choices that were used for ability score increases (not feats). */
  asiChoices?: AsiChoice[]

  /** Feats selected via the "ignore selection limit" toggle — stored separately so they
   *  are never removed by normal feat-slot management (e.g. level-down, class change). */
  specialFeats?: Feat[]

  /** Feat selections owned by a specific class progression grant. */
  classFeatChoices?: ClassFeatChoice[]

  /** Structured choices owned by a source-qualified class feature or progression. */
  classChoiceSelections?: CharacterClassChoiceSelection[]

  /** Follow-up selections for fixed provenance feat grants, keyed by name|source|variant. */
  fixedFeatOptions?: Record<string, FeatOptionSelections>

  /** Provenance ledger tracking the origin of every granted option. */
  provenance?: ProvenanceLedger

  // ── Session state ────────────────────────────────────────────────────────
  /** Whether the character currently has inspiration. */
  inspiration?: boolean
  /** Death save tally for the current unconscious episode. */
  deathSaves?: { successes: number; failures: number }
  /** Active conditions by name (e.g. "Poisoned", "Prone"). */
  conditions?: string[]
  /** Exhaustion level 0–6. */
  exhaustion?: number
  /** Hit dice expended (spent on short rests). Type and max are derived from class data. */
  hitDiceUsed?: number
  /** Whether the character can cast spells as rituals (derived from class, may be manually set). */
  ritualCasting?: boolean
  /** Current usage counts for class resources, keyed by stable ID. Label/max are derived. */
  classResources?: Record<string, number>

  createdAt: string
  lastModified: string
}

export interface PortraitTransform {
  zoom: number
  panX: number
  panY: number
  rotation: number
}

export interface VariantRules {
  optionalClassFeatures?: boolean
  averageHitPoints?: boolean
  abilityScoreMethod?: 'point-buy' | 'standard-array' | 'custom'
  bladesingerAnyRace?: boolean
  battleragerAnyRace?: boolean
  preferNewerPrintings?: boolean
  ignoreEquipRestrictions?: boolean
}

export type AbilityScores = Record<AbilityName, number>

interface Proficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  skills: string[]
  languages: string[]
  savingThrows: string[]
}

export interface Feature {
  id: string
  name: string
  source: string
  description: string
  level?: number
}

export interface Feat {
  id: string
  name: string
  source: string
  description: string
  prerequisites?: string
  /** Follow-up selections made after this feat was chosen. */
  options?: FeatOptionSelections
  /** Class ASI/feat slot that supplied this feat, when applicable. */
  className?: string
  classSource?: string
  classLevel?: number
}

export interface ClassFeatChoice {
  /** Stable owner identity derived from class printing and progression metadata. */
  id: string
  className: string
  classSource?: string
  progressionName: string
  categories: string[]
  feats: Feat[]
}

export interface AsiChoice {
  id: string
  /** Class level at which this ASI is earned. */
  level: number
  /** Class name this ASI belongs to (for multiclass support). */
  className: string
  classSource?: string
  /** Ability key → bonus applied (e.g. { strength: 2 } or { strength: 1, dexterity: 1 }). */
  abilityChanges: Record<string, 1 | 2>
}

interface SpellSelection {
  spellProfiles: SpellProfile[]
  spellSlots: SpellSlots
}

type SpellProfileType = 'class' | 'special' | 'racial'

export interface RaceSpellChoice {
  id: string
  count: number
  isCantrip: boolean
  filter?: { level: number; classes: string[] }
  pool?: string[]
  selected: string[]
}

export interface SpellProfile {
  /** Stable profile key: class profiles use `class:<name>|<source>`, special uses `special:unrestricted`, racial uses `racial:<name>|<source>`. */
  id: string
  type: SpellProfileType
  label: string
  className?: string
  classSource?: string
  raceName?: string
  raceSource?: string
  castingAbility?: string
  castingAbilityOptions?: string[]
  choices?: RaceSpellChoice[]
  fixedSpells?: string[]
  /** Per-spell always-prepared grants, such as subclass spell lists. */
  alwaysPreparedSpells?: string[]
  cantrips: string[]
  spellsKnown: string[]
  preparedSpells: string[]
  /** Special unrestricted profile is always prepared. */
  alwaysPrepared?: boolean
  /** Spell swaps by class level: each level allows at most one swap for known casters. */
  spellSwaps?: Record<number, { removed: string; added: string }>
}

type SpellSlots = Partial<Record<number, { max: number; used: number }>>

export interface Equipment {
  id: string
  name: string
  /** 5etools type code: 'LA', 'MA', 'HA', 'S', 'M', 'R', 'G', 'P', 'WO', etc. */
  type: string
  quantity: number
  equipped: boolean
  attuned?: boolean
  description?: string
  weight?: number
  value?: number
  rarity?: string
  source?: string
  reqAttune?: boolean
  /** Base armour class for worn armour items. */
  ac?: number
  /** Resolved armour category (derived from type on import). */
  armorType?: 'light' | 'medium' | 'heavy' | 'shield'
  /** Weapon category from 5etools (for example: simple/martial). */
  weaponCategory?: string
  /** Primary weapon damage dice expression (for example: 1d8). */
  dmg1?: string
  /** Alternate weapon damage dice expression (for example versatile damage). */
  dmg2?: string
  /** Weapon damage type key (for example: slashing). */
  dmgType?: string
  /** 5etools weapon property abbreviations (for example: F, T, RLD). */
  properties?: string[]
  /** Weapon range text. */
  range?: string
  /** True for wondrous items (rings, amulets, cloaks, belts, etc.) — used to show equip toggle. */
  wondrous?: boolean
  /** True for magical tattoo items — used to show equip toggle. */
  tattoo?: boolean
  /** Classes for which this item can serve as a spellcasting focus. */
  focus?: string[]
  /** True when a starting-equipment item reference could not be resolved from item data. */
  _unresolved?: boolean
}

export interface Currency {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface HitPoints {
  max: number
  current: number
  temporary: number
}

interface SavingThrows {
  strength: { proficient: boolean; bonus: number }
  dexterity: { proficient: boolean; bonus: number }
  constitution: { proficient: boolean; bonus: number }
  intelligence: { proficient: boolean; bonus: number }
  wisdom: { proficient: boolean; bonus: number }
  charisma: { proficient: boolean; bonus: number }
}

export interface Skills {
  [key: string]: { proficient: boolean; expertise: boolean; bonus: number }
}

interface CharacterDetails {
  playerName?: string
  gender?: string
  alignment?: string
  faith?: string
  lifestyle?: string
  personalityTraits?: string
  personality?: string
  ideals?: string
  bonds?: string
  flaws?: string
  goals?: string
  fears?: string
  age?: number
  height?: string
  weight?: string
  eyes?: string
  skin?: string
  hair?: string
  distinguishingMarks?: string
  physicalDescription?: string
  appearance?: string
  clothingStyle?: string
  mannerisms?: string
  faction?: string
  rank?: string
  factionNotes?: string
  patron?: string
  patronDetails?: string
  nemesis?: string
  allies?: Ally[]
  origin?: string
  family?: string
  definingMoment?: string
  lifeEvents?: string
  backstory?: string
  organizationSelectionKey?: string
  organizationCustomName?: string
  organizationCustomDescription?: string
  organizationCustomImage?: string
  organizationCustomGradient?: string
  alliesAndOrganizations?: string
}

interface Ally {
  id: string
  name: string
  relationship: string
  description: string
}
