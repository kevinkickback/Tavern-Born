# State Management

This document defines state ownership, mutation rules, and persistence behavior.

## Stores

1. Character store
- File: src/store/characterStore.ts
- Owns: characters collection, activeCharacterId, activeCharacter draft.
- Primary write API: updateCharacter(id, patch).
- Save API: awaitable `saveActiveCharacter()`; callers report success only after IndexedDB confirms
  the persisted character snapshot.

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
- Character store persistence includes the supported `characters` collection and the raw
  `unsupportedCharacters` quarantine; startup always begins with no active character selected.
  Unsupported records remain durable but hidden from the character list until the compatibility
  dialog is acknowledged, so closing the app cannot destroy the user's only exportable copy.
- `characterPersistenceSchema` is the normalized persistence-output authority. Its compile-time
  contract requires every parsed output to be assignable to the runtime `Character` type. The
  reverse direction is intentionally broader because draft/import inputs may contain partial
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
- Saving keeps the draft dirty while persistence is pending. A rejected write restores the prior
  saved snapshot and leaves the draft recoverable for retry; edits made during a pending save remain
  dirty after the earlier revision succeeds.
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
- session state: `inspiration`, `deathSaves`, `conditions`, `exhaustion`, per-class `hitDiceUsed`, `ritualCasting`, `classResources`

Derived examples (do not store as canonical):
- proficiency bonus
- ability modifiers
- passive values
- calculated and effective maximum HP
- calculated and effective AC
- spell display casing, which resolves from canonical parsed spell entities while stored reference
  tokens remain stable for provenance and profile matching

## Proficiency State Model

- `character.proficiencies` is the canonical persisted list model for armor, weapons, tools, skills, skill expertise, languages, and saving throw proficiencies.
- `character.proficiencies.skills` is required and stores the set of proficient skill names.
- `character.proficiencies.expertise` is required and stores the subset of those skills with expertise.
- `reconcileSkillExpertise()` removes expertise when its underlying proficiency is removed. Numeric skill adjustments belong to typed effects rather than a second skill-state mirror.

## Unsaved Changes and App Close Safety

- `hasUnsavedChanges()` is O(1): user mutations set the transient
  `isActiveCharacterDirty` flag, a durable save of the current draft revision clears it, and
  clean-draft reconciliation preserves the clean state. Pending or rejected saves remain dirty, and
  reconciliation never clears an existing dirty state. Timestamp comparison also catches imported
  or directly injected state.
- src/main.tsx syncs unsaved state to Electron.
- electron/main.ts shows close confirmation when unsaved edits exist.
- App preferences and home-page layout changes do not participate in character dirty-state tracking.

## Library Copy and Character Transfers

`src/lib/character/characterTransfer.ts` owns duplicate policy as a pure transformation. Duplicate
deep-clones the complete saved character and replaces its ID, collision-free copy name, and
timestamps. Selecting Duplicate from either character-library view performs this operation
immediately; the copy does not share nested state with its source.

File transfer exports the complete character as `.tbc`; import also permits generic `.json` files
and validates either extension through the same character schema before adding it to the store.
There is no separate template envelope, reset-copy mode, or template import/export path.

## Dirty State and lastModified Timestamps

**Design Pattern:** Explicit transient dirty state determines whether the active draft has unsaved
user edits. `lastModified` remains persisted metadata for display and sorting.

### Why This Works

Every user mutation path (`updateCharacter`, `updateActiveCharacter`, and
`updateActiveCharacterDetails`) updates `lastModified` and marks the active draft dirty. Saving stages
the draft in `characters[]`, awaits that exact persistence write, then clears the flag only when the
active draft revision has not changed. A failed write restores the previous saved snapshot.
`reconcileCharacter()` is reserved for silent system corrections and writes the draft and persisted
copy atomically without creating an unsaved edit.

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
- All class identity, subclass identity, and level reads derive from `classProgression`; no top-level
  mirrors are persisted.
- Feats awarded by class `featProgression` blocks are stored in `character.classFeatChoices`, keyed
  by full class printing and progression identity. Their slot levels allow level-down and class
  removal to retract only the affected choices. `character.specialFeats` is reserved for unscoped
  bonus feats.
- Other normalized class choices are stored in `character.classChoiceSelections`. Every selected
  option retains its source-qualified entity identity and the class level that supplied its slot,
  so level-down and class removal retract only unavailable slots without requiring game data during
  the state transition. Retained options keep that original slot when later choices are added or
  the catalog is reordered; newly selected options receive the remaining earned slots. The
  class-page choice controller resolves each descriptor against character-filtered catalogs and the
  owning-class level, including level-gated table options, and projects explicit availability.
  Retained unavailable references stay
  visible so the user can understand and replace them, but they are not initialized as selected and
  do not count toward the required selection total. The controller writes
  through `useClassProvenanceMutations`. Class-feature and optional-feature options are also
  materialized in `character.features` with choice-ID provenance; replacement, level-down, and
  class removal rebuild those grants atomically. Feat and item options remain persisted selections
  until their dedicated domain handlers can apply setup and effects without guessing semantics.
- `applyClassProgressionUpdate()` owns level-down reconciliation. It retracts spell grants earned at
  removed levels, reverses `spellSwaps` above the retained class level in descending event order, and
  prunes those events before returning one atomic spell/provenance patch.
- Subclass selection changes only the source-qualified subclass identity on its owning progression
  entry. It never runs base-class replacement reconciliation; class grants remain owned by the
  unchanged class printing.

## Spell State Model

- Canonical spell state is now profile-based under `character.spells.spellProfiles`.
- Class profiles are keyed by `class:<name>|<source>` and hold class-owned cantrips/spells/prepared flags.
- Profile spell collections store compact string references. New selections use `Name|Source` so
  the chosen catalog printing can be resolved exactly, while equality and choice quotas use one
  normalized, case-insensitive spell-name key. Two printings with the same normalized name therefore
  remain one logical profile entry without discarding the selected source.
- Class-page display and selection code resolves those references through the same source-qualified
  lookup before reading spell level, school, or rules text. It does not maintain a parallel
  name-only spell map.
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
- Subclass spell projection may deduplicate a display entry with an independently class-owned spell,
  but reconciliation consults that class provenance before retracting the previous fixed grant. The
  independent cantrip or spell therefore survives subclass replacement, removal, and level loss.
- Attribution may be exact (class page level picker) or inferred (spells page lowest-eligible assignment).
- Class-page per-level spell displays are derived from provenance attribution metadata.
- Class-page spell edits replace only the exact choices owned by the edited class level. The spell
  profile and provenance ledger are committed by one command, while choices from other levels and
  profile entries without level attribution remain intact.
- Replacement-only class levels remain present in the class-page choice model even when they grant no
  new picks. The Replace control and modal share one eligibility calculation, including the
  non-fixed-profile consistency fallback, so the control cannot open into a silent no-op. Source
  readiness compares selected references with the catalog through the same normalized,
  case-insensitive name identity used by spell profiles.
- Spell replacements remain recorded against the class level that granted each opportunity so level
  rollback can reverse them safely. Replacement candidates use the character's current class-level
  spell eligibility, and the control remains hidden until that level's required new spell choices
  are complete and a replaceable known spell exists.
- Subclass-owned spellcasting progressions are overlaid on their base class for class-page choices
  and Review validation. Review derives an absent class profile before checking quotas, so selecting
  a spellcasting subclass produces actionable cantrip/spell requirements instead of a missing-profile
  error.
- Multiclass slot derivation follows 5e caster progression rules, including Artificer using ceiling half-caster contribution.
- Shared spell-slot maxima come from parsed PHB/XPHB full-caster progression rows. A progression containing any 2024 class uses the XPHB table; otherwise it uses PHB. Missing canonical rows produce no synthetic slots and are reported during development.
- This is a hard cutover model; legacy spell arrays and `spellsByLevel` are not used.

Ability-score method labels and explanations are derived from the character's selected
`CORE_RULES_METADATA` record. The wizard and Rules page consume the same view-neutral descriptors,
so displayed point-buy limits and standard-array values follow the selected origin system.

Persisted `character.abilityScores` are raw allocated scores, with a documented temporary
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

## Character Schema Versioning

**File:** `src/lib/schema/characterSchemaVersion.ts`

The app supports exactly one character format. Import and IndexedDB hydration validate records
against the strict current schema; records with an older or newer version are rejected rather than
transformed. Hydration removes incompatible or malformed records from the active library and exposes
them to the Home page so the tester can choose whether to export them before acknowledging the
change. Original rejected payloads remain in the persisted quarantine until a blocking Home-page
dialog is acknowledged, allowing the tester to export unchanged `.tbc` backups for recovery or use
with a compatible older version. The sanitized character collection is the only active collection
persisted after hydration.

For a breaking character-format change, update the version constant, type, strict schema, factory,
fixtures, and store tests in the same change. Do not add migrations, downgrade handlers,
compatibility mirrors, or alternate readers while this pre-1.0 policy is active.

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
- `useSpellProfileMutations()` provides all spell mutation callbacks (add/remove/prepare/racial spells) for components that need spell writes outside the spell slot derivation hook. Racial choice confirmation replaces the complete selected set through one command and one provenance patch; components never sequence per-spell writes from a stale render snapshot.
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

Spellcasting detail keeps three capacities distinct: cantrips selected, leveled spells selected or
recorded in a spellbook, and spells prepared. Explicit known/fixed progression owns the selectable
spell total even when a class also has a smaller preparation limit; level-only prepared casters use
their prepared progression as the selection total, while daily prepared casters without a spellbook
have no finite known-spell total. Review and Spells-page completion counts are case-insensitive and
exclude fixed class/subclass grants from player-choice quotas. Always-prepared grants do not consume
the preparation limit.

Spell profile arrays may contain lowercase 5etools reference tokens from race or subclass grants.
Spell-page presentation resolves those tokens against parsed spell data and displays the canonical
entity name; unresolved references receive a consistent title-case fallback without rewriting
persisted identity.

### Hit Point Ownership Model

**Persisted state:**
- `character.hitPoints.current` and `character.hitPoints.temporary` are mutable play state.
- `character.hitPointGains[]` stores the raw hit-die result and method for each character level after level 1. Constitution is applied when HP is calculated, not frozen into the record.
- `character.hitPointAdjustments[]` stores labeled, manual flat or per-character-level bonuses and penalties.
- `character.maxHitPointsOverride` optionally replaces the calculated maximum exactly.
- `character.hitPointsInitialized` distinguishes a deliberate current HP value of 0 from an uninitialized current value.

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

`applyLevelUp()` in `classCommands.ts` commits progression, the raw hit-die choice, and current HP
together. A completed level-up sets current HP to the newly resolved maximum while preserving
temporary HP.
Removing levels prunes gain records and class-owned ASI choices that no longer belong to the
retained progression, rebuilding ASI provenance in the same command result. Average Hit Points
records the fixed average automatically unless explicitly disabled; when disabled, `LevelUpModal`
requires either a die roll or a valid manual die result.

Consumers read maximum HP through `getEffectiveMaxHP()` or `useHitPoints()`.

### Actions and Effects Overview Ownership

The Actions & Effects page is a projection, not a second owner of source data. It combines
`useCharacterActions()` output and the calculation context's typed effect declarations into
read-only source rows. Equipment state determines whether weapon actions and item effects are
active; known-caster and level-only-prepared spell selections are active without a separate daily
preparation step, while daily prepared casters still require the spell in `preparedSpells`. Race,
class, feat, and spell actions remain owned by their respective builder workflows.
Only `character.manualActions[]` and `character.manualEffects[]` can be created, edited, or removed
from this page. The split workbench places those forms on the left and the complete current lists on
the right without changing ownership or introducing a parallel mutation path.

An incomplete 2024 background ability assignment has no materialized ability-bonus grant yet.
Ability Scores therefore derives its pending Sources row from the selected background's parsed
ability blocks and the persisted selection fields. This row is view-only; completed selections
continue to materialize normal provenance records through the background ability command.

### Armor Class Ownership Model

**Current State:**
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
- `character.classProgression[]` — the source-qualified array of `{ name, source, levels, subclass?, subclassSource? }`

**Current Approach:** `character.classProgression` is the only progression structure for level math and class-driven derivation.

**Mutation Workflow:**
- Domain commands in `src/lib/character/commands/classCommands.ts` coordinate progression updates.
- `useUnifiedClassSelection()` and Level Up flows use the command layer instead of the deleted patch-builder path.
- Class identity, provenance, proficiencies, skills, and equipment are consolidated in `applyClassSelectionCommand`.

**Schema:** `characterSchema` requires source-qualified progression entries and rejects obsolete top-level mirrors.

### Class Page Controllers

`BuildClassPage` is a route compositor. Focused hooks under `src/pages/build/class/hooks/` own
subclass selection, progression spell choices, ASI/feat choices, and optional-feature choices.
These hooks expose derived view state and command-backed actions; route code must not reconstruct
their game rules or sequence domain writes.
