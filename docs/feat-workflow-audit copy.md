# Audit 2: Feats System

## Issue 1: `characterSnapshot` and `profileSpells` are not memoized

**Severity:** Critical correctness issue.

### What Is Happening
In `FeatsPage`, both `profileSpells` and `characterSnapshot` are reconstructed on every render without memoization:

```tsx
const profileSpells = character
  ? collectKnownSpells(ensureSpellProfiles(character))
  : { cantrips: [], spellsKnown: [], preparedSpells: [] }

const characterSnapshot: PrereqCharacterSnapshot = {
  level: character?.level ?? 0,
  // ...
  spells: { cantrips: profileSpells.cantrips, ... }
}
```

`characterSnapshot` is passed to every `FeatDetailCard`. Each card calls `checkAllPrerequisites` in a useMemo with `[featData, characterSnapshot]` as dependencies. Because `characterSnapshot` is a new object reference on every render, the card's memoization is invalidated on every render, fully negating the benefit of checking prerequisites once.

### Recommendation
Wrap both in useMemo to stabilize references:

```tsx
const profileSpells = useMemo(
  () =>
    character
      ? collectKnownSpells(ensureSpellProfiles(character))
      : { cantrips: [], spellsKnown: [], preparedSpells: [] },
  [character],
)

const characterSnapshot = useMemo<PrereqCharacterSnapshot>(
  () => ({
    level: character?.level ?? 0,
    class: character?.class ?? '',
    race: character?.race ?? '',
    abilityScores: character?.abilityScores ?? /* ... */,
    features: character?.features ?? [],
    spells: {
      cantrips: profileSpells.cantrips,
      spellsKnown: profileSpells.spellsKnown,
      preparedSpells: profileSpells.preparedSpells,
    },
  }),
  [character, profileSpells],
)
```

Place `profileSpells` before `characterSnapshot` in component body. No other logic changes.

## Issue 2: Duplicate and unused feat selection utilities

**Severity:** Medium.

### What Is Happening
`src/pages/feats/model/selection.ts` exports `buildFeatModalFeats` and `partitionSelectedFeats`, neither of which is imported by `FeatsPage.tsx`.

Additionally, `src/pages/build/class/model/pageUtils.ts` exports a different, generic version of `buildFeatModalFeats` that IS used by `ClassPage.tsx`. This creates two separate implementations of similar logic.

### Corrected Recommendation
The feats folder's `selection.ts` is both unused and duplicative. Two paths:

**Preferred:** Delete unused `src/pages/feats/model/selection.ts` and verify all callers use the generic version from `pageUtils.ts`.

**Alternative:** If `partitionSelectedFeats` has specific usage in the feats domain that isn't captured elsewhere, move both functions to `src/lib/calculations/featUtils.ts` as a general utility, and update ClassPage to also use it if applicable. Consolidate implementations.

For now: **Remove the unused `selection.ts` file** since `pageUtils` already provides the required functionality through `buildFeatModalFeats` with a more flexible signature.

## Issue 3: Badge logic in `FeatDetailCard` uses nested ternary with inline string formatting

**Severity:** Low-Medium.

### What Is Happening
The badge row renders overlapping conditional badges using a nested ternary, and couples string formatting to render logic via `.split(': ').slice(1).join(': ')` to strip the sourceType prefix from `grantedBy`.

### Recommendation
Compute badge display values before the return statement:

```tsx
const originLabel: string | null = isOrigin
  ? grantedBy
    ? `Origin: ${grantedBy.split(': ').slice(1).join(': ') || grantedBy}`
    : 'Origin Feat'
  : null

const grantLabel: string | null = !isOrigin && grantedBy ? grantedBy : null
```

Then render as flat conditionals:

```tsx
{isBonus && <Badge>Bonus</Badge>}
{originLabel && <Badge><Sparkle /> {originLabel}</Badge>}
{grantLabel && <Badge><Sparkle /> {grantLabel}</Badge>}
{!met && <Badge>Prereqs unmet</Badge>}
```

Rendered output is identical, but logic is clearer and easier to maintain.

## Issue 4: Multiple useMemo calls for feat category partitioning can be collapsed

**Severity:** Low.

### What Is Happening
The component has a chain of useMemo calls to split feat choices and grants:

1. `featChoices` → filters by domain
2. `originChoices` + `racialChoices` → split by source type
3. `resolvedOriginChoices`, `resolvedRacialChoices`, `pendingOriginChoices`, `pendingRacialChoices` → split by selection status

That's 6+ separate useMemo calls, each one-line filters, all depending on the same `ledger.choices` source.

### Recommendation
Collapse into a single useMemo returning a structured object:

```tsx
const {
  resolvedOriginChoices,
  resolvedRacialChoices,
  pendingOriginChoices,
  pendingRacialChoices,
} = useMemo(() => {
  const origin = ledger.choices.filter(
    (c) => c.domain === 'feats' && c.sourceTag.sourceType === 'background',
  )
  const racial = ledger.choices.filter(
    (c) =>
      c.domain === 'feats' &&
      (c.sourceTag.sourceType === 'race' || c.sourceTag.sourceType === 'subrace'),
  )
  return {
    resolvedOriginChoices: origin.filter((c) => c.selected.length > 0),
    resolvedRacialChoices: racial.filter((c) => c.selected.length > 0),
    pendingOriginChoices: origin.filter((c) => c.selected.length === 0),
    pendingRacialChoices: racial.filter((c) => c.selected.length === 0),
  }
}, [ledger.choices])
```

Remove the intermediate variables (`featChoices`, `originChoices`, `racialChoices`) and their individual useMemo declarations. Single dependency array, same output, clearer intent.

## Summary
All four findings are **accurate and recommend correcting**. Issue 1 is critical performance correctness. Issues 2–4 are code quality improvements.
