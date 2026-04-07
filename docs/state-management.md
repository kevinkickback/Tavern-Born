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

## Persistence

- Both stores persist with zustand/persist using IndexedDB adapter in src/lib/storage/idb-storage.ts.
- gameData payload itself is cached separately in src/lib/storage/dataCache.ts.
- gameDataStore persist payload intentionally keeps config/timestamps lightweight.
- UI collapse/expand state (accordion sections, sidebar panels) is persisted per-section key in src/lib/storage/collapseState.ts via localStorage.

## Character Mutation Contract

The character store exposes three write paths. Use the correct one for the context:

| Method | When to use |
|---|---|
| `updateCharacter(id, patch)` | Any component that holds an explicit character `id` (e.g. character list, class page, level-up modal). The standard and preferred path for most writes. |
| `updateActiveCharacter(patch)` | Components that are always scoped to the active character and don't have an explicit id (e.g. PortraitPage, detail sub-pages). Convenience wrapper around `updateCharacter` that fills in `activeCharacterId`. |
| `updateActiveCharacterDetails(patch)` | Same as above, but restricted to the `character.details` sub-object. Use in detail-editing pages (CharacteristicsPage, HistoryPage, AppearancePage, AlliesOrganizationsPage). |

Rules that apply to all three paths:
- Active character changes are draft updates until `saveActiveCharacter()` is called.
- Non-active character updates patch the persisted collection directly.
- No direct object mutation outside store reducers.

## Derived vs Stored Values

Stored examples (mutable runtime):
- current HP, temporary HP
- spell slot usage
- spell profile selections (class profiles + special unrestricted profile)
- user-entered detail fields and choices

Derived examples (do not store as canonical):
- proficiency bonus
- ability modifiers
- passive values
- computed AC when not explicitly overridden

## Unsaved Changes and App Close Safety

- hasUnsavedChanges compares active draft against persisted record (excluding timestamp-only changes).
- src/main.tsx syncs unsaved state to Electron.
- electron/main.ts shows close confirmation when unsaved edits exist.

## Hydration and Init Ordering

- Startup logic must wait for hasHydrated before cache/source branching.
- Avoid invoking data init assumptions before zustand rehydrate completes.

## Spell State Model

- Canonical spell state is now profile-based under `character.spells.spellProfiles`.
- Class profiles are keyed by `class:<name>|<source>` and hold class-owned cantrips/spells/prepared flags.
- The unrestricted profile is `special:unrestricted` and is always prepared by definition.
- Spell slots remain persisted in `character.spells.spellSlots` as mutable runtime usage state.
- Class-level spell source attribution is tracked in provenance spell source tags.
- Attribution may be exact (class page level picker) or inferred (spells page lowest-eligible assignment).
- Class-page per-level spell displays are derived from provenance attribution metadata.
- This is a hard cutover model; legacy spell arrays and `spellsByLevel` are not used.

## Implementation Checklist for State Changes

When adding new character state:
1. Add type fields in src/types/character.ts.
2. Define default in createEmptyCharacter.
3. Decide if field is persisted or derived.
4. Expose and consume through hooks when needed.
5. Add store/unit/integration tests.
