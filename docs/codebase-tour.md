# Codebase Tour

Use this routing table when deciding where to read or change code.

## Concern-to-Location Routing

App shell and routing:
- src/main.tsx
- src/App.tsx
- src/components/layout/*
- src/pages/*

Character state and lifecycle:
- src/store/characterStore.ts
- src/types/character.ts
- src/types/characterSchema.ts
- src/hooks/character/*

UI utilities:
- src/hooks/ui/useMobile.ts

Game data load and cache:
- src/store/gameDataStore.ts
- src/hooks/data/useDataInit.ts
- src/hooks/data/useFilteredGameData.ts
- src/hooks/data/useGameData.ts
- src/hooks/data/useAvailableProficiencies.ts
- src/hooks/data/useSeedData.ts
- src/lib/storage/dataCache.ts
- src/lib/storage/idb-storage.ts
- src/lib/storage/collapseState.ts

5etools parsing and filtering:
- src/lib/5etools/dataLoader.ts
- src/lib/5etools/parsers.ts
- src/lib/5etools/classData.ts
- src/lib/5etools/validator.ts
- src/lib/5etools/schemas.ts
- src/lib/5etools/lookups.ts
- src/lib/5etools/filters.ts
- src/lib/5etools/urlUtils.ts
- src/lib/5etools/sourceFallbacks.ts
- src/lib/5etools/index.ts

Game rules and derived calculations:
- src/lib/calculations/*
- src/lib/characterUtils.ts

Provenance and source attribution:
- src/lib/provenance/*
- src/components/provenance/*

5etools rich text rendering:
- src/lib/renderer.ts
- src/components/editor/FormattedTextRenderer.tsx

Settings and source configuration:
- src/pages/SettingsPage.tsx
- src/components/settings/*

Electron integration:
- electron/main.ts
- electron/preload.ts

## Fast Navigation Sequence

For most feature work, read in this order:
1. Route/page file in src/pages.
2. Related hook in src/hooks.
3. Underlying business logic in src/lib.
4. Store mutation flow in src/store if writes are involved.
5. Type definitions in src/types.

## Anti-Patterns to Avoid

- Putting canonical game logic in components.
- Reading JSON directly in components/pages.
- Adding non-emergency canonical constants instead of parser support.
- Bypassing character store mutation APIs.
