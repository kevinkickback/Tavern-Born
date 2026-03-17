# Migration Status: fizbanes-forge → Tavern-Born

A comprehensive comparison of the original vanilla JS Electron app (**fizbanes-forge**) and its React + TypeScript rewrite (**Tavern-Born**), covering what's done, what's missing, what's partially done, and recommendations on how to port logic correctly.

---

## Architecture Comparison

| Concern | fizbanes-forge | Tavern-Born |
|---------|---------------|-------------|
| Framework | Vanilla JS + Bootstrap 5 | React 19 + Radix UI + Tailwind CSS 4 |
| State | Mutable `Character` class + `AppState` + `EventBus` | Zustand stores + React hooks |
| Routing | Manual `NavigationController` + `PageHandler` | React Router DOM |
| Persistence | IPC → filesystem (`.ffp` JSON files) | IndexedDB via Zustand (`idb-keyval`) |
| Data loading | `DataLoader.js` → IPC → main process file reads | `FiveEToolsDataLoader` → fetch (remote) or IPC (local) |
| Validation | `ValidationSchemas.js` + `Zod`-like manual schemas | Zod schemas (wizard only) |
| Type safety | None (plain JS) | Full TypeScript |
| Component cleanup | `DOMCleanup.js` manual listener tracking | React lifecycle (automatic) |
| Modals | Bootstrap 5 + `BaseSelectorModal` + `DOMCleanup` | Radix Dialog (automatic cleanup) |
| Notifications | Custom `showNotification()` | Sonner toast library |
| Error handling | Custom error classes (`Errors.js`) | `react-error-boundary` |

---

## Feature Status Matrix

### ✅ Completed Since Last Review (Phase 6b / 6c / 6d / 6e)

| Feature | Status |
|---------|--------|
| **Compendium detail view** | Right panel now renders via `renderEntry` with type-specific metadata (spell stats, etc.), entry prose, and a type filter dropdown. Raw JSON dump removed. |
| **Details sub-nav card containers** | `max-w-7xl mx-auto w-full` container added to Characteristics, Appearance, History, and Allies/Organizations pages. |
| **Wizard ability scores step** | Step 6 fully implemented — point-buy, standard-array, and custom panels with live score/modifier preview. `CharacterWizardData` extended with `abilityScores`; `handleFinish` passes scores to `createNewCharacter`. Review step updated to display all six scores with modifiers. |
| **Tag rendering** | All 17 previously missing tags added (`@table`, `@book`, `@adventure`, `@variantrule`, `@trap`, `@hazard`, `@vehicle`, `@object`, `@reward`, `@area`, `@card`, `@deck`, `@link`, `@5etools`, `@coinflip`, `@itemProperty`, `@status`). Catch-all fallback strips any remaining unknown tags. `@table` entry type now renders a proper HTML table instead of a `[Table]` placeholder. |
| **Split-pane Build pages** | Race, Class, Background, and Proficiencies Build pages converted to the single-card split-pane pattern matching CompendiumPage. Race page: radio list with inline subrace dropdown; detail panel shows ASI, size, speed, languages, traits via `renderEntry`. Class page: class grid + level controls left; features accordion by level right (click to drill-in to feature detail). Background page: radio list with inline equipment-package dropdown; detail panel shows proficiencies + feature entries via `renderEntry`. Proficiencies page: tabs left (all clickable); detail panel right shows modifier, proficiency/expertise status, and skill descriptions from game data. |
| **Source-unique selection** | `Character` type extended with `raceSource`, `subraceSource`, `classSource`, `subclassSource`, `backgroundSource` optional fields. All `isSelected` checks on Build pages and wizard steps now use `name + source` composite matching. `CharacterWizardData` and `INITIAL_CHARACTER_DATA` updated accordingly. |
| **Subrace data loading** | `parseRaces()` in `src/lib/5etools/parsers.ts` was discarding the separate top-level `data.subrace` array entirely. Fixed to group subraces by `raceName`/`raceSource` and nest them into each parent race as `subraces: [...]`. |
| **Subrace inline dropdown placement** | The subrace `<Select>` on the Race Build page is embedded inline within the race row (right side), replacing the badge display. |
| **Subrace stat inheritance** | `mergeRaceWithSubrace()` helper merges inherited parent values (ASI, size, speed, languages) when a subrace is selected. Applied in both Race Build page and wizard's `3-RaceStep.tsx`. |
| **Ability Scores Build page** | `BuildAbilityScoresPage.tsx` fully implemented — point-buy, standard-array, and custom methods with live score/modifier/racial bonus preview. Mirrors the wizard step and is accessible from the Build nav. |
| **Full hook layer** | All derived-state hooks implemented: `useAbilityScores`, `useArmorClass`, `useCharacterLevel`, `useEquipment`, `useHitPoints`, `useProficiencies`, `useSavingThrows`, `useSkills`, `useSpellSlots`. All hooks are thin wrappers over pure `src/lib/` functions with zero duplication of business logic. |
| **Spells page** | `SpellsPage.tsx` fully implemented — spell slot tracker (use/restore), cantrip manager, spells known list, prepared spells toggle, long rest button. Powered by `useSpellSlots` hook. |
| **Equipment page** | `EquipmentPage.tsx` fully implemented — item browser, equip/unequip toggle, attunement tracker (max 3 slots), weight/carry display, item type filter. Powered by `useEquipment` hook. |
| **Feats page** | `FeatsPage.tsx` fully implemented — feat browser with prerequisite checking, ASI counter (class-aware), add/remove feats. Uses `checkAllPrerequisites()` from `src/lib/prerequisites.ts`. |
| **Pure lib layer** | `src/lib/armorClass.ts`, `src/lib/prerequisites.ts` implemented as pure functions with no React/Zustand dependencies. `src/lib/skills.ts` has `deriveAllSkills()`, `deriveAllSavingThrows()`. |
| **Character sheet view (interim)** | `CharacterSheetPage.tsx` implemented as a read-only summary view (ability scores, saving throws, skills, combat stats, proficiencies, features, feats, equipment, spells). Kept as a foundation for later PDF export work. **Note:** the primary purpose of this page is PDF generation and in-app preview (`pdf:generate` / `pdf:preview` IPC channels, Phase 6e item 15). The current view serves as a placeholder until the export pipeline is built. |

### 🟡 Partially Implemented

| Feature | What Exists | What's Missing |
|---------|------------|----------------|
| **Tooltip interactivity** | All tag spans have `title` attributes and cursor styles. `TraitTooltip` exists on Race Build page. | No Radix `<Tooltip>` wrapping — hover shows browser native tooltip only, no stat-block popover. |
| **Level-up system** | `LevelUpModal` (`src/components/character/LevelUpModal.tsx`) — Radix Dialog with "Your Classes" section (class card, Add Level, Remove Last Level w/ confirm) and "Add Class" section (class picker, Ignore Restrictions toggle, PHB multiclass ability score requirements). Triggered via "Level Up" button in the app header (`AppHeader.tsx`). `classProgression[]` model is in `Character` type with per-entry `subclass?`. `BuildClassPage` reads it and renders per-class feature tabs. | No HP roll UI. No ASI/feat picker on level-up. No spell unlock automation. No subclass selection per class in the level-up flow. Combined multiclass spell slot calculation not yet implemented. |
| **Multiclass spell slots & subclass** | `classProgression[]` model exists. `LevelUpModal` adds/levels a second class. `BuildClassPage` renders per-class feature tabs. `checkMulticlassRequirements()` enforces PHB ability score prerequisites. | Combined multiclass spell slot table not applied (each class computed independently). No subclass selection per multiclass class in modal or build page. |
| **Character import/export** | `HomePage.tsx` exports `.dndchar` JSON via browser download and imports `.dndchar`/`.json` via browser file picker. | No conflict detection on import. No IPC/native file dialog. No `.ffp` round-trip compatibility. |
| **Source name resolution** | `buildSourcesList` indexes by both `id` and `source`, `adventures.json` merged, `SOURCE_FALLBACKS` map added. | Some abbreviations still show raw (absent from both JSON files and fallback map). Requires manual `sourceFallbacks.ts` additions or a build-time scrape script. |

### ❌ Not Yet Implemented

| Feature | Priority |
|---------|----------|
| **Character validation** — completeness warnings (missing ASIs, subclass, required choices) | Medium |
| **PDF export** — template-based character sheet generation | Medium |
| **Tooltip interactivity** — hover on `@spell`, `@item`, etc. via Radix `<Tooltip>` | Medium |
| **Base selection modal** — reusable `SelectionModal` (Radix `Dialog`) + `SpellSelectionModal` wired into `SpellsPage` | Medium |

---

## Detailed Gap Analysis

### 1. Tag Rendering

All previously missing tags have been implemented in `src/lib/renderer.ts`. Coverage is now complete for static rendering. Remaining gap is **tooltip interactivity** only — tags render `title` attributes but no Radix `<Tooltip>` stat-block popovers. The `TraitTooltip` component exists on the Race Build page but is not wired to the tag renderer.

### 2. IPC Channel Gaps

Forge has 29 IPC channels across 6 handler files. Tavern-Born has 2.

**Missing IPC capabilities:**
- Character save/load/delete/list to filesystem
- Character import/export via native dialog (basic browser-level export/import exists; IPC upgrade and conflict detection remain)
- PDF generation and preview
- Portrait save/list from disk
- Settings persistence (save path, window bounds, preferences)
- Data source validation
- UUID generation
- App path resolution
- File open/write/exists operations

---

## Recommendations: How to Port Logic

### Principle: Adapt, Don't Copy-Paste

fizbanes-forge is vanilla JS with manual DOM manipulation, event buses, and mutable state. Copy-pasting its logic into React will create bugs and fight the framework. Instead, use forge as a **reference implementation** — understand *what* it computes and *why*, then express that in React/TypeScript idioms.

### Strategy 1: Extract Pure Logic into Utility Modules

Forge has business logic mixed into services, UI components, and the Character class. The cleanest approach is to **extract pure calculation functions** into `src/lib/` modules that have zero React or Zustand dependencies.

**Example — Game Rules:**
```typescript
// src/lib/gameRules.ts
export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;

export const HIT_DICE: Record<string, number> = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Sorcerer: 6, Wizard: 6,
};

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getProficiencyBonus(totalLevel: number): number {
  return Math.ceil(totalLevel / 4) + 1;
}

export function getPointBuyCost(scores: Record<string, number>): number {
  return Object.values(scores).reduce((sum, s) => sum + (POINT_BUY_COSTS[s] ?? 0), 0);
}
```

**Why this works:** Pure functions are testable, reusable by any component or hook, and don't couple to React lifecycle or Zustand stores. Forge's `GameRules.js` is already mostly pure — translate its constants and add typed function signatures.

### Strategy 2: Replace Services with Custom Hooks + Pure Logic

Forge's services combine data access, caching, validation, and state mutation. In React, split those concerns:

| Forge Service Role | Tavern-Born Equivalent |
|-------------------|----------------------|
| Data loading + caching | Already handled by `gameDataStore` + data hooks |
| Business logic / calculations | Pure functions in `src/lib/` |
| State mutation + notification | Zustand store actions |
| Input validation | Zod schemas |
| Cross-component coordination | Zustand subscriptions or React context |

**Example — Ability Score Service:**

Forge's `AbilityScoreService` loads data, tracks bonuses, and mutates the character. In Tavern-Born:

```typescript
// src/lib/abilityScores.ts — pure logic (ported from AbilityScoreService)
export function calculateTotalScore(
  base: number,
  racialBonus: number,
  asiBonus: number,
  featBonus: number,
): number {
  return Math.min(20, base + racialBonus + asiBonus + featBonus);
}

// src/hooks/useAbilityScores.ts — React integration
export function useAbilityScores() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  // ... derive computed values, return actions
}
```

### Strategy 3: Derive, Don't Store

Forge stores many computed values and manually keeps them in sync (e.g., proficiency bonus, ability modifiers, AC). In React + Zustand, **derive these values** via hooks or selectors so they're always correct:

```typescript
// Instead of storing proficiencyBonus on the character:
function useProficiencyBonus() {
  const level = useCharacterStore((s) => s.activeCharacter?.level ?? 1);
  return getProficiencyBonus(level); // pure function
}

// Instead of storing abilityModifiers:
function useAbilityModifiers() {
  const scores = useCharacterStore((s) => s.activeCharacter?.abilityScores);
  return useMemo(() => {
    if (!scores) return null;
    return Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, getAbilityModifier(v)])
    );
  }, [scores]);
}
```

**Why this works:** Derived state can't go stale. Forge's event-driven approach (`CHARACTER_UPDATED` → re-render) exists because vanilla JS has no reactive data flow. React *is* the reactive data flow — use it.

### Strategy 4: Port Validation Logic to Zod Schemas

Forge has `ValidationSchemas.js` with manual validation. Tavern-Born already uses Zod for the wizard. Extend this pattern:

```typescript
// src/lib/schemas/characterSchema.ts
import { z } from 'zod';

export const abilityScoreSchema = z.number().min(1).max(30);
export const pointBuyScoreSchema = z.number().min(8).max(15);

export const characterSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().min(1).max(20),
  abilityScores: z.object({
    str: abilityScoreSchema,
    dex: abilityScoreSchema,
    // ...
  }),
});
```

### Strategy 5: Port the Prerequisite System

Forge's `PrerequisiteValidator.js` is essentially a pure function that takes a character + prerequisites and returns pass/fail. Port it directly:

```typescript
// src/lib/prerequisites.ts
export type Prerequisite =
  | { type: 'level'; level: number }
  | { type: 'ability'; ability: string; minimum: number }
  | { type: 'race'; race: string }
  | { type: 'class'; class: string }
  | { type: 'spellcasting' }
  | { type: 'proficiency'; proficiency: string };

export function meetsPrerequisites(
  character: Character,
  prerequisites: Prerequisite[],
): { met: boolean; failures: string[] } {
  // Port logic from PrerequisiteValidator.checkAllPrerequisites()
}
```

### Strategy 6: Build IPC Channels Incrementally

Don't port all 29 IPC channels at once. Add them as features need them:

| When Building... | Add These Channels |
|------------------|--------------------|
| File-based save/load | `character:save`, `character:load`, `character:list`, `character:delete` |
| Import/export | `character:import`, `character:export` |
| PDF export | `pdf:generate`, `pdf:preview`, `pdf:listTemplates` |
| Settings | `settings:get`, `settings:set` |
| Portrait storage | `portrait:save`, `portrait:list` |

For many features, IndexedDB persistence may be sufficient initially. File-based save/load is needed for sharing characters between devices or with other tools.

### Strategy 7: Tooltip Interactivity via React Portals

Forge's tooltip system uses DOM data attributes (`data-hover-type`, `data-hover-name`) + a global `TooltipManager` that listens for mouse events. In React, use Radix Tooltip + a lookup hook:

```typescript
// When rendering a @spell tag:
<Tooltip>
  <TooltipTrigger asChild>
    <span className="text-accent cursor-help">{spellName}</span>
  </TooltipTrigger>
  <TooltipContent>
    <SpellTooltipContent name={spellName} source={source} />
  </TooltipContent>
</Tooltip>
```

This replaces forge's imperative tooltip manager with React's declarative component model. The Radix `TooltipProvider` with `delayDuration` is already configured in `App.tsx`.

### Strategy 8: Split-Pane Card Pattern

All pages with a list + detail layout (Compendium, Race Build, Class Build, Background Build, Proficiencies) must use this **single-card split-pane** pattern — NOT two separate cards in a CSS grid.

**Structure:**
```tsx
// One Card, flex-row body, toggle button absolutely positioned top-right
<Card className="h-full overflow-hidden flex flex-col">
  <div className="relative flex flex-row flex-1 overflow-hidden min-h-0">

    {/* Toggle button — absolute top-right of the card body */}
    <button
      onClick={() => setDetailCollapsed((c) => !c)}
      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground ..."
    >
      {detailCollapsed ? <CaretLeft /> : <CaretRight />}
    </button>

    {/* Left pane — always flex-1, naturally expands when right collapses */}
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* search bar, list, scroll area */}
    </div>

    {/* Right pane — width/opacity/pointer-events animated via inline style */}
    <div
      className="flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out"
      style={{
        width: detailCollapsed ? 0 : '42%',
        minWidth: detailCollapsed ? 0 : 320,
        opacity: detailCollapsed ? 0 : 1,
        pointerEvents: detailCollapsed ? 'none' : undefined,
      }}
    >
      {/* detail content rendered via renderEntry */}
    </div>
  </div>
</Card>
```

**Key rules:**
- `flex-1` on the left pane — it expands automatically when the right collapses to 0.
- Right pane uses **inline styles** for `width`/`minWidth` because Tailwind cannot transition arbitrary widths via class toggling.
- `transition-all duration-300 ease-in-out` on the right pane outer div drives the animation.
- Toggle button icon flips: `CaretRight` (detail visible) → `CaretLeft` (detail collapsed).
- Selecting an entry in the list while collapsed automatically re-opens the detail panel.
- **Reference implementation:** `CompendiumPage.tsx` (fully implemented). Applies to: Compendium ✅, Race Build ✅, Class Build ✅, Background Build ✅, Proficiencies ✅.
- The `Card` component has `py-6` baked in. Use `-my-6` on the flex-row container so the right panel's background color bleeds edge-to-edge vertically instead of being clipped by the card padding:
  ```tsx
  <Card className="h-full overflow-hidden flex flex-col">
    {/* -my-6 cancels Card's py-6 — right panel bg covers top and bottom edge */}
    <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
  ```
- Use `overflow-hidden` on every `ScrollArea` root inside the panes. Without it the Radix viewport has no bounded height and `flex-1` never creates a scroll constraint:
  ```tsx
  <ScrollArea className="flex-1 overflow-hidden">
  ```
- Any header/search bar for the page should sit **outside** (above) the split-pane container so it is unaffected by the `-my-6` bleed.

---

## Implementation Backlog

Phases 1–5 are complete. The following breaks down remaining work by priority.

### 🔴 Phase 6a — Critical Correctness (Do First)

1. ✅ **Non-unique React list keys** — All race/class/background/subrace/subclass/spell/feat list renderers now use composite `name|source` keys. **DONE.**

### 🟠 Phase 6b — Core UX (High Impact, Low Friction)

2. ✅ **Data-source startup modal** (`DataSourceModal`) — **DONE.** `DataSourceStartupModal.tsx` implemented as a blocking first-run Radix `Dialog`.

3. ✅ **Compendium split-pane + detail view** — **DONE.** Single-card split-pane layout. Detail panel renders via `renderEntry` with type-specific metadata and a type filter dropdown. Raw JSON dump removed.

4. ✅ **Details sub-nav card containers** — **DONE.** `max-w-7xl mx-auto w-full` added to Characteristics, Appearance, History, and Allies/Organizations pages.

5. ✅ **Wizard ability scores step** — **DONE.** Step 6 fully implemented with point-buy, standard-array, and custom panels. Review step shows all six scores with modifiers. `CharacterWizardData.abilityScores` wired through to `createNewCharacter`.

### 🟡 Phase 6c — Modals & Guided Flows

6. ✅ **Split-pane Build page layout** — **DONE.** Race, Class, Background, and Proficiencies pages now use the single-card split-pane pattern. See completed entry above for full details.

7. ✅ **Level-up modal** (`LevelUpModal`) — `src/components/character/LevelUpModal.tsx`. Radix Dialog with two sections: (1) "Your Classes" — current class card with Add Level / Remove Last Level (with `AlertDialog` confirmation); (2) "Add Class" — class picker with PHB multiclass ability score requirements + Ignore Restrictions toggle; full `classProgression[]` model wired through. Triggered via "Level Up" button in the app header (`AppHeader.tsx`). Remaining gaps (HP roll, ASI/feat picker on level-up, subclass selection per class, combined multiclass spell slots) are tracked in Phase 6e.

8. 🟡 **Base selection modal** (`SelectionModal`) — Reusable Radix `Dialog` for all browse-and-pick flows (spells, items, feats, languages, tools). **`src/components/ui/SelectionModal.tsx` implemented; `src/components/character/SpellSelectionModal.tsx` implemented and wired into `SpellsPage.tsx`.** Remaining: ItemSelectionModal, FeatSelectionModal, LanguageSelectorModal (forge refs: `ItemSelectorModal.js`, `FeatSelectorModal.js`). Layout has three zones:
   - **Header**: `DialogTitle` showing the task (e.g. "Learn 3 cantrips, 6 1st-level spells"), search bar spanning the full width with a filter-toggle button (collapses/expands the sidebar) and a Clear button.
   - **Body** (flex-row, fills remaining height):
     - *Left sidebar* (collapsible, ~240px) — stacked accordion sections (e.g. "Spell Level", "School", "Type") each containing checkboxes or toggles. Collapses to 0-width when the filter button is toggled off.
     - *Right content area* (flex-1, `ScrollArea`) — vertically scrolling list of inline summary cards. Each card shows the entry name + school/type tag on one line, then a two-column stats grid (Casting Time, Range, Duration, Components for spells) followed by a short description excerpt. No separate detail panel — all relevant metadata is inline on the card.
   - **Footer**: left side shows "SELECTED" label plus per-category counter badges (e.g. `0/3 cantrips`, `0/6 1st level`) and a plain-text status line ("No selections" / comma-joined names). Right side has Cancel and Confirm buttons.
   
   Existing inline browsers (spell, item, feat) should eventually open this modal. Reference: `BaseSelectorModal.js`, `SpellSelectorModal.js`, `ItemSelectorModal.js`, `FeatSelectorModal.js` in fizbanes-forge.

### 🔵 Phase 6d — Content & Display Completeness

9. ✅ **Remaining tag rendering** — **DONE.** All 17 missing tags implemented. `@table` now renders a proper HTML table. Catch-all strips any future unknown tags gracefully.

9b. ⚠️ **Incomplete source name resolution** — See Partially Implemented section above. `SOURCE_FALLBACKS` in `src/lib/5etools/sourceFallbacks.ts` is the designated place to add overrides as they are discovered.

10. ❌ **Tooltip interactivity** — Wrap `@spell`, `@item`, `@condition`, etc. tag spans in Radix `<Tooltip>` showing the stat block / description on hover. The `TooltipProvider` is already in `App.tsx`. The `TraitTooltip` component on the Race Build page is the reference pattern.

11. ❌ **Character validation** — Completeness warnings: missing ASI choices, no subclass selected at eligible levels, required spell selections unpicked, etc. Reference: `src/services/CharacterValidationService.js` in fizbanes-forge.

12. ✅ **Character sheet view (interim)** — **DONE.** `CharacterSheetPage.tsx` is a read-only calculated display. Intentionally kept simple — the page's final purpose is PDF generation/preview (Phase 6e item 15). The current view is a usable placeholder until the PDF pipeline is wired up.

### ⚪ Phase 6e — Platform & Export

13. 🟡 **Multiclass support** — `classProgression[]` model is in `Character` type (with per-entry `subclass?`). `LevelUpModal` handles adding a second class and levelling each class independently. `BuildClassPage` renders per-class feature tabs from `classProgression`. Remaining: combined multiclass spell slot table (currently each class computed independently), subclass selection per class in the level-up modal/build page. Reference: `src/services/LevelUpService.js` in fizbanes-forge.

14. 🟡 **Character import/export** — Export to `.dndchar` and import from `.dndchar`/`.json` are functional in `HomePage.tsx` using browser file APIs. Remaining: conflict detection on import (keep both / replace / cancel), native file-dialog via IPC (`dialog:saveFile`, `dialog:openFile`, `fs:writeJson`). Reference: `src/app/CharacterSerializer.js`, `src/services/CharacterImportService.js` in fizbanes-forge.

15. ❌ **PDF export** — Template-based character sheet generation + in-app preview. Requires additional IPC channels (`pdf:generate`, `pdf:preview`, `pdf:listTemplates`). Reference: `src/ui/components/preview/PdfPreviewRenderer.js` in fizbanes-forge.

---

## Key Files to Reference in fizbanes-forge

When implementing each feature, use these forge files as logic references (not copy targets):

| Feature | Reference Files |
|---------|----------------|
| Game rules / constants | `src/lib/GameRules.js` |
| Ability score logic | `src/services/AbilityScoreService.js`, `src/lib/AbilityScoreUtils.js` |
| Character model | `src/app/Character.js` |
| Prerequisite checks | `src/lib/PrerequisiteValidator.js` |
| Class features / subclasses | `src/services/ClassService.js` |
| Spell slot calculation | `src/services/SpellSlotCalculatorService.js`, `src/services/SpellSelectionService.js` |
| Proficiency management | `src/services/ProficiencyService.js` |
| Equipment / inventory | `src/services/EquipmentService.js` |
| Level-up flow | `src/services/LevelUpService.js` |
| Feat validation | `src/services/FeatService.js` |
| Character serialization | `src/app/CharacterSerializer.js` |
| Character validation | `src/services/CharacterValidationService.js` |
| 5eTools tag rendering | `src/lib/5eToolsRenderer.js` |
| PDF export | `src/ui/components/preview/PdfPreviewRenderer.js` |
| Import with conflict detection | `src/services/CharacterImportService.js` |
| Base selection modal template | `src/ui/components/modals/BaseSelectorModal.js`, `ItemSelectorModal.js`, `SpellSelectorModal.js`, `FeatSelectorModal.js` |
| Level-up modal | `src/ui/components/levelup/LevelUpModal.js`, `src/services/LevelUpService.js` |
| Data-source startup modal | `src/ui/pages/SettingsPage.js` (data-source section), `src/app/AppInitializer.js` |
