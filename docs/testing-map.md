# Testing Map

This document maps current test coverage and practical priorities for expansion.

## Tooling

- Unit and integration: Vitest
- E2E: Playwright
- Lint: Biome

Key scripts in package.json:
- npm run lint
- npm run test
- npm run test:e2e

## Current Coverage Areas

- Core calculations in src/lib/calculations/* (including spellUtils)
- Character utilities and rules in src/lib/characterUtils.ts and src/lib/calculations/gameRules.ts
- 5etools modules in src/lib/5etools/* (dataLoader, parsers, classData, filters, lookups, validator)
- Renderer output in src/lib/renderer.ts
- Provenance ledger/reconciliation modules
- Provenance section row routing helper in src/lib/provenance/sectionRows.ts
- Provenance composed hooks in src/hooks/character/useProvenance*.ts
- Zustand stores in src/store/*
- Build flow extracted helpers:
	- src/pages/build/ability-scores/model/data.ts
	- src/pages/build/class/model/asi.ts
	- src/pages/build/class/model/mutations.ts
	- src/pages/build/proficiencies/model/data.ts
	- src/pages/build/class/model/levelsUtils.ts
- Feat selection helpers:
	- src/pages/feats/model/selection.ts
- Compendium entry shaping and filtering in src/lib/compendiumEntries.ts
- Integration workflows: home page, startup modals, level-up modal (tests/integration/*)
- Portrait preview rendering and wizard preview wiring in tests/integration/portraitCardPreview.test.tsx and tests/integration/basicsStepPortraitPreview.test.tsx
- Basic E2E startup/navigation smoke

## High-Priority Gaps

1. Multiclass spell slot blending edge cases.
2. Save/reload persistence E2E for character lifecycle.
3. Broader provenance reconciliation coverage for all grant pathways.
4. Ingestion integration tests using representative real-world 5etools structures.
5. Error-path tests for malformed JSON and missing resource files.

## Practical Test Patterns

Store tests:
- Mock IndexedDB adapter module in test setup.
- Assert both draft behavior and save behavior for active character lifecycle.

Ingestion tests:
- Validate schema checks and parser outputs for each supported data family.
- Include index-file behavior checks for class vs spell index differences.

Hooks and derived state tests:
- Verify derived data remains derived and not redundantly persisted.
- Confirm source-filter behavior with allowedSources constraints.

E2E tests:
- Start with create -> edit -> save -> reload -> verify state.
- Add stale-cache startup flow checks where feasible.

## Definition of Done for New Features

- Behavior tests added in appropriate layer.
- Existing tests still pass.
- Lint passes.
- Any architecture-impacting behavior updates docs in this folder.
