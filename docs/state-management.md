# State Management

This document defines state ownership, mutation rules, and persistence behavior.

## Stores

1. Character store
- File: src/store/characterStore.ts
- Owns: characters collection, activeCharacterId, activeCharacter draft.
- Primary write API: updateCharacter(id, patch).
- Save API: saveActiveCharacter().

2. Game data store
- File: src/store/gameDataStore.ts
- Owns: parsed gameData, source config, load progress, cache status, hydration flag.
- Primary write API: loadGameData(config, background?).
- Cache bootstrap API: loadFromCache() — reads IDB cache and runs the startup decision branch; returns { needsToast? } for UI callers to act on. UI notification logic stays in useDataInit.

3. App preferences store
- File: src/store/appPreferencesStore.ts
- Owns: theme selection, home card size, auto-update enabled toggle, and other UI preferences. Theme is configured in Settings; card size is configured via the slider on the home page; auto-update toggle is in Settings → General → Updates.
- Primary write API: store setter methods (`setThemeAccent`, `setThemeAppearance`, `setHomeCardSize`, `setAutoUpdate`).

## Persistence

- Both stores persist with zustand/persist using IndexedDB adapter in src/lib/storage/idb-storage.ts.
- The app preferences store also persists with zustand/persist using the same IndexedDB adapter.
- Character store persistence includes `characters` only; startup always begins with no active character selected.
- gameData payload itself is cached separately in src/lib/storage/dataCache.ts.
- gameDataStore persist payload intentionally keeps config/timestamps lightweight.
- UI collapse/expand state (accordion sections, sidebar panels) is persisted per-section key in src/lib/storage/collapseState.ts via localStorage.
- Theme root attributes are mirrored to localStorage for synchronous startup application before IndexedDB hydration completes.
- Desktop window bounds are stored separately by the Electron main process in a JSON file under `app.getPath('userData')`.

## Character Mutation Contract

The character store exposes three write paths. Use the correct one for the context:

| Method | When to use |
|---|---|
| `updateCharacter(id, patch)` | Any component that holds an explicit character `id` (e.g. character list, class page, level-up modal). The standard and preferred path for most writes. |
| `updateActiveCharacter(patch)` | Components that are always scoped to the active character and don't have an explicit id (e.g. PortraitPage, detail sub-pages). Convenience wrapper around `updateCharacter` that fills in `activeCharacterId`. |
| `updateActiveCharacterDetails(patch)` | Same as above, but restricted to the `character.details` sub-object. Use in detail-editing pages (CharacteristicsPage, BackstoryAppearancePage). |

Rules that apply to all three paths:
- Active character changes are draft updates until `saveActiveCharacter()` is called.
- Non-active character updates patch the persisted collection directly.
- No direct object mutation outside store reducers.

## Derived vs Stored Values

Stored examples (mutable runtime):
- current HP, temporary HP
- spell slot usage
- spell profile selections (class profiles + special unrestricted profile)
- selected origin system (`2014` or `2024`)
- user-entered detail fields and choices
- inventory currency counters (`cp`, `sp`, `ep`, `gp`, `pp`)
- selected background equipment options per block (`backgroundEquipmentChoices`)
- selected class equipment option per class source (`classEquipmentChoices`)
- race-applied trait state (`visions`, `damageResistances`, `damageImmunities`, `conditionImmunities`)
- session state: `inspiration`, `deathSaves`, `conditions`, `exhaustion`, `hitDiceUsed`, `ritualCasting`, `classResources`

Derived examples (do not store as canonical):
- proficiency bonus
- ability modifiers
- passive values
- computed AC when not explicitly overridden

## Proficiency State Model

- `character.proficiencies` is the canonical persisted list model for armor, weapons, tools, skills, languages, and saving throw proficiencies.
- `character.proficiencies.skills` is required and stores the set of proficient skill names.
- `character.skills` stores per-skill runtime detail (`proficient`, `expertise`, `bonus`) and must stay synchronized with `character.proficiencies.skills`.
- Both structures must be written together when skill proficiencies change. Use `mergeSkillState()` from `src/lib/calculations/skills.ts` to produce the combined patch. Missing `proficiencies.skills` is invalid current-schema data and is not silently repaired at runtime.

## Unsaved Changes and App Close Safety

- hasUnsavedChanges is backed by a store-maintained dirty flag and updated when active draft mutations occur.
- The dirty flag comparison excludes timestamp-only differences (`lastModified`).
- src/main.tsx syncs unsaved state to Electron.
- electron/main.ts shows close confirmation when unsaved edits exist.
- App preferences and home-page layout changes do not participate in character dirty-state tracking.

## lastModified Timestamp Management

**Design Pattern:** `lastModified` is updated in every character mutation but excluded from unsaved-change comparisons.

### Why This Works

`lastModified` serves **UI and UX** purposes only:
- Display on character cards (HomePage, PortraitCardPreview)
- Sort character lists by recent activity
- Show last-edit timestamp in the character sheet UI

It does **not** affect save/restore behavior because:
1. All character mutations call one of: `updateCharacter()`, `updateActiveCharacter()`, `updateActiveCharacterDetails()`, or `saveActiveCharacter()`.
2. Each of these **always** sets `lastModified = new Date().toISOString()`.
3. The `hasUnsavedChanges()` comparison intentionally **strips** `lastModified` before comparing:
   ```ts
   const { lastModified: _activeLastModified, ...activeComparable } = activeCharacter;
   const { lastModified: _savedLastModified, ...savedComparable } = persistedCharacter;
   return JSON.stringify(activeComparable) !== JSON.stringify(savedComparable);
   ```
4. This ensures that only **actual data changes** trigger the unsaved flag, not just timestamp drift.

### Implications for Future Changes

If you're modifying character mutations, be aware:
- Don't skip setting `lastModified` — the UI relies on it for sorting/display.
- Don't use `lastModified` to detect whether a character has unsaved changes — use `hasUnsavedChanges()` instead.
- If you add a new mutation path that bypasses the existing three, ensure it also sets `lastModified`.

## Hydration and Init Ordering

- Startup logic must wait for hasHydrated before cache/source branching.
- Avoid invoking data init assumptions before zustand rehydrate completes.

## Class Progression Model

- `character.classProgression` is the authoritative class progression structure for level math, multiclassing, and spell/feature derivation.
- Top-level `character.class`, `character.classSource`, and `character.level` remain persisted mirrors used for summary display and compatibility with existing UI surfaces.
- New code should derive progression-sensitive behavior from `classProgression`, not from the mirrored top-level fields.

## Spell State Model

- Canonical spell state is now profile-based under `character.spells.spellProfiles`.
- Class profiles are keyed by `class:<name>|<source>` and hold class-owned cantrips/spells/prepared flags.
- The unrestricted profile is `special:unrestricted` and is always prepared by definition.
- Spell slots remain persisted in `character.spells.spellSlots` as mutable runtime usage state.
- `character.spells.spellSlots` is stored as a numeric-keyed map (`1..9`) where each key is `{ max, used }`.
- Class-level spell source attribution is tracked in provenance spell source tags.
- Attribution may be exact (class page level picker) or inferred (spells page lowest-eligible assignment).
- Class-page per-level spell displays are derived from provenance attribution metadata.
- Multiclass slot derivation follows 5e caster progression rules, including Artificer using ceiling half-caster contribution.
- This is a hard cutover model; legacy spell arrays and `spellsByLevel` are not used.

## Implementation Checklist for State Changes

When adding new character state:
1. Add type fields in src/types/character.ts.
2. Define default in createEmptyCharacter.
3. Decide if field is persisted or derived.
4. Expose and consume through hooks when needed.
5. Add store/unit/integration tests.

Origin system note:
- `character.originSystem` is a required persisted field that controls whether origin ASIs and starting origin feats come from race (`2014`) or background (`2024`).
- New characters must choose it in the wizard rules step.
- Race/background provenance application must normalize selected content against `originSystem` before grants are applied.

## Character Schema Versioning and Migrations

**File:** `src/lib/schema/migrations.ts`

The migration system allows character data to be evolved safely across app versions while maintaining backwards compatibility.

### Schema Version Policy

Increment `CURRENT_SCHEMA_VERSION` and create a new migration when:

| Change Type | Example | Requires Migration? |
|---|---|---|
| **Breaking structural change** | Rename/remove/restructure required field | ✅ Yes — must handle old format |
| **New required field** | Add `spellProfiles` (v0 → v1) | ✅ Yes — must provide default or derive |
| **New optional field** | Add optional `customData?: string` | ❌ No — code handles undefined |
| **UI/display-only change** | Change `lastModified` format | ❌ No — doesn't affect app logic |
| **Additive field** | Add new proficiency category | ❌ No — existing data works as-is |
| **Internal restructure with same semantics** | Split one field into sub-object layers | ✅ Yes — must translate between formats |

### Creating a New Migration

1. **Increment version** in `src/lib/schema/migrations.ts`:
   ```ts
   export const CURRENT_SCHEMA_VERSION = 2; // was 1
   ```

2. **Register the migration**:
   ```ts
   registerMigration({
     fromVersion: 1,
     toVersion: 2,
     description: 'Add spellProfiles and sunset legacy spellsByLevel array',
     up: (character) => {
       const c = character as Record<string, unknown>;
       // Transform old structure to new structure
       return {
         ...c,
         spells: {
           spellProfiles: buildInitialProfiles(c),
           spellSlots: c.spellSlots,
           // legacy array no longer present
         },
       } as Character;
     },
     down: (character) => {
       // Reverse transformation for export/rollback
       const c = character as Record<string, unknown>;
       return {
         ...c,
         spells: {
           spellsByLevel: c.spells?.spellProfiles ?? {},
           spellSlots: c.spells?.spellSlots,
         },
       };
     },
   });
   ```

3. **Update type definitions** as needed:
   - `src/types/character.ts` — defines new structure
   - `src/types/characterSchema.ts` — Zod schema for validation
   - Make sure old data is considered invalid by the new schema (enforces migration)

4. **Ensure `migrateCharacter()` is called on load**:
   - Character import flow: `src/pages/HomePage.tsx:206`
   - Hydration from IndexedDB: automatic via `characterPersistenceSchema`

5. **Add tests** — see `tests/lib/schema/` for examples

### Migration Invariants

- **All migrations are chained**: app always starts at v0 (legacy) and runs all intermediate steps to reach current.
- **No skipping versions**: if v0→v1 and v2→v3 exist but v1→v2 is missing, the chain breaks and migration fails.
- **Both directions matter**: `up()` is used for import, `down()` is used for export/rollback.
- **Result must be valid**: migration output runs through schema validation; invalid results throw.

### Anti-Patterns

❌ Don't make breaking changes without incrementing the version  
❌ Don't assume old data structure on import — always migrate  
❌ Don't forget the `down()` path — breaks export/compatibility  
❌ Don't skip intermediate versions — will cause migration chain failures

## Current Domain Workflows

### Spell Mutation Workflow

**Current State:**
- `character.spells.spellProfiles[]` — canonical storage of known/prepared spells per class
- `character.provenance.spells` (ledger) — attribution/source tracking for spells

**Current Workflow:**
- Domain commands in `src/lib/character/commands/spellCommands.ts` coordinate profile updates and provenance ledger changes together.
- `useSpellSlots()` is the primary UI-facing hook and applies spell command results atomically to `character.spells` and `character.provenance`.
- `useSpellMutations()` is the thin adapter when command-backed spell mutations are needed outside the main spell hook.

**Caller Impact:** Controllers should route spell changes through the command-backed hooks rather than sequencing profile and provenance updates manually.
```typescript
// In page or modal code:
addSpellToProfile(profileId, name, 'spell')
// Command-backed hook updates both spell profiles and provenance together
```

**Schema/Persistence:** Spell profiles and provenance are still stored separately on the character, but normal mutation flows now update them together.

### Armor Class Ownership Model

**Current State:**
- `character.armorClass` — persisted synchronized AC value.
- `character.armorClassOverride` — optional manual override.
- Derived AC — calculated from equipment, armor type, dex cap, and ability scores when needed.
- `useArmorClass()` exposes calculated, stored, override, and effective AC views.

**Current Rules:**
1. Effective AC prefers manual override when present.
2. Equipment mutations synchronize `character.armorClass`.
3. Consumers should read AC through `computeEffectiveCharacterArmorClass()` or `useArmorClass()`.

**Current Behavior:** Equipment changes update stored AC, and UI/PDF consumers read the effective AC path instead of reading `character.armorClass` directly.

**Schema:** AC is a top-level field on character. No validation locks AC to a particular model.

### Class Progression State

**Current State:**
- `character.class`, `character.classSource` — top-level fields from legacy creation
- `character.subclass`, `character.subclassSource` — top-level fields from legacy creation
- `character.level` — top-level field
- `character.classProgression[]` — array of `{ name, source, levels, subclass?, subclassSource? }`

**Current Approach:** `character.classProgression` is the authoritative progression structure for level math and class-driven derivation. The top-level class fields remain persisted mirrors for summary/compatibility surfaces.

**Mutation Workflow:**
- Domain commands in `src/lib/character/commands/classCommands.ts` coordinate progression updates and mirrored top-level class fields.
- `useUnifiedClassSelection()` and Level Up flows use the command layer instead of the deleted patch-builder path.
- Class selection provenance orchestration is delegated through `src/lib/character/commands/classSelectionOrchestrationCommand.ts`.

**Schema:** characterSchema validates both, but doesn't enforce which is canonical during mutations.

Progression-sensitive reads use shared selectors across class page, model, and provenance callsites, while mirrored top-level fields remain as persisted compatibility data.
