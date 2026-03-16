# Copilot Instructions

**These rules take precedence over convenience or creativity.**

---

## Non-Negotiables

### 1. Never edit files in `data/`

`data/` contains 5etools JSON files managed externally. Never modify them. All fixups go in source code (e.g. `src/lib/5etools/sourceFallbacks.ts`).

### 2. 5etools data is the single source of truth — never hardcode game data

Do not hardcode values that exist in the JSON data files. This includes multiclass ability score requirements, spell slot progression, hit dice, proficiency bonus tables, class features, prerequisites, spell schools, item types, and any other rules data. Always read it from the parsed game data.

If a value isn't currently being parsed out of the JSON, write the parser — don't hardcode the constant.

### 3. Unique React list keys — always `name|source`

Game data names are **not unique across sources**. All lists rendered from 5etools data must use a composite key:

```tsx
// ✅ Correct
items.map((i) => <SelectItem key={`${i.name}|${i.source ?? ''}`} value={i.name} />)
// ❌ Wrong
items.map((i) => <SelectItem key={i.name} value={i.name} />)
```

### 4. No game data access in components

All data access goes through hooks — never import JSON directly in a component:
- `useFilteredGameData()` — filtered lists (races, classes, backgrounds, spells, feats, items)
- `useGameDataStore()` — raw store
- Named hooks (`useHitPoints`, `useSkills`, `useSpellSlots`, `useEquipment`, etc.)

### 5. Pure functions in `src/lib/` — search before writing

All business logic (modifiers, costs, slots, bonuses, prereq checks, AC, HP) goes in `src/lib/` as pure functions with no React/Zustand imports. **Search before writing** — the function may already exist:

- `src/lib/5etools/parsers.ts` — parse raw 5etools JSON
- `src/lib/5etools/filters.ts` — `DataFilter` for filtering collections
- `src/lib/skills.ts` — skill/ability mappings and saving throw helpers
- `src/lib/abilityScores.ts` — score/modifier helpers
- `src/lib/characterUtils.ts` — `getTotalLevel()`, `getPrimaryClass()`, ASI counting
- `src/lib/gameRules.ts` — `getAbilityModifier()`, `getProficiencyBonus()`, `parseHitDice()`
- `src/lib/prerequisites.ts` — `checkAllPrerequisites()`
- `src/lib/spellSlots.ts` — spell slot progression

Hooks in `src/hooks/` are thin wrappers connecting these functions to state.

### 6. Derive, don't store

Never store computed values on the character object. Derive on demand:
```tsx
// ✅ const profBonus = getProficiencyBonus(getTotalLevel(character.classProgression))
// ❌ character.proficiencyBonus  ← stale
```
Computed values: proficiency bonus, ability modifiers, AC, HP, spell slots, skill/save modifiers.

### 7. All character mutations through the store

All writes go through `updateCharacter(id, patch)` from `useCharacterStore`. Never mutate state directly.

### 8. UI stack — no exceptions

- **Modals/overlays**: Radix `Dialog`, `Tooltip`, `Select`, `DropdownMenu`
- **Notifications**: `toast()` from Sonner — no `alert()` or custom toasts
- **Styles**: Tailwind only. No `style=` attributes, no `.style.*`, no dynamic `<style>`. Use `cn()` for conditionals. For dynamic CSS values (e.g. background image URL), use CSSOM with a `data-*` attribute.

### 9. Always use `renderEntry` for 5etools content

Never render raw JSON to the user. All entry content goes through `renderEntry()` / `FormattedTextRenderer` from `src/lib/renderer.ts`.

### 10. Content pages use max-width container

Settings, Compendium, and all Details sub-nav pages wrap cards in:
```tsx
<div className="max-w-7xl mx-auto w-full"><Card className="w-full">...</Card></div>
```
Exceptions: character cards, sidebar, Portrait page (full-bleed).

### 11. fizbanes-forge is a reference, not a copy source

Understand forge's logic and rewrite it in React/TypeScript idioms. Do not copy vanilla JS DOM manipulation, event buses, or mutable class methods.
