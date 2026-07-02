# Claude Instructions

These rules take precedence over convenience or creativity.

---

## Engineering Standards

Use industry best practices unless overridden below. Prefer simple, composable designs with clear separation of concerns, stable public APIs, and explicit behavior. Favor maintainability and testability over cleverness.

## Rules

### 0. Docs routing
Read relevant docs before non-trivial changes; update them in the same change.

- [docs/README.md](../docs/README.md) — index
- [docs/architecture-map.md](../docs/architecture-map.md) — where code belongs
- [docs/data-flow.md](../docs/data-flow.md) — startup/loading/persistence
- [docs/data-ingestion.md](../docs/data-ingestion.md) — anything in `src/lib/5etools/`
- [docs/state-management.md](../docs/state-management.md) — stores or mutation flows
- [docs/provenance.md](../docs/provenance.md) — grant/reconciliation behavior
- [docs/react-patterns.md](../docs/react-patterns.md) — React hook and rendering conventions for this codebase
- [docs/testing-map.md](../docs/testing-map.md) — adding or modifying tests
- [docs/codebase-tour.md](../docs/codebase-tour.md) — fast concern-to-folder routing

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
All business logic (modifiers, costs, slots, bonuses, prereq checks, AC, HP) goes in `src/lib/` as pure functions with no React/Zustand imports. The function may already exist — check `docs/codebase-tour.md` for where to look before writing anything new.

Hooks in `src/hooks/` are thin wrappers connecting lib functions to state.

### 6. Derive, don't store (except mutable runtime state)
Don't persist pure derived values — compute on demand:
```tsx
// ✅ const profBonus = getProficiencyBonus(getTotalLevel(character.classProgression))
// ❌ character.proficiencyBonus  ← stale
```
Do persist mutable gameplay state: current HP, temp HP, spell slot usage, per-rest counters, user overrides. See `docs/state-management.md` for the full policy, including the intentional `activeCharacter` draft exception.

### 7. Stable empty-array fallbacks for memo deps and memoized props
`?? []` creates a new array reference every render. Never use it inline when the result is a `useMemo`/`useCallback` dep or a prop passed to a `memo`-wrapped child — use a module-level constant instead. See `docs/react-patterns.md`.

### 8. All character mutations through the store
All writes go through `updateCharacter(id, patch)` from `useCharacterStore`. Never mutate state directly.

### 9. UI stack
- **Modals/overlays**: Radix `Dialog`, `Tooltip`, `Select`, `DropdownMenu`
- **Notifications**: `toast()` from Sonner — no `alert()` or custom toasts
- **Styles**: Tailwind first; `cn()` for conditional classes. Inline `style` only for dynamic runtime values (CSS variables, transform values, dynamic dimensions/images). Never for static presentation.
- **Content pages**: centered `max-w-7xl` container — see `docs/react-patterns.md`.
- **5etools content**: never render raw JSON — always use `renderEntry()` from `src/lib/renderer.ts` or `FormattedTextRenderer`.

### 10. Lint, type-check, and test after every change
Hooks (Biome) run automatically. Do not bypass them. Run the fix/check/type sequence after each edit and stay clean before moving to the next step. Stop after 3 failed attempts on the same file and report the blocker.

### 11. Comments, docs, and tests
- **Inline comments**: only when the code is not self-documenting.
- **JSDoc**: only on public functions, classes, and exported types.
- **Tests**: every new feature requires relevant unit and/or E2E coverage.
