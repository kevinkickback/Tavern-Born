# Character Calculation Context

`CharacterCalculationContext` is the pure boundary for values that must agree across Builder pages,
the header, prerequisites, equipment, spellcasting, level changes, and PDF export. It is created by
`src/lib/calculations/characterCalculationContext.ts`; React callers use the thin
`useCharacterCalculationContext` adapter.

## Ability-score composition

Effective ability scores are composed in this order:

1. `character.abilityScores`: allocated/base scores and legacy materialized feat-option changes.
2. Ruleset-normalized origin bonuses: race/subrace for 2014 or background for 2024.
3. Persisted class ASI contributions from `character.asiChoices`.
4. Future typed lasting modifiers, once the effects system is introduced.
5. Future exact overrides, applied last when explicitly supported.

Each layer is added to a fresh score object. The persisted base scores are never mutated during
derivation. Origin entities resolve by `name|source`, with the raw lookup as a fallback when a
filtered lookup does not contain a character's saved selection.

Feat option commands currently continue to materialize their reversible ability changes in
`character.abilityScores`. Their provenance records make removal deterministic, but this is a
compatibility exception rather than the long-term model. Phase 4 should migrate these changes to
typed contributions after defining stacking, migration, and exact-override semantics.

## Field ownership

| State kind | Examples | Owner and read rule |
| --- | --- | --- |
| Raw player choices | `abilityScores`, origin ASI selections, class ASI selections | Persisted on `Character`; calculations read them through the context. |
| Source references | race, subrace, background, class progression and their sources | Persisted identities; resolved entities are derived in the context. |
| Derived compatibility mirrors | legacy `armorClass`, flat class/level fields | Kept for migration/import compatibility; never treated as canonical calculated output. |
| Mutable runtime state | current/temporary HP, used spell slots, class-resource uses, conditions | Persisted because play changes it; maxima and modifiers remain derived. |
| Lasting adjustments | HP and AC adjustment records | Persisted, labeled contributions applied after ordinary derivation. |
| Exact overrides | maximum HP and AC overrides | Persisted only when explicitly set; applied last and visibly distinguished from derived values. |
| Pure projections | effective scores/modifiers, maximum HP, AC, skills, saves, carrying capacity, spell DCs | Never persisted; recomputed from the context and domain calculators. |

## Consumer contract

Ordinary UI and export code must not read `character.abilityScores` directly. Score editing,
schema migration, the context itself, reversible legacy feat commands, and the explicitly
backward-compatible `calculateAC` adapter are the intentional exceptions. Canonical domain APIs
require effective scores to be passed explicitly. `tests/lib/effectiveAbilityScoreOwnership.test.ts`
protects the current consumer list, and cross-surface fixtures verify the same effective totals in
rules and both PDF mappings.

The context also groups resolved classes, race/subrace, background, rules metadata, and equipment
state. Later movement, effects, readiness, action, rest, and Play phases should extend this pure
projection instead of introducing page-specific rules engines.
