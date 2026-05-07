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
- src/lib/provenance/resolveRaceAsiChoices.ts — pure function that syncs `raceAsiChoices` into ledger `ChoiceRecord.selected` arrays; called by `useProvenanceLedger`/`useProvenance` before deriving rows, and by `applyRaceAsiChoices` when persisting choices
- src/lib/provenance/applyRaceGrants.ts
- src/lib/provenance/applyClassGrants.ts
- src/lib/provenance/applyBackgroundGrants.ts
- src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts
- src/lib/provenance/applyAsiChoices.ts — pure function for rebuilding ASI ability-bonus provenance from `asiChoices`; called by the character store on patches that contain `asiChoices`
- src/lib/provenance/applyProficiencyBlocks.ts — pure function for applying 5etools proficiency grant blocks to the ledger
- src/lib/provenance/index.ts
- src/hooks/character/useProvenanceRows.ts

## Hook Entry Points

**For production pages:** use the self-contained `use*ProvenanceMutations` hooks directly — `useRaceProvenanceMutations`, `useClassProvenanceMutations`, `useBackgroundProvenanceMutations`, `useSpellProvenanceMutations`, `useFeatProvenanceMutations`, `useEquipmentProvenanceMutations`. Each reads character/store state itself and owns the full mutation logic for its domain.

**For reading provenance rows:** use `useProvenanceLedger` (src/hooks/character/useProvenanceLedger.ts) in pages that only need to display provenance state. It normalizes the ledger via `resolveRaceAsiChoicesInLedger` before deriving rows, so all row functions receive a fully-resolved ledger.

**For tests:** `useProvenance` (src/hooks/character/useProvenance.ts) is the integration test harness. It composes all six domains via `useProvenanceMutations` (src/hooks/character/useProvenanceMutations.ts, the aggregator) and exposes mutations + provenance rows from a single hook. Use it in tests that need cross-domain provenance interactions. Do not call it from production pages.

**Adding new mutations:** add the callback directly to the relevant `use*ProvenanceMutations` hook (e.g. `useRaceProvenanceMutations.ts`). It will automatically be available through the test harness aggregator as well. Do not add logic to the aggregator.

Class-selection orchestration is delegated to `src/lib/character/commands/classSelectionOrchestrationCommand.ts` — the hook layer calls this command and applies the resulting patch via `updateCharacter`.

## Ledger Model

The character carries a provenance ledger with source-tagged grant maps for:
- proficiencies (armor, weapons, tools, languages, skills, saving throws)
- abilityBonuses (array of `{ability, value, sourceTag}` entries)
- features
- feats
- spells — stored as `Record<string, SpellSourceTag[]>`; use `addSpellGrant` (not the generic `addGrant`) to preserve spell-specific attribution fields
- equipment
- choices

**`SpellSourceTag`** extends `SourceTag` with optional `spellGrantedAtLevel` and `spellAttributionMode` fields. These fields are only meaningful in the `spells` domain and must not appear on general-purpose `SourceTag` values. Always construct spell tags as `SpellSourceTag` and use `addSpellGrant`.

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
2. For race/background origin entities, normalize the selected data against `character.originSystem` before applying grants.
3. Apply grants to character fields.
4. Register source tags in ledger for every applied grant.
5. Save via character store mutation APIs.

Origin-system normalization behavior:
- `2014`: race/subrace retains origin ASI, background origin ASI and background origin feat are stripped.
- `2024`: background retains origin ASI and exactly one origin feat, race/subrace origin ASI and starting feat are stripped.
- Missing canonical origin data is synthesized only at normalization time (for example: fallback 2014 race ASI choice, fallback 2024 background ASI/feat choice).

Mutation hooks should stay separate from row-derivation hooks: grant/reconciliation callbacks belong in the mutation layer, while UI-facing source rows and collapse-state helpers belong in the derived-view layer.

## Reconciliation Pattern

When source entity changes:
1. Remove prior grants associated with old source tags.
2. Clear stale source-linked choices.
3. Apply grants from new source.
4. Verify resulting character and ledger are aligned.

Background equipment and currency behavior:
- `applyBackgroundSelection(bg, preferredOption)` applies background starting equipment using the selected option key (`a` or `b`).
- Items are tracked in provenance `equipment` as before.
- Currency granted by background equipment entries is persisted on `character.currency` and tracked via `character.backgroundCurrencyGrant` for safe subtraction during reconciliation.

Class equipment choice behavior:
- `applyClassSelection(cls, subclass)` now resolves starting equipment using the player's persisted class choice (`character.classEquipmentChoices["class|source"]`) and defaults to `A` when unset.
- `applyClassEquipmentChoice(cls, choice)` updates both the inventory items and provenance equipment grants for the selected class source.
- Class equipment provenance is replaced per class source to avoid stale grants when switching between `A` and `B` equipment packages.

Race trait application behavior:
- `applyRaceSelection(race, subrace)` and `applySubraceChange(race, subrace)` apply and reconcile `darkvision`, `resist`, `immune`, and `conditionImmune`.
- Applied race traits are persisted on the character as `visions`, `damageResistances`, `damageImmunities`, and `conditionImmunities`.
- Subrace values are merged with race values, and subrace darkvision overrides base race darkvision when present.

Lineage race ASI behavior:
- Some lineage races (for example VRGR-style entries) omit an explicit `ability` block in 5etools data.
- In this case, the app synthesizes one of two Tasha-style ASI blocks based on `character.raceAsiBlockIndex`:
	- `0`: +2 to one ability and +1 to a different ability
	- `1`: +1 to three different abilities
- Changing the lineage ASI mode clears `raceAsiChoices` and reapplies race provenance so pending ability-bonus placeholders stay in sync.

Grouped tool choices:
- Placeholder choices may carry grouped tool options (for example: `gaming set`, `musical instrument`, `artisan's tools`, `tool`).
- Grouped entries are placeholders only; final grants are always concrete tool names selected by the user.
- Resolving grouped tool choices updates both `ledger.choices` and `character.proficiencies.tools`; removing a choice-granted concrete tool reopens the underlying placeholder capacity.

## Race ASI Choices and ChoiceRecord.selected

When a lineage race is selected, `applyRaceGrants` creates `ChoiceRecord` entries with `selected: []` for each ASI slot. The user's ability selections are persisted via `applyRaceAsiChoices` in `useRaceProvenanceMutations`, which:
1. Calls `resolveRaceAsiChoicesInLedger` to populate `ChoiceRecord.selected` in the ledger.
2. Writes both `provenance` and `raceAsiChoices` to the character in a single `updateCharacter` call.

For existing characters where `ChoiceRecord.selected` may be empty (e.g. created before this pattern was established), `useProvenanceLedger` and `useProvenance` apply `resolveRaceAsiChoicesInLedger` at read time using `character.raceAsiChoices` as a fallback. This ensures `getAbilityBonusRows` always receives a fully-resolved ledger without needing external parameters.

## Invariants

- Every non-user-manual grant should be traceable to a source tag.
- Reconciliation should be additive/subtractive by source, not by brittle string matching alone.
- UI summaries should read from ledger data rather than duplicate source logic.
- `getAbilityBonusRows(ledger)` takes only the ledger — no external `raceAsiChoices` or `backgroundAsiChoices` params. The ledger must be normalized via `resolveRaceAsiChoicesInLedger` before calling it.
- Spell grants may include optional class-level attribution metadata:
	- exact: selected from class-page level picker
	- inferred-lowest-eligible: selected from spells page and attributed to the lowest eligible class level with remaining gain capacity
- Inferred spell attribution is descriptive metadata, not a canonical source of spell ownership.

## Common Pitfalls

- Adding new grant paths without updating reconciliation.
- Applying grants directly to character without ledger tags.
- Forgetting tests for source replacement edge cases.
- **Calling `patch(ledger)` inside a loop loses intermediate writes.** Each call overwrites the previous one because `ledger` is captured from the React closure and never updated mid-render. When granting multiple items of the same domain (e.g. multiple spells, multiple equipment items) in one user action, **accumulate through the ledger** and call `patch` once:
  ```ts
  // ✅ batch — each grant sees the previous one's result
  let accumulated = ledger
  for (const spell of spells) {
    accumulated = applyClassSpellGrant(accumulated, className, classSource, spell.name, 'choice')
  }
  patch(accumulated)

  // ❌ loop with stale closure — only the last write survives
  for (const spell of spells) {
    const next = applyClassSpellGrant(ledger, className, classSource, spell.name, 'choice')
    patch(next)
  }
  ```
  Use the `applyBatch*` helpers in the relevant `use*Provenance` implementation hook when available.

## Testing Guidance

Add or update tests in:
- tests/lib/provenance/ledger.test.ts
- tests/lib/provenance/reconciliation.test.ts

Recommended additions:
- Mixed grant replacement scenarios across race/class/background/feat combinations.
- Duplicate grant handling where multiple sources grant same proficiency.
