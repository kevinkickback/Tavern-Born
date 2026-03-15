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

### ✅ Fully Implemented in Tavern-Born

| Feature | Notes |
|---------|-------|
| **Character CRUD** | Create, load, delete, set active — via Zustand + IDB |
| **Character creation wizard** | 7-step modal: name, rules, race, class, background, ability scores (stub), review |
| **Data loading pipeline** | Remote (GitHub mirror) + local filesystem, 16 resource types, progress tracking |
| **Data filtering by source** | Per-character `allowedSources`, applied across all data hooks |
| **Race selection** (wizard) | Pick race + subrace with trait display |
| **Class selection** (wizard) | Pick class with hit die info |
| **Background selection** (wizard) | Pick background |
| **Portrait management** | Upload with zoom/pan/rotate, 5MB limit, base64 storage |
| **Character details pages** | Characteristics, Appearance, History, Allies/Organizations — all save correctly |
| **Rich text editing** | `RichTextArea` with preview mode + `@`-tag formatting guide |
| **Compendium** | Searchable browser across all data types |
| **Settings page** | Data source configuration (remote URL / local folder) |
| **Tag rendering** | ~25 `@`-tag types rendered with Tailwind classes |
| **Sidebar navigation** | Collapsible sections for Build/Details |
| **Responsive design** | Mobile breakpoint detection via `useIsMobile()` |
| **Theming** | CSS variables + dark fantasy aesthetic from PRD |
| **Dev seed data** | Auto-populated example characters for development |
| **Security hardening** | CSP, context isolation, sandbox, link restrictions |

### 🟡 Partially Implemented (Missing Features)

| Feature | What Exists | What's Missing |
|---------|------------|----------------|
| **Tag rendering** | ~25 tags with styled spans | ~25 more tags from forge (`@table`, `@book`, `@variantrule`, `@adventure`, `@trap`, `@area`, `@link`, etc.). **No interactive hover/click** — tags render as styled text only, not linked to tooltips or navigation. `@table` shows `[Table]` placeholder. |
| **Ability score assignment** | Wizard step 6 exists but defers to Build page | No point-buy UI, no standard array UI, no custom entry UI. No `GameRules` constants for costs/limits. |
| **Compendium detail view** | Two-panel layout with search | Detail panel shows **raw JSON** instead of formatted rendering via `FormattedTextRenderer`. |
| **Character creation wizard** | All 7 steps functional | Step 6 (Ability Scores) is a stub. No class feature display during class selection. No background equipment preview. |
| **Character type definition** | Comprehensive TypeScript interface | No behavioral methods — can't compute modifiers, bonuses, or derived stats. Just a data shape. |
| **Electron IPC** | 2 channels (`dialog:selectFolder`, `fs:readJson`) | Missing 26+ channels for file-based save/load, PDF export, portraits, settings, UUID generation, data validation. |
| **Import/Export** | JSON export exists on home page | No `.ffp` file format support. No conflict detection on import (keep both / replace / cancel). |

### ❌ Not Yet Implemented

| Feature | Forge Implementation | Priority |
|---------|---------------------|----------|
| **Build pages** (Race/Class/Background/Proficiencies/Ability Scores) | Full interactive selectors with source filtering, trait display, equipment preview | **Critical** — core character building |
| **Game rules engine** | `GameRules.js`: point-buy costs, standard array, ASI levels per class, hit dice, carry capacity, proficiency bonus by level | **Critical** — drives all calculations |
| **Ability score calculations** | Modifiers, racial bonuses by source, point-buy budget tracking, ASI application | **Critical** |
| **Hit point calculation** | CON modifier + class hit die + level progression | **Critical** |
| **Armor class calculation** | Equipped armor + DEX mod + shield + magical bonuses | **Critical** |
| **Proficiency system** | Source tracking (race/class/background), type categories (armor/weapons/tools/skills/languages), expertise | **Critical** |
| **Class features** | Feature unlocks per level, subclass features, choices (Fighting Style, Invocations, Metamagic) | **Critical** |
| **Spell management** | Known vs. prepared, slot calculation, cantrip count, multiclass spellcasting, pact magic | **High** |
| **Equipment/inventory** | Add/remove items, equip/unequip, attunement (max 3), weight tracking, encumbrance | **High** |
| **Feat system** | Selection via ASI, prerequisite validation, feat benefit application | **High** |
| **Level-up system** | Multiclass support, HP rolls, ASI/feat selection, spell unlocks, feature unlocks, progression history | **High** |
| **Character validation** | Missing spells, ASIs, subclass warnings, completeness checking | **Medium** |
| **Prerequisite validation** | Level, ability scores, race, class, spellcasting requirements for feats/features | **Medium** |
| **Character rehydration** | Re-populate computed fields (racial features, subrace traits) on load | **Medium** |
| **PDF export** | Template-based character sheet generation + in-app preview | **Medium** |
| **Multiclass** | Secondary class addition, combined spell slots, proficiency merging | **Medium** |
| **Tooltip interactivity** | Hover on `@spell`, `@item`, etc. to see full stat blocks / descriptions | **Low** (nice-to-have) |
| **Stat block rendering** | Monster/NPC stat block format display | **Low** |
| **Character sheet view** | Calculated read-only character sheet for gameplay reference | **Medium** |

---

## Detailed Gap Analysis

### 1. Game Rules Engine (Not Present in Tavern-Born)

Forge's `GameRules.js` defines critical constants that drive the entire app. Tavern-Born has **none** of this:

```
Point-buy costs:     { 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9 }
Standard array:      [15, 14, 13, 12, 10, 8]
Point-buy budget:    27
Ability range:       3–20 (base), 1–30 (with bonuses)
ASI levels by class: Fighter [4,6,8,12,14,16,19], Rogue [4,8,10,12,16,19], default [4,8,12,16,19]
Hit dice per class:  Barbarian d12, Fighter/Paladin/Ranger d10, etc.
Proficiency bonus:   [2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6]
Carry capacity:      STR × 15
```

### 2. Character Domain Object (Interface-Only in Tavern-Born)

Forge has a rich `Character` class (300+ lines) with behavioral methods. Tavern-Born has only a TypeScript interface — a data shape with no logic.

**Missing capabilities:**
- `getAbilityModifier(ability)` — compute `Math.floor((score - 10) / 2)`
- `getAbilityScore(ability)` — base + racial bonuses + ASI + feat bonuses
- `getProficienciesByType(type)` — armor, weapons, tools, skills, languages
- `getTotalLevel()` — sum across multiclass
- `getPrimaryClass()` — first class entry
- Source-tracked ability bonuses (know *why* STR is 16: "base 14 + racial +2")
- Source-tracked proficiencies (know *why* you have Athletics: "class: Fighter")

### 3. Service Layer (Absent in Tavern-Born)

Forge has **30 specialized services** enforcing data access patterns. Tavern-Born accesses data directly through hooks + the Zustand store. There is no equivalent to:

- `AbilityScoreService` — score assignment methods, bonus tracking
- `ProficiencyService` — add/remove with source tracking
- `SpellSelectionService` — known/prepared management, slot calculation
- `EquipmentService` — inventory CRUD, attunement, encumbrance
- `LevelUpService` — progression, multiclass, HP allocation
- `CharacterValidationService` — completeness checking
- `RehydrationService` — re-populate computed fields on load
- `CharacterImportService` — file import with conflict detection

### 4. Tag Rendering Gaps

Tags present in forge but missing in Tavern-Born:

| Missing Tag | Used For |
|-------------|----------|
| `@table` | Inline table references |
| `@book` / `@adventure` | Source book/adventure references |
| `@variantrule` | Variant rule references |
| `@trap` / `@hazard` | Trap and hazard descriptions |
| `@vehicle` / `@object` | Vehicle and object references |
| `@reward` | Supernatural gift/blessing refs |
| `@area` | Map area references |
| `@card` / `@deck` | Tarot/deck references |
| `@link` / `@5etools` | External URLs |
| `@coinflip` | Random coin flip display |
| `@itemProperty` | Item property abbreviations |
| `@status` | Status condition display |

More critically, forge's tags emit `data-hover-type`, `data-hover-source`, `data-hover-name` attributes that power an interactive tooltip system. Tavern-Born's tags are **display-only** — no click or hover behavior.

### 5. IPC Channel Gaps

Forge has 29 IPC channels across 6 handler files. Tavern-Born has 2.

**Missing IPC capabilities:**
- Character save/load/delete/list to filesystem
- Character import/export (`.ffp` files)
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

---

## Suggested Implementation Order

This order minimizes blocked work — each phase builds on the previous:

### Phase 1: Foundation (Unblocks everything else)
1. **Game rules constants** (`src/lib/gameRules.ts`) — point-buy, standard array, hit dice, ASI levels, proficiency bonus table
2. **Ability score utilities** (`src/lib/abilityScores.ts`) — modifier calc, point-buy cost, bonus tracking
3. **Character utility functions** (`src/lib/characterUtils.ts`) — `getTotalLevel()`, `getPrimaryClass()`, derived stat calculations

### Phase 2: Core Build Pages
4. **Ability Scores Build page** — Point-buy, standard array, custom entry UIs with real-time validation
5. **Race Build page** — Full race/subrace selector with trait display, ability bonus application
6. **Class Build page** — Class selector with feature preview, hit die display, subclass selection
7. **Background Build page** — Background selector with proficiency + equipment grants
8. **Proficiencies Build page** — Category display with source tracking

### Phase 3: Character Mechanics
9. **HP calculation** — CON mod + hit die per level
10. **AC calculation** — Equipped armor + DEX + modifiers
11. **Proficiency system** — Source tracking, type categories, expertise
12. **Saving throws** — Class-based proficiency
13. **Skills** — Proficiency + expertise + ability modifier

### Phase 4: Progression
14. **Level-up system** — Add class levels, HP allocation, feature unlocks
15. **ASI/Feat selection** — At appropriate levels, with prerequisite validation
16. **Prerequisite validator** — Port from forge's `PrerequisiteValidator.js`
17. **Class feature choices** — Fighting Styles, Invocations, Metamagic, etc.

### Phase 5: Spells & Equipment
18. **Spell management** — Known vs. prepared, cantrips, slot calculation
19. **Spell selection UI** — Filter by class/level/school, search
20. **Equipment system** — Inventory CRUD, equip/unequip, attunement
21. **Item selection UI** — Category display, search, magic item support

### Phase 6: Polish & Export
22. **Character sheet view** — Read-only calculated display
23. **Character validation** — Completeness warnings
24. **Remaining tag rendering** — `@table`, `@book`, `@link`, etc.
25. **Tooltip interactivity** — Hover previews for `@spell`, `@item`, etc.
26. **PDF export** — Template-based generation (requires new IPC channels)
27. **File-based save/load** — `.ffp` format with conflict detection (IPC channels)
28. **Multiclass support** — Secondary class, combined spell slots

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
