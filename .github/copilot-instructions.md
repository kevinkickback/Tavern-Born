# Copilot Instructions

**These rules take precedence over convenience or creativity.**

---

## Non-Negotiables

### General engineering standard
Use industry best practices for every engineering decision unless a repository instruction in this file explicitly requires something different.

- Prefer the simplest design that keeps responsibilities separated and behavior explicit.
- Preserve type safety and data integrity over convenience.
- Prefer small, composable units over large multi-purpose files.
- Keep public APIs stable during refactors unless the change requires an intentional contract update.
- Favor maintainability, testability, and clear ownership boundaries when choosing between valid implementations.

### 0. Docs routing for large-codebase navigation
Use this repo doc set to gather focused context before making non-trivial changes.

- Start at `docs/README.md` for the docs index.
- Read `docs/architecture-map.md` when unsure where code belongs.
- Read `docs/data-flow.md` before changing startup/loading/persistence behavior.
- Read `docs/data-ingestion.md` before changing anything in `src/lib/5etools/`.
- Read `docs/state-management.md` before changing stores or mutation flows.
- Read `docs/provenance.md` before changing grant/reconciliation behavior.
- Read `docs/testing-map.md` before adding or modifying tests.
- Read `docs/codebase-tour.md` for fast concern-to-folder routing.

For behavior changes, update the corresponding docs file in the same change.

### 1. Never edit `data/`
`data/` holds 5etools JSON files managed externally. Put all fixups in source (e.g. `src/lib/5etools/sourceFallbacks.ts`).
This rule is enforced by automated hooks and must never be bypassed.

### 2. Prefer parsed game data; hardcoded values are fallback-only
Canonical 5etools game values must come from parsed data, not source constants.

- Do not hardcode canonical values that already exist in JSON (multiclass requirements, spell slots, hit dice, proficiency progression, class features, prerequisites, spell schools, item types, etc.).
- If parsing is missing, implement the parser instead of introducing new canonical constants.
- Emergency fallback constants are allowed only when data is unavailable at runtime and must be clearly marked as fallback, validated against parsed data when available, and easy to remove.

### 3. 5etools list keys must be `name|source`
Names are not unique across sources. Any rendered list item backed by 5etools entities must use the composite key:
```tsx
// ✅ items.map((i) => <SelectItem key={`${i.name}|${i.source ?? ''}`} value={i.name} />)
// ❌ items.map((i) => <SelectItem key={i.name} value={i.name} />)
```

For non-5etools local UI arrays (purely synthetic items), stable non-entity keys are acceptable.

### 4. No game data access in components
All data access goes through hooks — never import JSON directly in a component:
- `useFilteredGameData()` — filtered lists (races, classes, backgrounds, spells, feats, items)
- `useGameDataStore()` — raw store
- Named hooks: `useHitPoints`, `useSkills`, `useSpellSlots`, `useEquipment`, etc.

### 5. Business logic belongs in `src/lib/` — search before writing
All business logic (modifiers, costs, slots, bonuses, prereq checks, AC, HP) goes in `src/lib/` as pure functions with no React/Zustand imports. **Search before writing** — the function may already exist.

Start with these common locations:
- `src/lib/5etools/parsers.ts` / `src/lib/5etools/filters.ts`
- `src/lib/skills.ts` / `src/lib/abilityScores.ts`
- `src/lib/characterUtils.ts` / `src/lib/gameRules.ts`
- `src/lib/prerequisites.ts` / `src/lib/spellSlots.ts`

Hooks in `src/hooks/` should remain thin wrappers that connect lib functions to state.

### 6. Derive, don't store (except mutable runtime state)
Do not persist pure derived values on the character object; derive them on demand:
```tsx
// ✅ const profBonus = getProficiencyBonus(getTotalLevel(character.classProgression))
// ❌ character.proficiencyBonus  ← stale
```

Do persist mutable gameplay state that cannot be recomputed from static inputs alone (for example: current HP, temporary HP, spell slot usage, per-rest counters, user overrides).

Purely derived values should remain derived: proficiency bonus, ability modifiers, passive totals, computed AC when not overridden, and other deterministic calculations.

### 7. All character mutations through the store
All writes go through `updateCharacter(id, patch)` from `useCharacterStore`. Never mutate state directly.

### 8. UI stack
- **Modals/overlays**: Radix `Dialog`, `Tooltip`, `Select`, `DropdownMenu`
- **Notifications**: `toast()` from Sonner — no `alert()` or custom toasts
- **Styles**: Tailwind first. Avoid inline styles for static presentation.
	- Allowed `style` usage: dynamic runtime values that cannot be represented cleanly with Tailwind classes alone (for example CSS variables for Radix primitives, transform values, runtime widths/heights, dynamic background images).
	- Not allowed: replacing ordinary static class-based styling with inline style objects.
	- Use `cn()` for conditional classes.

### 9. Always use `renderEntry` for 5etools content
Never render raw JSON to the user. All entry content goes through `renderEntry()` / `FormattedTextRenderer` from `src/lib/renderer.ts`.

### 10. Content pages use max-width container
Settings, Compendium, and all Details sub-nav pages should use a centered `max-w-7xl` container and full-width card content by default:
```tsx
<div className="max-w-7xl mx-auto w-full"><Card className="w-full">...</Card></div>
```

Equivalent wrapper structure is acceptable if it preserves the same layout behavior.
Exceptions: character cards, sidebar, Portrait page (full-bleed).

### 11. Lint and fix after every change
Linting is enforced automatically via Copilot hooks (Biome).

- Do not bypass or disable hook-driven linting.
- After every edit, run the fix/check/type sequence and re-run until clean.
- Do not move to the next plan step while any warning or error remains.
- If hooks fail or diagnostics remain, fix issues manually before continuing.
- Stop after 3 unsuccessful fix attempts for the same file and report the blocker.

### 12. Comments, docs, and tests
- **Inline comments**: only when code is not self-documenting. Prefer clear names over comments.
- **JSDoc**: only on public functions, public classes, and exported types.
- **Tests**: every new feature must include relevant unit and/or E2E coverage.

### 13. Automated enforcement (Copilot hooks)

This repository uses Copilot hooks to enforce:
- Linting and formatting
- Type safety checks
- Test execution
- Protected file boundaries

Workflow and escalation behavior are defined in Rule 11; follow that quality gate before proceeding.