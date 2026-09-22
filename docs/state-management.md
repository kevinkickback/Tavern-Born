# State Management

This document defines ownership and mutation contracts. Implementation-specific behavior should be
verified in the owning store, command, and tests.

## Stores

| Store | Owns | Primary entry points |
| --- | --- | --- |
| Character | Saved library, active draft, quarantine, dirty/save lifecycle | `characterStore.ts` |
| Game data | Parsed catalog, configuration, load/cache status | `gameDataStore.ts` |
| Preferences | Theme, home-card size, update preference, UI settings | `appPreferencesStore.ts` |

Zustand persistence uses `src/lib/storage/idb-storage.ts`. Parsed game data has its own cache in
`dataCache.ts`. Accordion/sidebar collapse state uses local storage, and Electron stores native
window bounds separately.

## Character write APIs

| API | Use |
| --- | --- |
| `updateCharacter(id, patch)` | Preferred user edit when the character ID is known. |
| `updateActiveCharacter(patch)` | Active-character page without an explicit ID. |
| `updateActiveCharacterDetails(patch)` | Patch only the `details` object. |
| `reconcileCharacter(id, patch)` | Silent system correction; never a user edit. |

Never mutate a character object directly. User mutations update `lastModified` and set transient
dirty state. Reconciliation writes both clean snapshots when possible and never clears an already
dirty draft.

`saveActiveCharacter()` is awaitable. It keeps the draft dirty until the exact staged revision is
durable, restores the prior saved snapshot on failure, and does not mark later edits as saved.

## Stored versus derived

Persist values the player or play session can change:

- allocated ability scores and source-qualified choices;
- class progression, hit-die results, current/temp HP;
- HP/AC adjustments and explicit overrides;
- spell profile selections and shared/Pact slot usage;
- inventory, currency, conditions, exhaustion, resource/hit-die use;
- character narrative/details and manual actions/effects;
- provenance needed to reverse grants.

Derive values that follow deterministically from current state and game data:

- effective scores/modifiers, proficiency bonus, skills, saves, passives;
- maximum HP, effective AC, movement, carrying capacity;
- spell slots maxima, spell DC/attack, readiness, action projections;
- resolved source text and display casing.

Do not add a persisted field merely to make rendering easier.

## Calculation context

`CharacterCalculationContext` is the pure shared boundary for resolved race/subrace, background,
classes/subclasses, feats, equipment, rules metadata, typed effects, and effective ability scores.
React consumers use `useCharacterCalculationContext`.

Effective ability scores compose allocated scores, origin bonuses, class ASIs, feat choices, active
effects, then supported exact overrides. Each layer produces a fresh value. Readiness may inspect
allocated scores directly when validating allocation; ordinary UI/export code may not.

HP and AC management display calculation traces but do not own class or equipment mutations.
Carrying capacity, prerequisites, Review, actions, and PDFs consume the same effective values.

## Domain command contract

Pure commands under `src/lib/character/commands/` return the complete transition. When grants are
owned, the result includes both:

```ts
{
  characterPatch,
  provenanceUpdate,
}
```

Hooks gather dependencies and commit once. Commands own reset, replacement, level-down, and source
change semantics. Do not sequence a materialized write and a later provenance write.

## Class progression

`character.classProgression` is authoritative for class identity, subclass identity, level, and
multiclass math. There are no top-level class mirrors.

- Class feats retain source-qualified slot ownership in `classFeatChoices`.
- Other normalized class and subclass choices retain descriptor identity, source-qualified owner,
  and earned level in `classChoiceSelections`. Supported selections include class features,
  subclass features, optional features, feats, items, and creatures.
- Feat selections mirrored into `classFeatChoices` retain subclass ownership so a subclass change
  retracts both the normalized selection and its materialized feat state.
- Unavailable saved references remain visible for recovery but cannot satisfy a current quota.
- Optional-feature variant reconciliation scopes persisted choices against the complete loaded class
  catalog, but activates only choices that remain available after character source filtering.
- Level-down/class removal retracts choices, grants, ASIs, spells, and replacement events owned by
  removed levels.
- Subclass changes remove selections owned by the previous subclass while preserving choices owned
  by the base class. Materialized subclass-feature selections follow the same ownership boundary.

## Spell state

Canonical state lives in `character.spells.spellProfiles`.

- Class profiles use `class:<name>|<source>`; `special:unrestricted` owns bonus/manual spells.
- New selections store `Name|Source`. Equality and quotas use normalized case-insensitive spell
  names so alternate printings remain one logical selection.
- Fixed/always-prepared metadata is derived into profiles and protected by the mutation hook.
- Shared Spellcasting and Pact Magic use independent persisted usage maps.
- Slot maxima are derived from parsed class tables; usage is preserved and clamped when maxima fall.
- Class-page level choices and replacements update profile state, provenance, and replacement
  history atomically through spell commands.
- Replacement eligibility uses the character's current class spell access, while opportunities
  remain owned by the class level that granted them for safe rollback.

`useSpellSlots` is read-only. `useSpellProfileMutations` owns Spells-page writes.
`useSpellProvenanceMutations` exposes only class-page per-level selection/replacement adapters.

## Proficiencies and equipment

`character.proficiencies` is the canonical list model. Expertise must be a subset of skill
proficiency; `reconcileSkillExpertise()` removes invalid expertise.

Starting-equipment option keys and concrete generic-item choices are stored separately. Inventory
and equipment provenance change through the same equipment command. Derived AC and capacity read
equipped state; they are not copied into equipment records.

## Character transfers

`characterTransfer.ts` owns copy/import/export policy. Duplicate deep-clones the complete saved
record and changes only ID, collision-free name, and timestamps. `.tbc` export contains one complete
current character; import accepts `.tbc` or JSON and validates through the same compatibility path.

## Schema compatibility

The runtime supports exactly `CURRENT_CHARACTER_SCHEMA_VERSION`. Supported older records migrate
before strict validation; runtime feature code never branches on historical shapes. Current output
is normalized by `characterPersistenceSchema` before persistence.

For a breaking change, update together:

1. version constant;
2. `Character` type and strict schema;
3. `createEmptyCharacter` and fixtures;
4. sequential migration chain;
5. persistence/import/rejection tests.

Before 1.0, prefer a small migration. Reassess the accumulated chain at 1.0 rather than carrying
unbounded pre-release compatibility debt. Newer, malformed, and unsafe records go to the durable
exportable quarantine until acknowledged.

## Checklist for new state

1. Decide whether it is truly stored or derived.
2. Choose the owning command/store API.
3. Define defaults and strict validation if persisted.
4. Define provenance and reversal behavior if it grants anything.
5. Test success, replacement/removal, persistence, and failure/rollback where relevant.
