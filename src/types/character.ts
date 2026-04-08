import type { ProvenanceLedger } from '@/lib/provenance/types';

export type { ProvenanceLedger };

export type AbilityName =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export interface CharacterClassEntry {
  name: string;
  source?: string;
  levels: number;
  subclass?: string;
  subclassSource?: string;
}

export interface Character {
  id: string;
  version: string;
  name: string;
  race: string;
  raceSource?: string;
  subrace?: string;
  subraceSource?: string;
  /** Primary class name — always mirrors classProgression[0].name when classProgression is present */
  class: string;
  classSource?: string;
  subclass?: string;
  subclassSource?: string;
  background: string;
  backgroundSource?: string;
  currency?: Currency;
  /** Total character level — always mirrors sum of classProgression[*].levels when classProgression is present */
  level: number;
  experiencePoints: number;
  /** Authoritative multiclass progression. When present, class/level are derived from it. */
  classProgression?: CharacterClassEntry[];

  abilityScores: AbilityScores;

  proficiencies: Proficiencies;
  features: Feature[];
  feats: Feat[];
  spells: SpellSelection;
  equipment: Equipment[];

  hitPoints: HitPoints;
  armorClass: number;
  initiative: number;
  speed: number;

  savingThrows: SavingThrows;
  skills: Skills;

  details: CharacterDetails;
  portrait?: string;
  portraitTransform?: PortraitTransform;

  allowedSources?: string[];
  variantRules?: VariantRules;
  /** Per-block ability score increase choices for races with choosable bonuses (Tasha's variant). */
  raceAsiChoices?: string[][];

  /**
   * Which weighted-choice block from the background's ability array the player chose.
   * 0 = +2/+1 method (default), 1 = +1/+1/+1 method.
   */
  backgroundAsiBlockIndex?: number;

  /** Preferred background starting-equipment option key. */
  backgroundEquipmentChoice?: 'a' | 'b';

  /** Last currency grant applied from background starting equipment. */
  backgroundCurrencyGrant?: Currency;

  /**
   * Ordered ability selections for the chosen background ability block.
   * selections[i] receives weights[i] bonus from the selected block.
   */
  backgroundAsiChoices?: string[];

  /** Per-level ASI slot choices that were used for ability score increases (not feats). */
  asiChoices?: AsiChoice[];

  /** Feats selected via the "ignore selection limit" toggle — stored separately so they
   *  are never removed by normal feat-slot management (e.g. level-down, class change). */
  specialFeats?: Feat[];

  /** Provenance ledger tracking the origin of every granted option. */
  provenance?: ProvenanceLedger;

  createdAt: string;
  lastModified: string;
}

export interface PortraitTransform {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

export interface VariantRules {
  optionalClassFeatures?: boolean;
  averageHitPoints?: boolean;
  abilityScoreMethod?: 'point-buy' | 'standard-array' | 'custom';
}

export type AbilityScores = Record<AbilityName, number>;

export interface Proficiencies {
  armor: string[];
  weapons: string[];
  tools: string[];
  skills: string[];
  languages: string[];
  savingThrows: string[];
}

export interface Feature {
  id: string;
  name: string;
  source: string;
  description: string;
  level?: number;
}

export interface Feat {
  id: string;
  name: string;
  source: string;
  description: string;
  prerequisites?: string;
}

export interface AsiChoice {
  id: string;
  /** Class level at which this ASI is earned. */
  level: number;
  /** Class name this ASI belongs to (for multiclass support). */
  className: string;
  /** Ability key → bonus applied (e.g. { strength: 2 } or { strength: 1, dexterity: 1 }). */
  abilityChanges: Record<string, 1 | 2>;
}

export interface SpellSelection {
  spellProfiles: SpellProfile[];
  spellSlots: SpellSlots;
}

export type SpellProfileType = 'class' | 'special';

export interface SpellProfile {
  /** Stable profile key: class profiles use `class:<name>|<source>`, special uses `special:unrestricted`. */
  id: string;
  type: SpellProfileType;
  label: string;
  className?: string;
  classSource?: string;
  cantrips: string[];
  spellsKnown: string[];
  preparedSpells: string[];
  /** Special unrestricted profile is always prepared. */
  alwaysPrepared?: boolean;
}

export interface SpellSlots {
  level1: { max: number; used: number };
  level2: { max: number; used: number };
  level3: { max: number; used: number };
  level4: { max: number; used: number };
  level5: { max: number; used: number };
  level6: { max: number; used: number };
  level7: { max: number; used: number };
  level8: { max: number; used: number };
  level9: { max: number; used: number };
}

export interface Equipment {
  id: string;
  name: string;
  /** 5etools type code: 'LA', 'MA', 'HA', 'S', 'M', 'R', 'G', 'P', 'WO', etc. */
  type: string;
  quantity: number;
  equipped: boolean;
  attuned?: boolean;
  description?: string;
  weight?: number;
  value?: number;
  rarity?: string;
  source?: string;
  reqAttune?: boolean;
  /** Base armour class for worn armour items. */
  ac?: number;
  /** Resolved armour category (derived from type on import). */
  armorType?: 'light' | 'medium' | 'heavy' | 'shield';
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface HitPoints {
  max: number;
  current: number;
  temporary: number;
}

export interface SavingThrows {
  strength: { proficient: boolean; bonus: number };
  dexterity: { proficient: boolean; bonus: number };
  constitution: { proficient: boolean; bonus: number };
  intelligence: { proficient: boolean; bonus: number };
  wisdom: { proficient: boolean; bonus: number };
  charisma: { proficient: boolean; bonus: number };
}

export interface Skills {
  [key: string]: { proficient: boolean; expertise: boolean; bonus: number };
}

export interface CharacterDetails {
  gender?: string;
  alignment?: string;
  faith?: string;
  lifestyle?: string;
  personalityTraits?: string;
  personality?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  goals?: string;
  fears?: string;
  age?: number;
  height?: string;
  weight?: string;
  eyes?: string;
  skin?: string;
  hair?: string;
  distinguishingMarks?: string;
  physicalDescription?: string;
  appearance?: string;
  clothingStyle?: string;
  mannerisms?: string;
  faction?: string;
  rank?: string;
  factionNotes?: string;
  patron?: string;
  patronDetails?: string;
  nemesis?: string;
  allies?: Ally[];
  origin?: string;
  family?: string;
  definingMoment?: string;
  lifeEvents?: string;
  backstory?: string;
  alliesAndOrganizations?: string;
}

export interface Ally {
  id: string;
  name: string;
  relationship: string;
  description: string;
}
