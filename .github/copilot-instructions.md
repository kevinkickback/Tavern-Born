# Copilot Instructions

**These rules take precedence over convenience or creativity.**

---

## Non-Negotiables

### 1. Never edit `data/`
`data/` holds 5etools JSON files managed externally. Put all fixups in source (e.g. `src/lib/5etools/sourceFallbacks.ts`).

### 2. Never hardcode game data
Do not hardcode values that exist in the JSON files — multiclass requirements, spell slots, hit dice, proficiency tables, class features, prerequisites, spell schools, item types, etc. Always parse them from the data. If a value isn't parsed yet, write the parser.

### 3. List keys must be `name|source`
Names are not unique across sources. All lists from 5etools data use a composite key:
```tsx
// ✅ items.map((i) => <SelectItem key={`${i.name}|${i.source ?? ''}`} value={i.name} />)
// ❌ items.map((i) => <SelectItem key={i.name} value={i.name} />)
```

### 4. No game data access in components
All data access goes through hooks — never import JSON directly in a component:
- `useFilteredGameData()` — filtered lists (races, classes, backgrounds, spells, feats, items)
- `useGameDataStore()` — raw store
- Named hooks: `useHitPoints`, `useSkills`, `useSpellSlots`, `useEquipment`, etc.

### 5. Business logic belongs in `src/lib/` — search before writing
All business logic (modifiers, costs, slots, bonuses, prereq checks, AC, HP) goes in `src/lib/` as pure functions with no React/Zustand imports. **Search before writing** — the function may already exist:

| File | Contents |
|---|---|
| `src/lib/5etools/parsers.ts` | Parse raw 5etools JSON |
| `src/lib/5etools/filters.ts` | `DataFilter` for filtering collections |
| `src/lib/skills.ts` | Skill/ability mappings, saving throw helpers |
| `src/lib/abilityScores.ts` | Score/modifier helpers |
| `src/lib/characterUtils.ts` | `getTotalLevel()`, `getPrimaryClass()`, ASI counting |
| `src/lib/gameRules.ts` | `getAbilityModifier()`, `getProficiencyBonus()`, `parseHitDice()` |
| `src/lib/prerequisites.ts` | `checkAllPrerequisites()` |
| `src/lib/spellSlots.ts` | Spell slot progression |

Hooks in `src/hooks/` are thin wrappers connecting these functions to state.

### 6. Derive, don't store
Never persist computed values on the character object — derive them on demand:
```tsx
// ✅ const profBonus = getProficiencyBonus(getTotalLevel(character.classProgression))
// ❌ character.proficiencyBonus  ← stale
```
Computed: proficiency bonus, ability modifiers, AC, HP, spell slots, skill/save modifiers.

### 7. All character mutations through the store
All writes go through `updateCharacter(id, patch)` from `useCharacterStore`. Never mutate state directly.

### 8. UI stack — no exceptions
- **Modals/overlays**: Radix `Dialog`, `Tooltip`, `Select`, `DropdownMenu`
- **Notifications**: `toast()` from Sonner — no `alert()` or custom toasts
- **Styles**: Tailwind only. No `style=` attributes, no `.style.*`, no inline `<style>`. Use `cn()` for conditionals. For dynamic CSS values (e.g. background-image URL), use CSSOM via a `data-*` attribute.

### 9. Always use `renderEntry` for 5etools content
Never render raw JSON to the user. All entry content goes through `renderEntry()` / `FormattedTextRenderer` from `src/lib/renderer.ts`.

### 10. Content pages use max-width container
Settings, Compendium, and all Details sub-nav pages wrap cards in:
```tsx
<div className="max-w-7xl mx-auto w-full"><Card className="w-full">...</Card></div>
```
Exceptions: character cards, sidebar, Portrait page (full-bleed).

### 11. Lint and fix after every change
After any code change, run the linter and resolve all reported issues before considering the task done:
```bash
npm run lint
```
Do not leave lint errors or warnings introduced by your changes.

### 12. Comments, docs, and tests
- **Inline comments**: only when code is not self-documenting. Prefer clear names over comments.
- **JSDoc**: only on public functions, public classes, and exported types.
- **Tests**: every new feature must include relevant unit and/or E2E coverage.