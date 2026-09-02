# Contributor Start Here

This guide is the fastest path to make safe changes in Tavern-Born.

## Read First

1. [.github/copilot-instructions.md](../.github/copilot-instructions.md)
2. [architecture-map.md](architecture-map.md)
3. [data-flow.md](data-flow.md)
4. [state-management.md](state-management.md)
5. [data-ingestion.md](data-ingestion.md)

## Core Files to Learn

1. src/main.tsx
2. src/App.tsx
3. electron/main.ts
4. src/store/characterStore.ts
5. src/store/gameDataStore.ts
6. src/store/appPreferencesStore.ts
7. src/lib/storage/dataCache.ts
8. src/hooks/data/useDataInit.ts
9. src/lib/5etools/dataLoader.ts
10. src/lib/5etools/parsers/index.ts
11. src/lib/5etools/validator.ts
12. src/types/5etools.ts
13. src/types/character.ts
14. src/lib/character/createCharacter.ts
15. src/lib/character/commands/*
16. src/lib/calculations/gameRules.ts
17. src/lib/provenance/types.ts
18. src/lib/provenance/ledger.ts
19. src/hooks/character/useProvenanceLedger.ts
20. src/pages/build/race/RacePage.tsx

## First-Change Checklist

- Confirm destination layer before coding (page, hook, lib, store, parser).
- Check whether similar logic already exists.
- Keep canonical game logic in parser/lib layers, not components.
- Use source-aware keys for 5etools entities.
- Route all character writes through the character store mutation API.
- Add or update tests.
- Run checks in proportion to the change. The full CI-equivalent sequence is:
  `npx biome ci .`, `npx tsc -b`, `npm run test:coverage`, `npm run test:e2e`, `npm run build`,
  then `npm run test:electron` against the build output.
- Note that `npm run lint` auto-formats and auto-fixes files; use `npx biome ci .` for a read-only check.
- If architecture or flow changed, update `docs/` in the same change.

## Schema Migrations

When making **breaking changes** to the character data format:

1. **Understand the migration system**: See `src/lib/schema/migrations.ts` and `docs/data-flow.md`.
2. **Increment `CURRENT_SCHEMA_VERSION`** by one in `migrations.ts`.
3. **Register both directions** from the previous version to the new version:
   ```typescript
   registerMigration({
     fromVersion: previousVersion,
     toVersion: nextVersion,
     up: (character) => { /* transform and stamp the next version */ },
     down: (character) => { /* reverse the transform and restore the previous version */ },
     description: 'Brief explanation of what changed',
   });
   ```
4. **Test migration**: Add to `tests/lib/migrations.test.ts`.
5. **Verify both entry points**: imported and IndexedDB-rehydrated characters pass through the
   character store's migration and validation pipeline.

### Example: Adding a Required Field

If you need to add `character.newField`, ensure:
- Migration `up` initializes `newField` with a sensible default
- Migration `down` removes `newField` for older clients
- Test backward compatibility: old → new → old

## Review Readiness Checklist

- No edits under data/.
- No direct JSON access in components/pages.
- No new stale derived fields persisted on character.
- No orphan grant behavior introduced in provenance flows.
- Existing test suites pass for touched modules.
