# Contributor Start Here

This guide is the fastest path to make safe changes in Tavern-Born.

## Read First

1. .github/copilot-instructions.md
2. docs/architecture-map.md
3. docs/data-flow.md
4. docs/state-management.md
5. docs/data-ingestion.md

## First 20 Files to Learn

1. src/main.tsx
2. src/App.tsx
3. electron/main.ts
4. src/store/characterStore.ts
5. src/store/gameDataStore.ts
6. src/lib/storage/dataCache.ts
7. src/hooks/data/useDataInit.ts
8. src/lib/5etools/dataLoader.ts
9. src/lib/5etools/parsers.ts
10. src/lib/5etools/validator.ts
11. src/types/5etools.ts
12. src/types/character.ts
13. src/lib/characterUtils.ts
14. src/lib/calculations/gameRules.ts
15. src/lib/provenance/types.ts
16. src/lib/provenance/ledger.ts
17. src/lib/provenance/applyRaceGrants.ts
18. src/hooks/character/useAbilityScores.ts
19. src/pages/build/BuildRacePage.tsx
20. .github/copilot-instructions.md

## First-Change Checklist

- Confirm destination layer before coding (page, hook, lib, store, parser).
- Check whether similar logic already exists.
- Keep canonical game logic in parser/lib layers, not components.
- Use source-aware keys for 5etools entities.
- Route all character writes through the character store mutation API.
- Add or update tests.
- Run npm run lint.
- If architecture or flow changed, update docs in docs/ in the same change.

## Review Readiness Checklist

- No edits under data/.
- No direct JSON access in components/pages.
- No new stale derived fields persisted on character.
- No orphan grant behavior introduced in provenance flows.
- Existing test suites pass for touched modules.
