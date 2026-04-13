# Audit 1: Spells System

## Issue 1: `SpellsPage.tsx` contains tooltip infrastructure that should be extracted

**Severity:** High

### Background
`SpellsPage.tsx` currently contains tooltip component code plus route-specific tooltip helper logic (8 standalone functions, 5 interfaces, and `SpellNameTooltip`). The current tooltip primitive stack in `src/components/ui/tooltip.tsx` (Radix) is already correct and should remain unchanged.

### Corrected Recommendation
Extract tooltip code out of `SpellsPage.tsx`, but keep it **route-colocated** to match the repository architecture guidance for page-specific logic.

- Keep the UI primitive usage unchanged (`Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip`).
- Move `SpellNameTooltip` to a route-local file, for example:
  - `src/pages/spells/components/SpellNameTooltip.tsx`
- Move recursive tooltip helpers/interfaces (`parseRecursiveReference`, `normalizeKind`, `getPreviewHtml`, `getRecursiveTooltipData`, `getRecursiveHintPosition`, and related types) to a route-local utility file, for example:
  - `src/pages/spells/components/spellTooltipUtils.ts`
- Keep `getEntryWithHoverTitles` as a named export in `src/lib/renderer.ts` because it is a renderer-adjacent helper wrapping `renderEntry` output.
- Keep `recursiveLookup` assembly in `SpellsPage` for now (it is page orchestration logic and depends on hook/store data already read there).

### Notes on `lookups.ts`
Do not automatically move lowercase UI-specific key helpers into `src/lib/5etools/lookups.ts`. That module is currently canonical ingestion/index lookup logic. If you add a lowercased key helper there, keep it clearly scoped and justified; otherwise keep lowercased dual-key map helpers route-local.

### Net Result
`SpellsPage.tsx` loses significant inline complexity while preserving architecture boundaries.

## Issue 2: Cantrip rendering block is duplicated in `SpellProfileManager`

**Severity:** High

### What Is Happening
`SpellProfileManager.tsx` has two branches (`isTruePrepared` and non-`isTruePrepared`) that both render the same cantrip block with near-verbatim markup and behavior.

### Recommendation
Extract an internal subcomponent in the same file (no new file required), for example `CantripGroup`, and use it in both branches. This is a pure extraction with no behavior changes.

## Issue 3: `syntheticItem` is constructed inside render loops

**Severity:** Medium

### What Is Happening
In the true-prepared branch of `SpellProfileManager`, `SpellListItem` objects are constructed inline inside `.map()` during render.

### Recommendation
Precompute this upstream in `SpellsPage` and pass a prepared structure to `SpellProfileManager`, for example:

- Replace `preparedCasterSpellsByProfile: Map<string, Spell5e[]>`
- With `preparedCasterItemsByProfile: Map<string, { spell: Spell5e; item: SpellListItem }[]>`

Then render by destructuring `{ spell, item }` with no per-row object creation in JSX.

## Issue 4: `selectionSourceByProfileAndSpell` is domain logic in page code

**Severity:** Medium

### What Is Happening
`SpellsPage` contains a memo that reads provenance tags and formats attribution labels (for example `Wizard Lv. 3 Choice`, `User Choice`).

### Recommendation
Move this attribution mapping into `src/lib/calculations/spellProfiles.attribution.ts` as a pure exported function, for example `buildSpellSelectionSourceMap(spellProfiles, ledger)`, and call it from `SpellsPage`.

This aligns with existing attribution helpers already in that module (`buildClassSpellSelectionsByLevel`, `inferClassSpellAttributionLevels`, `isSpellOnClassList`).

## Issue 5: `SpellProfileManager` owns modal rendering it should not own

**Severity:** Medium

### What Is Happening
`SpellProfileManager` currently accepts several props to control and render `SpellSelectionModal` directly, while modal state is already page-owned in `SpellsPage`.

### Recommendation
Move modal rendering to `SpellsPage` and simplify `SpellProfileManager` to callback-based coordination.

- Remove modal control props from `SpellProfileManagerProps`:
  - `racialChoiceModalOpen`
  - `onRacialChoiceModalOpenChange`
  - `racialChoiceModalConfig`
  - `onConfirmRacialChoice`
- Keep a single callback such as:
  - `onOpenRacialChoice(profileId: string, choiceId: string)`
- Render `SpellSelectionModal` in `SpellsPage` using the existing page state (`racialChoiceModalOpen`, `racialChoiceModalConfig`, `handleConfirmRacialChoice`).

## Issue 6: `useSpellSlots` legacy wrappers

**Severity:** Low

### What Is Happening
`addCantrip`, `removeCantrip`, `addSpellKnown`, and `removeSpellKnown` are thin wrappers around profile-specific methods and are not used by the current `SpellsPage` flow.

### Corrected Recommendation
Treat removal as migration work, not immediate cleanup.

- First confirm all runtime and test call sites.
- These wrappers are currently used by tests (`tests/hooks/useSpellSlots.test.tsx`), so immediate removal will break coverage.
- Preferred path:
  1. Add deprecation JSDoc to wrappers.
  2. Migrate call sites (including tests) to `addSpellToProfile` / `removeSpellFromProfile`.
  3. Remove wrappers only after callers are fully migrated.

## Summary
The original audit findings are directionally correct. The key corrections are:

1. Keep spell tooltip extraction route-colocated rather than introducing a new global `src/components/spells` domain.
2. Treat hook wrapper removal as a staged migration because there are active test callers.
