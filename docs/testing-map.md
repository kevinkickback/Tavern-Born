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
- Organizations parser coverage in tests/lib/5etools/parsers.test.ts (faction extraction from fluff backgrounds)
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
	- src/pages/build/class/model/pageUtils.ts
	- src/lib/character/commands/classCommands.ts
	- src/lib/character/commands/spellCommands.ts
	- src/pages/build/proficiencies/model/data.ts
	- src/pages/build/class/model/levelsUtils.ts
	- Grouped tool-choice expansion coverage (gaming set/musical instrument/artisan's tools/any-tool)
- Compendium entry shaping and filtering in src/lib/compendiumEntries.ts
- Integration workflows: home page, startup modals, level-up modal (tests/integration/*)
- Import workflow integration (valid + invalid character payloads) in tests/integration/homePageWorkflows.test.tsx
- Portrait preview rendering and wizard preview wiring in tests/integration/portraitCardPreview.test.tsx and tests/integration/basicsStepPortraitPreview.test.tsx
- Spell hook behavior coverage in tests/hooks/useSpellSlots.test.tsx (add/remove spells, profile management, prepared toggles)
- Command-layer spell and class coverage in tests/unit/spellCommands.test.ts and tests/unit/classCommands.test.ts
- Schema migrations in src/lib/schema/migrations.ts with dedicated unit coverage in tests/lib/migrations.test.ts
- Full spell workflow integration tests in tests/integration/spellManagement.test.ts (create/save/load cycle, multiclass slots, profile syncing)
- Current workflow coverage in tests/integration/spellOperations.test.tsx, tests/integration/multiclassUpdates.test.tsx, tests/integration/contentFiltering.test.tsx, and tests/integration/armorClass.test.tsx
- Spell page E2E no-character scenarios in tests/e2e/spells.spec.ts
- Basic E2E startup/navigation smoke
- Spell page no-character E2E coverage in tests/e2e/spells.spec.ts
- Character lifecycle E2E (import -> portrait edit -> save -> reload) in tests/e2e/lifecycle.spec.ts
- Active-character spell workflow E2E (profile switching, add/remove, prepared toggle) in tests/e2e/spells-active.spec.ts
- Startup cache-branch full coverage in tests/hooks/useDataInit.test.tsx (unconfigured, stale, fresh, offline, source-changed, direct-load)
- Provenance reconciliation edge cases in tests/lib/provenance/reconciliation.test.ts (mixed-source retention, background choice removal, multiclass-safe class reconciliation)
- Ingestion missing-file resilience in tests/lib/5etools/dataLoader.test.ts (continues when indexed class file returns 404)
- Ingestion malformed-payload resilience in tests/lib/5etools/dataLoader.test.ts (drops non-array entity payloads and malformed spell payloads without failing load)
- Ingestion empty-object payload resilience in tests/lib/5etools/dataLoader.test.ts (absent entity keys treated as empty collections)
- Ingestion partial spell index resilience in tests/lib/5etools/dataLoader.test.ts (valid spell files load when some indexed files are malformed)
- Ingestion null entity array resilience in tests/lib/5etools/dataLoader.test.ts (class files with null entity arrays handled gracefully)

## High-Priority Gaps

1. **Corrupted character recovery**: Import of invalid/schema-mismatched characters beyond the valid+invalid payload cases already covered.
2. **SpellProfileManager decomposition**: Large component (~783 lines); defer until next feature touch.
3. **FeatOptionsModal**: Multi-step feat-options wizard (~682 lines) has no dedicated test coverage. Add unit tests for step generation and selection persistence when next touched.
4. **Auto-update flow**: electron/updateManager.ts has no unit tests. Key logic to cover: portable detection, event forwarding, cancel-in-flight guard.

## Test Coverage by Layer

| Layer | Actual | Aspirational | Notes |
|-------|--------|--------------|-------|
| Calculations (lib) | ✅ Excellent | ✅ Complete | 34+ unit tests, all passing |
| Stores | ✅ Good | ✅ Good | Validation, rehydrate safety tested |
| Hooks (char) | ✅ Good | ⚠️ Growing | Spell hooks + startup data-init branch coverage; UI-dependent hooks still limited |
| Spell workflows | ✅ Good | ✅ Good | Unit/integration + active-character E2E coverage now in place |
| Provenance | ✅ Good | ✅ Good | Core logic + multiclass/mix-source edge cases tested |
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
