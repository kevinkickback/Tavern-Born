# Feat Options System

Many feats require follow-up selections after the feat itself is chosen — spell picks (Magic Initiate), ability score targets (Ability Score Improvement variants), proficiency choices (Skill Expert), etc. Today the feat selection mechanic has no mechanism for any of this. This document specifies a design for feat-level option choices that integrates with the existing provenance/choice system.

---

## Problem

When a user selects Magic Initiate, the feat grants:
- 2 cantrips from a chosen spellcaster class list
- 1 1st-level spell from the same list

None of this is captured or applied today. The feat is written to `character.feats[]` and nothing else happens. Similar gaps exist for feats like:

| Feat | Required Sub-Selection |
|---|---|
| Magic Initiate | Spellcaster class list, 2 cantrips, 1 spell |
| Skill Expert | 1 skill (half-proficiency → proficiency) |
| Fighting Initiate | 1 Fighting Style |
| Linguist | 3 languages |
| Skilled | 3 skills or tools |
| Athlete / Moderately Armored | Ability score to increase |
| Fey Touched / Shadow Touched | 1 spell from illusion/enchantment/necromancy/transmutation |
| Spell Sniper | Spellcaster class for cantrip list |
| Ritual Caster | Spellcaster class for ritual list, initial spells |

---

## Goals

1. After selecting a feat with embedded choices, prompt the user through those choices in a follow-up modal step.
2. Persist the selections in a structured, provenance-aware way.
3. Apply granted spells, proficiencies, and features to character state just as class/race grants do today.
4. Support resolving choices later (if the user dismisses the follow-up, show the feat as "pending" on the Feats page).
5. Support re-opening choices for correction without wiping other state.

---

## Data Source Constraint

`data/` files are managed externally (5etools) and must never be modified. All option parsing reads the JSON as-is.

Critically, the structured data is already there. 5etools feats use dedicated top-level fields — not just human-readable `entries` text — to express choices:

| Field | Used by | What it encodes |
|---|---|---|
| `additionalSpells[]` | Magic Initiate, Fey Touched, Shadow Touched, Spell Sniper, Ritual Caster | Spell grants with `choose` filters (`level=`, `class=`, `school=`) |
| `ability[].choose` | Skill Expert, Athlete, Moderately Armored, Fey Touched | Which ability score(s) the +1 may target |
| `skillProficiencies[]` | Skill Expert | Skill choices (fixed list or `any`) |
| `skillToolLanguageProficiencies[]` | Skilled | Combined skill/tool choice with count |
| `languageProficiencies[]` | Linguist | Language choice with count |
| `optionalfeatureProgression[]` | Fighting Initiate | Feature type key (e.g. `FS:F`) to pull from `optionalfeatures` data |
| `expertise[]` | Skill Expert | Expertise grant (choose from proficient skills) |

This means the feat option parser can be data-driven — reading these structured fields — rather than a hand-written registry for each feat. Feats absent from all option fields require no follow-up.

---

## Non-Goals (first iteration)

- Parsing raw `entries` text to infer choices. Structured fields cover the cases we need.
- Conditional choices (e.g., "pick A or B, and if A then also pick C").
- Rules enforcement of choices made (spell level restrictions, school filters, etc.) beyond a best-effort pool filter.

---

## Data Model Changes

### 1. Extend `Character.Feat`

```ts
// src/types/character.ts

export interface FeatOptionSelections {
  /** Spellcaster class name chosen (e.g. "Wizard"), when the feat keys off a class list. */
  spellcastingClass?: string
  /** Spell names granted by the feat (stored as `name|source` composite keys). */
  spells?: string[]
  /** Proficiency keys granted by the feat (skills, tools, languages). */
  proficiencies?: string[]
  /** Ability score key targeted (e.g. "strength"), for feats with a single +1 to choose. */
  abilityScore?: string
  /** Arbitrary named sub-selection for feats that don't fit the above shapes. */
  extras?: Record<string, string | string[]>
}

export interface Feat {
  id: string
  name: string
  source: string
  description: string
  prerequisites?: string
  /** Follow-up selections made after this feat was chosen. */
  options?: FeatOptionSelections
}
```

### 2. Extend `ChoiceDomain`

Add `'featOptions'` to the union in `src/lib/provenance/types.ts`:

```ts
export type ChoiceDomain =
  | 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'
  | 'spells' | 'features' | 'feats' | 'abilityBonuses' | 'equipment'
  | 'featOptions'  // ← new
```

`featOptions` choices live in `provenance.choices[]` just like race/background choices. The `sourceTag` will carry `sourceType: 'feat'` and `sourceName` equal to the feat name.

### 3. Feat Option Parser (data-driven)

A new file `src/lib/5etools/parsers/featOptions.ts` derives option steps by reading the feat's existing structured fields — no manual registry needed for most feats.

```ts
export type FeatOptionStep =
  | { kind: 'spellcastingClass'; label: string; choices: AdditionalSpellEntry[] }
  | { kind: 'spells'; label: string; count: number; levelFilter: number[]; schoolFilter?: string[]; classKey: string }
  | { kind: 'proficiency'; label: string; domain: 'skills' | 'languages' | 'tools'; count: number; optionPool?: string[] }
  | { kind: 'abilityScore'; label: string; from: string[] }
  | { kind: 'optionalFeature'; label: string; featureType: string; count: number }
  | { kind: 'expertise'; label: string }

/** Derives option steps from the raw Feat5e object. Returns [] for feats with no choices. */
export function deriveFeatOptionSteps(feat: Feat5e): FeatOptionStep[] {
  const steps: FeatOptionStep[] = []

  // additionalSpells → spellcastingClass picker + per-class spell picks
  if (feat.additionalSpells?.length) {
    if (feat.additionalSpells.length > 1) {
      steps.push({ kind: 'spellcastingClass', label: 'Choose a spellcasting class', choices: feat.additionalSpells })
    }
    // spell picks are derived dynamically once class is selected (in modal step 2+)
  }

  // ability[].choose → ability score picker
  for (const block of feat.ability ?? []) {
    if (block.choose) {
      steps.push({ kind: 'abilityScore', label: 'Choose an ability score to increase', from: block.choose.from })
    }
  }

  // skillProficiencies / skillToolLanguageProficiencies / languageProficiencies → proficiency pickers
  // ... (map each to a proficiency step with appropriate domain + count)

  // optionalfeatureProgression → optional feature picker (Fighting Styles, etc.)
  for (const prog of feat.optionalfeatureProgression ?? []) {
    steps.push({ kind: 'optionalFeature', label: `Choose a ${prog.name}`, featureType: prog.featureType[0], count: 1 })
  }

  // expertise → expertise picker
  if (feat.expertise?.length) {
    steps.push({ kind: 'expertise', label: 'Choose a skill to gain Expertise in' })
  }

  return steps
}
```

Feats that produce an empty `steps` array are committed immediately (current behavior, unchanged).

A small fallback override map in the same file handles any edge cases where the structured fields are absent or ambiguous — this stays minimal and is not the primary path.

---

## UI Flow

### Selection Flow

```
FeatSelectionModal (existing)
        │
        │  user picks feat
        ▼
 hasFeatOptions(feat) ?
        │
   yes  │  no
        │  └─► commit feat directly (current path, unchanged)
        ▼
FeatOptionsModal (new)
  ├─ Step 1: render first FeatOptionStep
  ├─ Step 2+: sequential steps (wizard-style)
  └─ Finish → commit feat + options together
```

If the user dismisses `FeatOptionsModal`, the feat is written with `options: undefined` and a pending `featOptions` ChoiceRecord is appended to `provenance.choices`. The Feats page shows a "Complete Setup →" button alongside pending feats.

### FeatOptionsModal

`src/components/modals/FeatOptionsModal.tsx`

- Receives the selected feat and its `FeatOptionSchema`.
- Steps render appropriate sub-components:
  - `spellcastingClass` → existing class list `Select`
  - `spells` → reuse spell picker (filtered by class + level); or a lightweight inline list
  - `proficiency` → existing proficiency picker
  - `abilityScore` → ability selector (6-button)
  - `fightingStyle` → `Select` from fighting styles list
- "Back / Next / Finish" footer.
- On Finish: calls `commitFeatWithOptions(feat, selections)`.

---

## Provenance Integration

### New mutation: `commitFeatWithOptions`

In `src/hooks/character/useProvenanceMutations.ts`, add:

```ts
const commitFeatWithOptions = useCallback(
  (feat: { name: string; source?: string }, selections: FeatOptionSelections) => {
    // 1. Write feat to character.feats with options field populated.
    // 2. If selections.spells, write to character.spells.spellProfiles
    //    with sourceTag { sourceType: 'feat', sourceName: feat.name, grantType: 'choice' }.
    // 3. If selections.proficiencies, extend provenance.proficiencies
    //    for the relevant domain with the same sourceTag.
    // 4. If selections.abilityScore, append to provenance.abilityBonuses.
    // 5. Remove the pending featOptions ChoiceRecord (if one exists).
    // 6. updateCharacter(id, patch) — single atomic write.
  },
  [...]
)
```

Reconciliation on feat removal must also walk `provenance.spells`, `provenance.proficiencies`, and `provenance.abilityBonuses` to retract any entries whose `sourceTag.sourceType === 'feat'` and `sourceTag.sourceName` matches the removed feat. This mirrors how race/class grant retraction works today.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `src/types/character.ts` | Add `FeatOptionSelections`, extend `Feat.options` |
| `src/lib/provenance/types.ts` | Add `'featOptions'` to `ChoiceDomain` |
| `src/lib/5etools/featOptions.ts` | New — registry of feat option schemas |
| `src/components/modals/FeatOptionsModal.tsx` | New — wizard modal for follow-up selections |
| `src/components/modals/FeatSelectionModal.tsx` | Trigger `FeatOptionsModal` after selection when schema exists |
| `src/hooks/character/useProvenanceMutations.ts` | Add `commitFeatWithOptions`, extend feat removal to retract grants |
| `src/pages/feats/FeatsPage.tsx` | Show "Complete Setup →" affordance for pending feat options |
| `src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts` | Extend reconciliation to handle feat-sourced spell/proficiency grants |
| `docs/provenance.md` | Document `featOptions` domain and feat source type grants |

---

## Phased Rollout

### Phase 1 — Infrastructure + high-priority feats

- Data model changes (Feat.options, ChoiceDomain)
- `featOptions.ts` registry with the 10 most common feats (Magic Initiate, Skilled, Skill Expert, Fighting Initiate, Linguist, Fey Touched, Shadow Touched, Spell Sniper, Ritual Caster, Athlete)
- `FeatOptionsModal` with wizard flow
- `commitFeatWithOptions` mutation
- Spell and proficiency grant application + retraction on removal
- Pending feat indicator on Feats page

### Phase 2 — Coverage + parser

- Map remaining PHB/XPHB feats into the registry
- Attempt partial automation: scan feat `entries` for 5etools `{choose}` / `{optionalfeature}` objects and auto-derive steps where possible
- Extend prerequisite checking to surface unresolved feat options as warnings

---

## Open Questions

1. **Re-opening choices**: Should the user be able to re-select feat options after initial setup? If yes, changing spell selections must trigger spell-slot recalculation. Safest first pass: allow re-open but warn that dependent state (spell preparation) may need review.
2. **Origin feat options**: Racial and background feat grants may also carry option-requiring feats. The `resolveFeatChoiceSelection` path must also trigger `FeatOptionsModal` in that case.
3. **Versioned schemas**: If a feat behaves differently under 2014 vs. 2024 rules (originSystem), the registry must key by `featKey + originSystem` or carry a `system` discriminator.
