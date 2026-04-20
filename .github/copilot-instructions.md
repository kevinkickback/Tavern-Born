# Claude Instructions

These rules take precedence over convenience or creativity.

---

## Engineering Standards

Use industry best practices unless overridden below. Prefer simple, composable designs with clear separation of concerns, stable public APIs, and explicit behavior. Favor maintainability and testability over cleverness.

## Rules

### 0. Docs routing
Read relevant docs before non-trivial changes; update them in the same change.

- `docs/README.md` — index
- `docs/architecture-map.md` — where code belongs
- `docs/data-flow.md` — startup/loading/persistence
- `docs/data-ingestion.md` — anything in `src/lib/5etools/`
- `docs/state-management.md` — stores or mutation flows
- `docs/provenance.md` — grant/reconciliation behavior
- `docs/testing-map.md` — adding or modifying tests
- `docs/codebase-tour.md` — fast concern-to-folder routing

### 1. Never edit `data/`
`data/` holds 5etools JSON managed externally. Put all fixups in source (e.g. `src/lib/5etools/sourceFallbacks.ts`). Enforced by hooks; never bypass.

### 2. Prefer parsed game data; hardcoded values are fallback-only
Canonical 5etools values must come from parsed data. If a parser is missing, write one — don't add constants. Emergency fallbacks must be clearly marked, validated against parsed data when available, and easy to remove.

### 3. 5etools list keys must be `name|source`
Names are not unique across sources. Rendered list items backed by 5etools entities must use the composite key:
```tsx
// ✅ items.map((i) => <SelectItem key={`${i.name}|${i.source ?? ''}`} value={i.name} />)
// ❌ items.map((i) => <SelectItem key={i.name} value={i.name} />)
```
Purely synthetic (non-entity) UI arrays may use stable non-entity keys.

### 4. No game data access in components
All data access goes through hooks — never import JSON directly in a component:
- `useFilteredGameData()` — filtered lists (races, classes, backgrounds, spells, feats, items)
- `useGameDataStore()` — raw store
- Named hooks: `useHitPoints`, `useSkills`, `useSpellSlots`, `useEquipment`, etc.

### 5. Business logic belongs in `src/lib/` — search before writing
All business logic (modifiers, costs, slots, bonuses, prereq checks, AC, HP) goes in `src/lib/` as pure functions with no React/Zustand imports. The function may already exist — search first:
- `src/lib/5etools/parsers/` · `src/lib/5etools/filters.ts`
- `src/lib/calculations/` (`skills.ts`, `abilityScores.ts`, `gameRules.ts`, `prerequisites.ts`, `spellSlots.ts`)
- `src/lib/characterUtils.ts`

Hooks in `src/hooks/` are thin wrappers connecting lib functions to state.

### 6. Derive, don't store (except mutable runtime state)
Don't persist pure derived values — compute on demand:
```tsx
// ✅ const profBonus = getProficiencyBonus(getTotalLevel(character.classProgression))
// ❌ character.proficiencyBonus  ← stale
```
Do persist mutable gameplay state that can't be recomputed from static inputs: current HP, temp HP, spell slot usage, per-rest counters, user overrides.

### 7. All character mutations through the store
All writes go through `updateCharacter(id, patch)` from `useCharacterStore`. Never mutate state directly.

### 8. UI stack
- **Modals/overlays**: Radix `Dialog`, `Tooltip`, `Select`, `DropdownMenu`
- **Notifications**: `toast()` from Sonner — no `alert()` or custom toasts
- **Styles**: Tailwind first; `cn()` for conditional classes. Inline `style` only for dynamic runtime values (CSS variables, transform values, dynamic dimensions/images). Never for static presentation.

### 9. Always use `renderEntry` for 5etools content
Never render raw JSON. All entry content goes through `renderEntry()` from `src/lib/renderer.ts` or `FormattedTextRenderer` from `src/components/editor/FormattedTextRenderer.tsx`.

### 10. Content pages use max-width container
Settings, Compendium, and all Details sub-nav pages use a centered `max-w-7xl` container:
```tsx
<div className="max-w-7xl mx-auto w-full"><Card className="w-full">...</Card></div>
```
Exceptions: character cards, sidebar (full-bleed).

### 11. Lint, type-check, and test after every change
Hooks (Biome) run automatically. Do not bypass them. Run the fix/check/type sequence after each edit and stay clean before moving to the next step. Stop after 3 failed attempts on the same file and report the blocker.

### 12. Comments, docs, and tests
- **Inline comments**: only when the code is not self-documenting.
- **JSDoc**: only on public functions, classes, and exported types.
- **Tests**: every new feature requires relevant unit and/or E2E coverage.
