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
- Cache bootstrap API: loadFromCache() — reads IDB cache and runs the startup decision branch; returns an optional offline toast hint for UI callers. UI notification logic stays in useDataInit.

3. App preferences store
- File: src/store/appPreferencesStore.ts
- Owns: theme selection, home card size, auto-update enabled toggle, and other UI preferences. Theme is configured in Settings; card size is configured via the slider on the home page; auto-update toggle is in Settings → General → Updates.
- Primary write API: store setter methods (`setThemeAccent`, `setThemeAppearance`, `setHomeCardSize`, `setAutoUpdate`).

## Persistence

- All three Zustand stores persist with zustand/persist using the IndexedDB adapter in src/lib/storage/idb-storage.ts.
- Character store persistence includes `characters` only; startup always begins with no active character selected.
- `characterPersistenceSchema` is the normalized persistence-output authority. Its compile-time
  contract requires every parsed output to be assignable to the runtime `Character` type. The
  reverse direction is intentionally broader because draft/migration inputs may contain partial
  spell-slot maps; schema output fills every supported slot level before persistence.
- gameData payload itself is cached separately in src/lib/storage/dataCache.ts.
- gameDataStore persist payload intentionally keeps config/timestamps lightweight.
- UI collapse/expand state (accordion sections, sidebar panels) is persisted per-section key in src/lib/storage/collapseState.ts via localStorage.
- Theme root attributes are mirrored to localStorage for synchronous startup application before IndexedDB hydration completes.
- Desktop window bounds are stored separately by the Electron main process in a JSON file under `app.getPath('userData')`.

## Character Mutation Contract

The character store exposes four write paths. Use the correct one for the context:

| Method | When to use |
|---|---|
| `updateCharacter(id, patch)` | Any component that holds an explicit character `id` (e.g. character list, class page, level-up modal). The standard and preferred path for most writes. |
| `updateActiveCharacter(patch)` | Components that are always scoped to the active character and don't have an explicit id (e.g. PortraitPage, detail sub-pages). Convenience wrapper around `updateCharacter` that fills in `activeCharacterId`. |
| `updateActiveCharacterDetails(patch)` | Same as above, but restricted to the `character.details` sub-object. Use in detail-editing pages (CharacteristicsPage, BackstoryAppearancePage). |
| `reconcileCharacter(id, patch)` | Silent, non-user system corrections only. A clean draft receives the patch in both snapshots and stays clean; a dirty draft receives it only in memory and remains dirty until explicit Save. |

Rules that apply to the three user-edit paths:
- Active character changes are draft updates until `saveActiveCharacter()` is called.
- Non-active character updates patch the persisted collection directly.
- No direct object mutation outside store reducers.

## Derived vs Stored Values

Stored examples (mutable runtime):
- current HP, temporary HP
- raw per-level hit-die results (`hitPointGains`)
- lasting HP and AC adjustments, including negative values
- optional exact HP/AC overrides
- spell slot usage
- spell profile selections (class profiles + special unrestricted profile)
- selected origin system (`2014` or `2024`)
- user-entered detail fields and choices
- organization connection selection state (`organizationSelectionKey`, `organizationCustomName`, `organizationCustomDescription`, `organizationCustomImage`)
- inventory currency counters (`cp`, `sp`, `ep`, `gp`, `pp`)
- selected background equipment options per block (`backgroundEquipmentChoices`)
- selected concrete items for generic background equipment (`backgroundEquipmentItemChoices`)
- selected class equipment option per class source (`classEquipmentChoices`)
- selected concrete items for generic class equipment per class source (`classEquipmentItemChoices`)
- race-applied trait state (`visions`, `damageResistances`, `damageImmunities`, `conditionImmunities`)
- session state: `inspiration`, `deathSaves`, `conditions`, `exhaustion`, `hitDiceUsed`, `ritualCasting`, `classResources`

Derived examples (do not store as canonical):
- proficiency bonus
- ability modifiers
- passive values
- calculated and effective maximum HP
- calculated and effective AC
- spell display casing, which resolves from canonical parsed spell entities while stored reference
  tokens remain stable for provenance and profile matching

## Proficiency State Model

- `character.proficiencies` is the canonical persisted list model for armor, weapons, tools, skills, languages, and saving throw proficiencies.
- `character.proficiencies.skills` is required and stores the set of proficient skill names.
- `character.skills` stores per-skill runtime detail (`proficient`, `expertise`, `bonus`) and must stay synchronized with `character.proficiencies.skills`.
- Both structures must be written together when skill proficiencies change. Use `mergeSkillState()` from `src/lib/calculations/skills.ts` to produce the combined patch. Missing `proficiencies.skills` is invalid current-schema data and is not silently repaired at runtime.

## Unsaved Changes and App Close Safety

- `hasUnsavedChanges()` is O(1): user mutations set the transient
  `isActiveCharacterDirty` flag, saving clears it, and clean-draft reconciliation preserves the
  clean state. Reconciliation never clears an existing dirty state. Timestamp comparison remains as
  a compatibility safeguard for imported or injected state.
- src/main.tsx syncs unsaved state to Electron.
- electron/main.ts shows close confirmation when unsaved edits exist.
- App preferences and home-page layout changes do not participate in character dirty-state tracking.

## Library Copy and Character Transfers

`src/lib/character/characterTransfer.ts` owns copy/reset policy as pure transformations. An exact
duplicate deep-clones the saved character and replaces its ID, name, and timestamps. A reusable
build copy additionally resets current/temporary HP, conditions, exhaustion, inspiration, death
saves, hit-die use, class-resource use, and both spell-slot usage pools while retaining all
source-qualified build selections. Its class-resource map is cleared so the normal derived fallback
initializes every resource at full capacity.

File transfer exports the complete character as `.tbc`; import also permits generic `.json` files
and validates either extension through the same character schema before adding it to the store.
There is no separate template envelope or template import/export path. Users who want a reset copy
of an existing build can use the local reusable-build duplicate mode, which produces an independent
structured clone without creating a second file format.

## Dirty State and lastModified Timestamps

**Design Pattern:** Explicit transient dirty state determines whether the active draft has unsaved
user edits. `lastModified` remains persisted metadata for display, sorting, and compatibility.

### Why This Works

Every user mutation path (`updateCharacter`, `updateActiveCharacter`, and
`updateActiveCharacterDetails`) updates `lastModified` and marks the active draft dirty. Saving writes
the draft into `characters[]` and clears the flag. `reconcileCharacter()` is reserved for silent
system corrections and writes the draft and persisted copy atomically without creating an unsaved
edit.

`lastModified` also serves UI display purposes:
- Character cards (HomePage, PortraitCardPreview)
- Sort order by recent activity
- Last-edit timestamp in the character sheet UI

### Implications for Future Changes

- Don't skip setting `lastModified`; the UI uses it for display and sorting.
- New user mutation paths must set `isActiveCharacterDirty`; save/reconciliation paths must clear it.
- Keep the dirty flag transient and out of the persisted store payload.
- Don't replace the O(1) dirty/revision contract with deep equality.

## Hydration and Init Ordering

- Startup logic must wait for hasHydrated before cache/source branching.
- Avoid invoking data init assumptions before zustand rehydrate completes.

## Class Progression Model

- `character.classProgression` is the authoritative class progression structure for level math, multiclassing, and spell/feature derivation.
- Top-level `character.class`, `character.classSource`, and `character.level` remain persisted mirrors used for summary display and compatibility with existing UI surfaces.
- New code should derive progression-sensitive behavior from `classProgression`, not from the mirrored top-level fields.
- Feats awarded by class `featProgression` blocks are stored in `character.classFeatChoices`, keyed
  by full class printing and progression identity. Their slot levels allow level-down and class
  removal to retract only the affected choices. `character.specialFeats` is reserved for unscoped
  bonus feats.
- Other normalized class choices are stored in `character.classChoiceSelections`. Every selected
  option retains its source-qualified entity identity and the class level that supplied its slot,
  so level-down and class removal retract only unavailable slots without requiring game data during
  the state transition. The class-page choice controller resolves each descriptor against the
  character-filtered catalogs and writes an explicit availability state into the view projection.
  Retained unavailable references stay
  visible so the user can understand and replace them, but they are not initialized as selected and
  do not count toward the required selection total. The controller writes
  through `useClassProvenanceMutations`. Class-feature and optional-feature options are also
  materialized in `character.features` with choice-ID provenance; replacement, level-down, and
  class removal rebuild those grants atomically. Feat and item options remain persisted selections
  until their dedicated domain handlers can apply setup and effects without guessing semantics.

## Spell State Model

- Canonical spell state is now profile-based under `character.spells.spellProfiles`.
- Class profiles are keyed by `class:<name>|<source>` and hold class-owned cantrips/spells/prepared flags.
- Profile spell collections remain name strings for file compatibility. Equality is based on one
  normalized, case-insensitive spell-name key; source-qualified input selects the matching catalog
  row, while two printings with the same normalized name intentionally collapse to one profile entry.
- The unrestricted profile is `special:unrestricted` and is always prepared by definition.
- Shared Spellcasting and Pact Magic usage are persisted independently in
  `character.spells.spellSlots` and `character.spells.pactSpellSlots`. Both are numeric-keyed maps
  (`1..9`) whose entries are `{ max, used }`; separating the pools prevents a multiclass character's
  same-level Pact and shared slots from overwriting each other.
- Slot maxima are recalculated from class data and reconciled through the pure spell-slot command.
  Existing usage is preserved and clamped when a maximum falls, while newly gained capacity starts
  unused. Spend, restore, and manual-correction operations update only the selected pool.
- Manual slot restore buttons are corrections, not rest shortcuts. Short/long rest recovery runs
  through `applyRest()` and a preview dialog, then applies spells, class resources, hit dice, and HP
  in one `updateCharacter(id, patch)` call. The resulting draft still requires the normal Save action.
- Class-level spell source attribution is tracked in provenance spell source tags.
- Attribution may be exact (class page level picker) or inferred (spells page lowest-eligible assignment).
- Class-page per-level spell displays are derived from provenance attribution metadata.
- Multiclass slot derivation follows 5e caster progression rules, including Artificer using ceiling half-caster contribution.
- Shared spell-slot maxima come from parsed PHB/XPHB full-caster progression rows. A progression containing any 2024 class uses the XPHB table; otherwise it uses PHB. Missing canonical rows produce no synthetic slots and are reported during development.
- This is a hard cutover model; legacy spell arrays and `spellsByLevel` are not used.

Ability-score method labels and explanations are derived from the character's selected
`CORE_RULES_METADATA` record. The wizard and Rules page consume the same view-neutral descriptors,
so displayed point-buy limits and standard-array values follow the selected origin system.

Persisted `character.abilityScores` are raw allocated scores, with a documented compatibility
exception for reversible feat-option changes. Effective scores, modifiers, skills, saves, HP, AC,
carrying capacity, prerequisites, and spellcasting values are derived through
`CharacterCalculationContext` and are not persisted. See
[Character Calculation Context](calculation-context.md) for the composition order and complete
field-ownership table.

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
- Existing characters can review their ruleset and edit supported variant rules from `/rules`; changing the 2014/2024 ruleset itself is intentionally unsupported because it would require rebuilding origin and progression choices.
- Race/background provenance application must normalize selected content against `originSystem` before grants are applied.

## Character Schema Versioning and Migrations

**File:** `src/lib/schema/migrations.ts`

The current schema version is 10. Version 8 introduced typed manual effects, version 9 introduced
structured manual actions, and version 10 separates Pact Magic usage from shared spell-slot usage.
The v9→v10 downgrade removes the new pool without rewriting the legacy shared pool.

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

5. **Add tests** — see `tests/lib/migrations.test.ts` and `tests/lib/characterSchema.test.ts` for examples

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

### Character Command Contract

Pure domain transitions under `src/lib/character/commands/` return a complete
`{ characterPatch, provenanceUpdate }` result. A command owns identity fields, reset policy,
materialized fields, and provenance for its transition. React hooks only read state/dependencies and
apply the result through one `updateCharacter` call.

This contract also covers manual equipment add/remove/proficiency actions, class/background
starting-equipment choices, and optional-feature replacement. Batch choices accumulate all ledger
changes before the adapter performs one store write.

Initial creation uses `buildInitialCharacter` from `originSelectionCommand.ts`, which composes the
same race, class, and background commands used by editing flows over the shared pure character
factory in `src/lib/character/createCharacter.ts`.

### Spell Mutation Workflow

**Current State:**
- `character.spells.spellProfiles[]` — canonical storage of known/prepared spells per class
- `character.provenance.spells` (ledger) — attribution/source tracking for spells

**Current Workflow:**
- Domain commands in `src/lib/character/commands/spellCommands.ts` coordinate profile updates and provenance ledger changes together.
- `useSpellSlots()` is read-only and derives slots, profiles, and spellcasting detail.
- `useSpellProfileMutations()` provides all spell mutation callbacks (add/remove/prepare/racial spells) for components that need spell writes outside the spell slot derivation hook.
- `useSpellSlotMutations()` adapts the pure slot-use commands to the active-character draft.
- The Builder's Spellcasting details pane reads only derived slot capacity and exposes no slot-use
  controls. Persisted slot usage and its mutation adapter remain intentional runtime state for the
  deferred live-play workspace.
- `useRestPreview()` builds and commits the one-patch result from `applyRest()`; UI code never
  sequences individual recovery writes.

**Caller Impact:** Controllers should route spell changes through the command-backed hooks rather than sequencing profile and provenance updates manually.
```typescript
// In page or modal code:
addSpellToProfile(profileId, name, 'spell')
// Command-backed hook updates both spell profiles and provenance together
```

**Schema/Persistence:** Spell profiles and provenance are still stored separately on the character, but normal mutation flows now update them together.

Spell profile arrays may contain lowercase 5etools reference tokens from race or subclass grants.
Spell-page presentation resolves those tokens against parsed spell data and displays the canonical
entity name; unresolved references receive a consistent title-case fallback without rewriting
persisted identity.

### Hit Point Ownership Model

**Persisted state:**
- `character.hitPoints.current` and `character.hitPoints.temporary` are mutable play state. `hitPoints.max` is retained as a zeroed legacy container field.
- `character.hitPointGains[]` stores the raw hit-die result and method for each character level after level 1. Constitution is applied when HP is calculated, not frozen into the record.
- `character.hitPointAdjustments[]` stores labeled, manual flat or per-character-level bonuses and penalties.
- `character.maxHitPointsOverride` optionally replaces the calculated maximum exactly.
- `character.hitPointsInitialized` distinguishes a deliberate current HP value of 0 from an old character whose current HP was never initialized.

**Resolution order:**
1. Calculate class HP from the full first-level hit die and each later average or recorded die result, adding the current Constitution modifier per level and enforcing a minimum gain of 1 per level.
2. Apply manual flat/per-level adjustments and active typed effects; clamp the adjusted maximum to at least 1.
3. Use `maxHitPointsOverride` when present.

`useHitPoints()` is the UI boundary for these views and for current/temp HP mutations.
`HitPointsModal` shows the class/level/Constitution base and active typed item, feat, spell, or manual
effects without duplicating their ownership controls. It saves current HP, temporary HP, manual
adjustments, and an optional override atomically. Draft settings are resolved with the same source
effects and activation context as persisted reads before current HP is clamped. When the maximum
changes and the player has not manually edited Current HP in the open modal, the preview moves
Current HP by the same delta before saving.

`applyLevelUp()` in `classCommands.ts` commits progression and the raw hit-die choice together.
Removing levels prunes gain records and class-owned ASI choices that no longer belong to the
retained progression, rebuilding ASI provenance in the same command result. Average Hit Points
records the fixed average automatically unless explicitly disabled; when disabled, `LevelUpModal`
requires either a die roll or a valid manual die result.

Consumers should read maximum HP through `getEffectiveMaxHP()` or `useHitPoints()` rather than `hitPoints.max`.

### Actions and Effects Overview Ownership

The Actions & Effects page is a projection, not a second owner of source data. It combines
`useCharacterActions()` output and the calculation context's typed effect declarations into
read-only source rows. Equipment state determines whether weapon actions and item effects are
active; race, class, feat, and spell actions remain owned by their respective builder workflows.
Only `character.manualActions[]` and `character.manualEffects[]` can be created, edited, or removed
from this page. The split workbench places those forms on the left and the complete current lists on
the right without changing ownership or introducing a parallel mutation path.

An incomplete 2024 background ability assignment has no materialized ability-bonus grant yet.
Ability Scores therefore derives its pending Sources row from the selected background's parsed
ability blocks and the persisted selection fields. This row is view-only; completed selections
continue to materialize normal provenance records through the background ability command.

### Armor Class Ownership Model

**Current State:**
- `character.armorClass` — legacy migration compatibility only; it is not read for display or written by current flows.
- `character.armorClassAdjustments[]` — labeled, manual bonuses or penalties applied after equipment/Dexterity calculation.
- `character.armorClassOverride` — optional exact manual value.
- `useArmorClass()` exposes calculated, adjustment, adjusted, override, and effective AC views.

**Current Rules:**
1. Calculate AC live from equipped armor/shields and Dexterity.
2. Apply all manual and active typed adjustments and clamp the result to at least 0.
3. Prefer the exact override when present.
4. Consumers should read AC through `computeEffectiveCharacterArmorClass()` or `useArmorClass()`.

**Current Behavior:** Equipment and Dexterity changes flow through automatically. `ArmorClassModal`
shows equipped armor and shields as read-only calculation sources; equipping and unequipping remain
Equipment-route operations so one stat dialog cannot silently alter the inventory workflow. The
modal previews and saves manual adjustments through the same source-aware resolver and commits the
optional override atomically; manual amounts and labels
remain editable/removable without discarding the calculated base.

**Schema:** Adjustment amounts may be negative. Exact AC overrides must be whole numbers at least 0.

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
- Class identity, provenance, proficiencies, skills, and equipment are consolidated in `applyClassSelectionCommand`.

**Schema:** characterSchema validates both, but doesn't enforce which is canonical during mutations.

Progression-sensitive reads use shared selectors across class page, model, and provenance callsites, while mirrored top-level fields remain as persisted compatibility data.

### Class Page Controllers

`BuildClassPage` is a route compositor. Focused hooks under `src/pages/build/class/hooks/` own
subclass selection, progression spell choices, ASI/feat choices, and optional-feature choices.
These hooks expose derived view state and command-backed actions; route code must not reconstruct
their game rules or sequence domain writes.
