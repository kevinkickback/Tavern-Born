# Provenance System

The provenance layer tracks where character grants came from and supports clean reconciliation when source choices change.

## Why Provenance Exists

Without provenance, changing race/class/background can leave stale proficiencies, features, or spell grants behind. Provenance prevents this by tagging grants with source metadata.

## Core Files

- src/lib/provenance/types.ts
- src/lib/provenance/ledger.ts
- src/lib/provenance/reconciliation.ts
- src/lib/provenance/normalization.ts
- src/lib/provenance/sourceLabels.ts
- src/lib/provenance/summaries.ts
- src/lib/provenance/applyRaceGrants.ts
- src/lib/provenance/applyClassGrants.ts
- src/lib/provenance/applyBackgroundGrants.ts
- src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts
- src/lib/provenance/index.ts
- src/hooks/character/useProvenanceMutations.ts
- src/hooks/character/useProvenanceRows.ts
- src/hooks/character/useProvenance.ts

## Ledger Model

The character carries a provenance ledger with source-tagged grant maps for:
- proficiencies (armor, weapons, tools, languages, skills, saving throws)
- abilityBonuses (array of `{ability, value, sourceTag}` entries)
- features
- feats
- spells
- equipment
- choices

## Background Ability Score Choices (XPHB 2024)

XPHB 2024 backgrounds carry two alternative ability score blocks (field `ability[]`):
- Block 0 (`weights: [2, 1]`): pick 2 abilities; first selection gets +2, second gets +1.
- Block 1 (`weights: [1, 1, 1]`): pick 3 abilities; each gets +1.

Character fields:
- `backgroundAsiBlockIndex?: number` — which block the player chose (0 = +2/+1, 1 = +1/+1/+1).
- `backgroundAsiChoices?: string[]` — ordered selections; index `i` maps to `weights[i]`.

The mutation `applyBackgroundAbilityChoices(bg, blockIndex, choices)` in `useProvenanceMutations`:
1. Removes all existing background `abilityBonuses` entries from the ledger.
2. Writes new `abilityBonuses` entries via `addAbilityBonus` (one per choice/weight pair).
3. Persists `backgroundAsiBlockIndex` and `backgroundAsiChoices` on the character.

When a background is swapped, `reconcileBackgroundChange` → `removeGrantsBySource('background', ...)` clears all background ability bonuses and resets `backgroundAsiBlockIndex`/`backgroundAsiChoices`.

The UI for choosing ability blocks and slots lives in `src/pages/build/background/BackgroundPage.tsx`. The bonuses are included in `displayBonuses` on `AbilityScoresPage` via `buildBackgroundBonuses` from `src/lib/calculations/abilityScores.ts`.

## Grant Application Pattern

1. Resolve selected source entity (race/class/background/feat/etc).
2. Apply grants to character fields.
3. Register source tags in ledger for every applied grant.
4. Save via character store mutation APIs.

Mutation hooks should stay separate from row-derivation hooks: grant/reconciliation callbacks belong in the mutation layer, while UI-facing source rows and collapse-state helpers belong in the derived-view layer.

## Reconciliation Pattern

When source entity changes:
1. Remove prior grants associated with old source tags.
2. Clear stale source-linked choices.
3. Apply grants from new source.
4. Verify resulting character and ledger are aligned.

## Invariants

- Every non-user-manual grant should be traceable to a source tag.
- Reconciliation should be additive/subtractive by source, not by brittle string matching alone.
- UI summaries should read from ledger data rather than duplicate source logic.
- Spell grants may include optional class-level attribution metadata:
	- exact: selected from class-page level picker
	- inferred-lowest-eligible: selected from spells page and attributed to the lowest eligible class level with remaining gain capacity
- Inferred spell attribution is descriptive metadata, not a canonical source of spell ownership.

## Common Pitfalls

- Adding new grant paths without updating reconciliation.
- Applying grants directly to character without ledger tags.
- Forgetting tests for source replacement edge cases.

## Testing Guidance

Add or update tests in:
- tests/lib/provenance/ledger.test.ts
- tests/lib/provenance/reconciliation.test.ts

Recommended additions:
- Mixed grant replacement scenarios across race/class/background/feat combinations.
- Duplicate grant handling where multiple sources grant same proficiency.
