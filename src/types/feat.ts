export interface FeatOptionSelections {
  /** Spellcaster class name chosen (e.g. "Wizard"), when the feat keys off a class list. */
  spellcastingClass?: string
  /** Spell names granted by the feat (stored as `name|source` composite keys). */
  spells?: string[]
  /** Skill names granted by the feat. */
  skills?: string[]
  /** Language names granted by the feat. */
  languages?: string[]
  /** Tool names granted by the feat. */
  tools?: string[]
  /** Ability score key targeted (e.g. "str"), for feats with a single +1 to choose. */
  abilityScore?: string
  /** Optional feature name chosen (e.g. a Fighting Style name). */
  optionalFeature?: string
  /** Skill name chosen for expertise. */
  expertiseSkill?: string
}
