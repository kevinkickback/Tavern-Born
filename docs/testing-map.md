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
- Spell profile/multiclass spellcasting calculations in src/lib/calculations/spellProfiles.ts
- Character utilities and rules in src/lib/characterUtils.ts and src/lib/calculations/gameRules.ts
- 5etools modules in src/lib/5etools/* (dataLoader, parsers, classData, filters, lookups, validator)
- Renderer output in src/lib/renderer.ts
- Provenance ledger/reconciliation modules
- Provenance section row routing helper in src/lib/provenance/sectionRows.ts
- Provenance composed hooks in src/hooks/character/useProvenance*.ts
- Zustand stores in src/store/*
- Character persistence schema validation in tests/lib/characterSchema.test.ts
- Character payload validation and rehydrate safety in tests/store/characterStore.test.ts
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
- Import workflow integration (valid + invalid character payloads) in tests/integration/homePageWorkflows.test.tsx
- Portrait preview rendering and wizard preview wiring in tests/integration/portraitCardPreview.test.tsx and tests/integration/basicsStepPortraitPreview.test.tsx
- Spell hook behavior coverage in tests/hooks/useSpellSlots.test.tsx (add/remove spells, profile management, prepared toggles)
- Schema migrations in src/lib/schema/migrations.ts with dedicated unit coverage in tests/lib/migrations.test.ts
- Full spell workflow integration tests in tests/integration/spellManagement.test.ts (create/save/load cycle, multiclass slots, profile syncing)
- Spell page E2E no-character scenarios in tests/e2e/spells.spec.ts
- Basic E2E startup/navigation smoke
- Spell page no-character E2E baseline in tests/e2e/spells.spec.ts
- Character lifecycle E2E (import -> portrait edit -> save -> reload) in tests/e2e/lifecycle.spec.ts
- Active-character spell workflow E2E (profile switching, add/remove, prepared toggle) in tests/e2e/spells-active.spec.ts

## High-Priority Gaps

1. **Broader provenance reconciliation**: Coverage for all grant pathways and multiclass profile interactions.
2. **Ingestion integration**: Real-world 5etools structure validation and error-path testing.
3. **Error-path tests**: Malformed JSON, missing resources, corrupted character recovery.

## Test Coverage by Layer

| Layer | Actual | Aspirational | Notes |
|-------|--------|--------------|-------|
| Calculations (lib) | ✅ Excellent | ✅ Complete | 34+ unit tests, all passing |
| Stores | ✅ Good | ✅ Good | Validation, rehydrate safety tested |
| Hooks (char) | ✅ Good | ⚠️ Growing | Spell hooks expanded; more coverage needed for UI-dependent hooks |
| Spell workflows | ✅ Good | ✅ Good | Unit/integration + active-character E2E coverage now in place |
| Provenance | ✅ Good | ⚠️ Needs expansion | Core logic tested; multiclass reconciliation gaps remain |
| Pages/Components | ⚠️ Minimal | ⚠️ Minimal | Mostly snapshot/smoke tested; full interaction E2E planned |
| Schema migrations | ✅ Good | ✅ Good | Dedicated unit coverage in tests/lib/migrations.test.ts |

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
- Handle startup data-source prompts deterministically by seeding cache/config in test setup when no source is configured.

## Definition of Done for New Features

- Behavior tests added in appropriate layer.
- Existing tests still pass.
- Lint passes.
- Any architecture-impacting behavior updates docs in this folder.
