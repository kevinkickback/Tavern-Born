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

## Character Format Changes

Tavern-Born uses one strict runtime character format. For a breaking persisted-data change:

1. Increment `CURRENT_CHARACTER_SCHEMA_VERSION` in `src/lib/schema/characterSchemaVersion.ts`.
2. Update `Character`, `characterSchema`, and `createEmptyCharacter` together.
3. Add a pure, one-way migration from the previous supported format before strict validation.
4. Keep historical shapes out of runtime code and persist only the current format.
5. Test current-format persistence, every supported migration step, and rejection of newer,
   malformed, or safely unmigratable payloads.

Before 1.0, migration is preferred over invalidating characters. Do not add downgrade paths,
compatibility mirrors, or scattered old-shape fallbacks. At the 1.0 boundary, review the complete
pre-1.0 migration chain; if the schema has diverged substantially, it may be removed deliberately
rather than carrying disproportionate compatibility debt into the stable release. Any such cutoff
must retain export-before-removal recovery and be announced in advance.

## Review Readiness Checklist

- No edits under data/.
- No direct JSON access in components/pages.
- No new stale derived fields persisted on character.
- No orphan grant behavior introduced in provenance flows.
- Existing test suites pass for touched modules.
