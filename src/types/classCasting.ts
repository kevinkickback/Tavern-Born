/** Parsed catalog evidence, separate from optional adoption and saved character state. */
export interface ClassCastingSourceProof {
  version: 1
  kind: 'casting-declaration' | 'casting-parent'
  target: string
  certificate: string
  origin: string
  verified: boolean
}

/** Source-derived setup capacity; this does not authorize a level-up or rest replacement. */
export interface ClassPreparationRule {
  mode: 'daily' | 'spellbook' | 'level'
  ability: string
  capacity:
    | { kind: 'formula'; formula: string; minimum: number }
    | { kind: 'progression'; values: readonly number[] }
  /** Finite intent bounds over the supported levels and legal effective ability scores. */
  maximumByLevel: readonly number[]
}

export type ClassSpellOwner =
  | ['class', string, string]
  | ['subclass', string, string, string, string]
export type ManagedClassSpellDomain = 'class-cantrip' | 'class-known' | 'class-spellbook'
export type ManagedClassSpellSlot = [
  ClassSpellOwner,
  ManagedClassSpellDomain,
  string,
  number,
  number,
]
export type ClassSpellSelectionPolicy = 'default' | 'ignore-class-list'

/** Player intent; current source eligibility and materialization are derived independently. */
export interface ManagedClassSpellChoice {
  slot: ManagedClassSpellSlot
  target: { name: string; source: string }
  revision: number
  policy: ClassSpellSelectionPolicy
  /** Preparation requested for this learned spell, including while its rules are unavailable. */
  prepare?: true
}
