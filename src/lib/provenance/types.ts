export type SourceType =
  | 'race'
  | 'subrace'
  | 'class'
  | 'subclass'
  | 'background'
  | 'feat'
  | 'optionalFeature'
  | 'manual';

export type GrantType = 'fixed' | 'choice' | 'placeholder';

export type SpellAttributionMode = 'exact' | 'inferred-lowest-eligible';

export type ChoiceStatus = 'pending' | 'resolved' | 'partially-resolved';

export type ChoiceDomain =
  | 'skills'
  | 'languages'
  | 'tools'
  | 'armor'
  | 'weapons'
  | 'spells'
  | 'features'
  | 'feats'
  | 'abilityBonuses'
  | 'equipment';

/** Attribution metadata attached to a single granted item. */
export interface SourceTag {
  sourceType: SourceType;
  sourceName: string;
  /** Optional source code (e.g. 'PHB', 'XPHB') for cross-referencing. */
  sourceRef?: string;
  grantType: GrantType;
  /**
   * Optional class level at which a spell is attributed as gained.
   * Present for spell grants tracked with class-level context.
   */
  spellGrantedAtLevel?: number;
  /**
   * How the spell level attribution was determined.
   * - exact: chosen from the class page level picker
   * - inferred-lowest-eligible: inferred from spells page choices
   */
  spellAttributionMode?: SpellAttributionMode;
  /**
   * User-visible label. Always 'User Choice' for manual toggling or user-driven
   * picks; otherwise the entity name (race, class, background, etc.).
   */
  label: string;
}

/** A single ability score bonus attributed to a source. */
export interface AbilityBonusProvenanceRecord {
  ability: string;
  value: number;
  sourceTag: SourceTag;
}

/** A pending or resolved choice originating from a source. */
export interface ChoiceRecord {
  id: string;
  domain: ChoiceDomain;
  sourceTag: SourceTag;
  chooseCount: number;
  /** Bonus amount per selected ability (only relevant for abilityBonuses domain). */
  amount?: number;
  /** All valid options the user may pick from. Empty means open-ended. */
  optionPool: string[];
  /** Names the user has selected so far. */
  selected: string[];
  status: ChoiceStatus;
}

export interface ProficiencyProvenance {
  armor: Record<string, SourceTag[]>;
  weapons: Record<string, SourceTag[]>;
  tools: Record<string, SourceTag[]>;
  languages: Record<string, SourceTag[]>;
  skills: Record<string, SourceTag[]>;
  savingThrows: Record<string, SourceTag[]>;
}

/** The full provenance ledger added to each character. */
export interface ProvenanceLedger {
  proficiencies: ProficiencyProvenance;
  abilityBonuses: AbilityBonusProvenanceRecord[];
  features: Record<string, SourceTag[]>;
  feats: Record<string, SourceTag[]>;
  spells: Record<string, SourceTag[]>;
  equipment: Record<string, SourceTag[]>;
  choices: ChoiceRecord[];
}

/** A single row for the Sources UI accordion. */
export interface SourceRow {
  /** Display name of the item (e.g. 'Insight', 'Draconic Bloodline'). */
  itemName: string;
  /** Domain/category label (e.g. 'Weapons', 'Skills', 'Spells'). */
  category: string;
  /** Full formatted attribution string shown to the user. */
  attribution: string;
  /** Source types represented by this row (used for cross-page filtering). */
  sourceTypes: SourceType[];
  /** True when this row is an unresolved or partially-resolved choice placeholder. */
  isPending: boolean;
}
