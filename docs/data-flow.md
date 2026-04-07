# Data Flow

This document maps the major runtime flows in Tavern-Born.

## 1) Startup Initialization and Cache Selection

Entry points:
- src/main.tsx
- src/App.tsx
- src/hooks/data/useDataInit.ts

Flow:
1. App mounts and calls useDataInit().
2. Hook waits for gameDataStore hydration from IndexedDB (hasHydrated).
3. Hook reads data source config from gameDataStore and cache snapshot from dataCache.
4. Decision branch:
- No cache and no source: set cacheStatus to unconfigured.
- Cache and source, same source, fresh cache: serve cache immediately.
- Cache and source, same source, stale cache: serve cache and trigger background refresh.
- Cache and source, different source: fetch fresh and replace cache.
- Cache without source: serve offline cache and warn.
- Source without cache: fetch fresh.
5. On successful fetch, parsed gameData is written to cache and store.

## 2) Game Data Ingestion Pipeline

Entry points:
- src/store/gameDataStore.ts (loadGameData)
- src/lib/5etools/dataLoader.ts

Flow:
1. loadGameData starts foreground or background mode.
2. Loader reads required resources (books, races, classes, spells, feats, items, and others).
3. Parsed arrays are produced by parser functions in src/lib/5etools/parsers.ts.
4. Source list is built and lookup maps are created in src/lib/5etools/lookups.ts.
5. Store state is updated and cache metadata set to fetched.

Important behavior:
- Class index handling differs from spell index behavior; class index keys are slugs, not sources.
- Composite key lookups use name|source and are expected by downstream hooks.

## 3) Character Edit and Save Lifecycle

Entry points:
- src/store/characterStore.ts
- src/hooks/character/*
- src/pages/build/* and feature pages

Flow:
1. User activates a character, which hydrates activeCharacter from characters by id.
2. UI hooks derive display and computed values from activeCharacter.
3. Edits call updateCharacter(id, patch).
4. If id is activeCharacter, patch applies to in-memory draft.
5. saveActiveCharacter persists draft into characters array.
6. Persist middleware writes updated state to IndexedDB.

Validation behavior:
- Imported files are validated with full character-shape checks before addCharacter.
- Character store mutations coerce legacy payloads to the current runtime shape and validate against characterPersistenceSchema.
- Rehydrated characters from IndexedDB are validated and normalized; invalid records are dropped.
- Spell payloads are additionally checked against spellSelectionSchema for structural integrity.

Unsaved changes behavior:
- src/main.tsx syncs hasUnsavedChanges into Electron.
- electron/main.ts blocks close with a confirmation dialog when unsaved changes exist.

## 4) Provenance Application and Reconciliation

Entry points:
- src/lib/provenance/apply*.ts
- src/lib/provenance/reconciliation.ts
- src/lib/provenance/ledger.ts

Flow:
1. Selection changes (race/class/background/feat/optional feature) trigger grant application helpers.
2. Helpers mutate both character fields and provenance ledger tags.
3. Reconciliation removes prior-source grants when a source entity is changed.
4. Resulting character sheet stays aligned with source-attributed grants.

## 5) Content Rendering Flow

Entry points:
- src/lib/renderer.ts
- src/components/editor/FormattedTextRenderer.tsx

Flow:
1. UI passes 5etools entries into renderEntry.
2. Renderer recursively formats structured content and inline tags.
3. UI displays rendered output rather than raw JSON.

## 6) Character Schema Versioning and Migrations

Entry points:
- src/lib/schema/migrations.ts
- src/store/characterStore.ts (on rehydrate)

Flow:
1. Character.version field tracks the schema version of a saved character.
2. On rehydration from IndexedDB, migrateCharacter() is called with the character's version.
3. Migration registry applies up-migrations to bring character from its version to CURRENT_SCHEMA_VERSION.
4. If migration chain is broken or migration fails, character is rejected and logged.
5. Migrations are registered with up() and down() handlers for forward/backward compatibility.

Versioning strategy:
- Schema version is incremented only on **breaking changes** (added required fields, removed fields, restructured data).
- Non-breaking changes (new optional fields with defaults, enum expansions) don't require versioning.
- Migration handlers must be idempotent and testable.
- Downgrade support (down handlers) allows rolling back if needed.

Example breaking change requiring migration:
- Adding a required field without a safe default
- Restructuring a nested object that changes how data is accessed
- Removing a field that changes the interpretation of other fields

See docs/contributor-start-here.md for schema migration guidelines.


## Data Flow Invariants

- Mutable runtime state is persisted; pure derived values are computed on demand.
- Canonical game values come from parsed data, not ad hoc constants.
- Components should access game data through hooks/stores, not direct data imports.
