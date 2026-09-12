# Testing Map

This document maps current test coverage and practical priorities for expansion.

## Tooling

- Unit and integration: Vitest
- E2E: Playwright
- Lint: Biome
- Coverage: V8 via Vitest, with baseline regression thresholds enforced in CI

Key scripts in package.json:
- npm run lint
- npm run test
- npm run test:coverage
- npm run test:e2e
- npm run test:electron (run after `npm run build`)

The current global coverage floor is 60% statements, 50% branches, 57% functions, and 63% lines.
These values are an honest ratchet based on the measured suite, not the long-term target; raise them as
new tests land and do not lower them to merge a change.

## Current Coverage Areas

- Core calculations in src/lib/calculations/* (including spellUtils)
- Spell profile/multiclass spellcasting calculations in src/lib/calculations/spellProfiles.ts
- Character utilities and rules in src/lib/characterUtils.ts and src/lib/calculations/gameRules.ts
- HP derivation and state coverage for fixed-average and recorded hit-die gains, Constitution recalculation, lasting flat/per-level adjustments, exact overrides, legacy initialization, and current/temp HP saves
- AC calculation and state coverage for equipment/Dexterity derivation, positive and negative lasting adjustments, exact overrides, and canonical effective reads
- 5etools modules in src/lib/5etools/* (dataLoader, parsers, classData, filters, lookups, validator)
- Composite-key entity resolver coverage, including filtered-primary/raw fallback, source collisions, deterministic source-less fallback, and nested subrace merging
- Organizations parser coverage in tests/lib/5etools/parsers.test.ts (faction extraction from fluff backgrounds)
- Renderer output in src/lib/renderer.ts
- Recursive tooltip builder, hook, and nested interaction coverage for explicit collection sets, stable source/name keys, `itemsBase`, multi-level tooltip chains, constrained-position staggering, and active-depth styling
- Provenance ledger/reconciliation modules
- Provenance section row routing helper in src/lib/provenance/sectionRows.ts
- Provenance composed hooks in src/hooks/character/useProvenance*.ts
- Zustand stores in src/store/*
- Character persistence schema validation in tests/lib/characterSchema.test.ts
- Named game-data lookup hook coverage for stable empty defaults and ingestion-built race/background/item/metadata/skill lookups
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
	- `formatWeaponCategoryLabel` weapon category key → display label
- Compendium entry shaping and filtering in src/lib/compendiumEntries.ts, including 5e / 5.5e / Both edition classification and composition with type, source, and text filters
- Equipment page detail rendering, recursive link tooltips, and persistent inventory headers in tests/integration/equipmentPage.test.tsx; base-item recursive lookup in tests/hooks/useRecursiveLookup.test.tsx
- Atomic equipment command coverage for add/remove/manual proficiency alignment, duplicate names, and retained source tags
- Armor-restriction reconciliation coverage for nonproficient armor, duplicate body/shield slots,
	legacy type-only armor records, and preservation of other equipped gear
- Wizard data-controller coverage for draft source filtering, implicit ruleset sources, reprint suppression, and raw fallback resolution
- Shared prerequisite snapshot and feat option-pool coverage, including multiclass progression and source collisions
- Subclass eligibility and class controller composition coverage for parsed/legacy restrictions, spell choices, ASI totals, and optional features
- Integration workflows: home page, startup modals, and level-up modal, including rolled/manual HP validation and persistence (tests/integration/*)
- Header HP/AC launch controls and one-time anchored hint coverage in tests/integration/appHeader.test.tsx
- HP and AC management modal coverage in tests/integration/hitPointsModal.test.tsx and tests/integration/armorClassModal.test.tsx
- Rules and Sources page behavior/layout coverage in tests/integration/rulesPage.test.tsx and tests/integration/sourcesPageLayout.test.tsx
- Conditions tab, data-driven rule text/tooltip, whole-card toggle, and exhaustion-state coverage in tests/integration/conditionsPage.test.tsx
- Characteristics page draft synchronization, immediate detail persistence, and legacy/custom/preset
	organization transitions in tests/integration/characteristicsPage.test.tsx
- Import workflow integration (valid + invalid character payloads) in tests/integration/homePageWorkflows.test.tsx
- Portrait preview rendering and wizard preview wiring in tests/integration/portraitCardPreview.test.tsx and tests/integration/basicsStepPortraitPreview.test.tsx
- Spell hook behavior coverage in tests/hooks/useSpellSlots.test.tsx (add/remove spells, profile management, prepared toggles)
- Command-layer spell and class coverage in tests/unit/spellCommands.test.ts and tests/unit/classCommands.test.ts
- Schema migrations in src/lib/schema/migrations.ts with dedicated unit coverage in tests/lib/migrations.test.ts
- Full spell workflow integration tests in tests/integration/spellManagement.test.ts (create/save/load cycle, multiclass slots, profile syncing)
- Current workflow coverage in tests/integration/spellOperations.test.tsx, tests/integration/multiclassUpdates.test.tsx, tests/integration/contentFiltering.test.tsx, and tests/integration/armorClass.test.tsx
- Basic E2E startup/navigation smoke
- Exhaustive no-character route-guard E2E for every protected character route, with public Settings and Compendium access checks
- Character lifecycle E2E (import -> portrait edit -> save -> reload) in tests/e2e/lifecycle.spec.ts
- Complete create-character E2E (required wizard selections -> review -> create -> reload persistence)
- Character-library E2E for metadata search, cancel/confirm deletion, persisted deletion, and distinct malformed/schema-invalid import errors
- Active-character spell workflow E2E (profile switching, add/remove, prepared toggle) in tests/e2e/spells-active.spec.ts
- Startup cache-branch full coverage in tests/hooks/useDataInit.test.tsx (unconfigured, stale, fresh, offline, source-changed, direct-load)
- Provenance reconciliation edge cases in tests/lib/provenance/reconciliation.test.ts (mixed-source retention, background choice removal, multiclass-safe class reconciliation)
- Ingestion missing-file resilience in tests/lib/5etools/dataLoader.test.ts (continues when indexed class file returns 404)
- Ingestion malformed-payload resilience in tests/lib/5etools/dataLoader.test.ts (drops non-array entity payloads and malformed spell payloads without failing load)
- Ingestion empty-object payload resilience in tests/lib/5etools/dataLoader.test.ts (absent entity keys treated as empty collections)
- Ingestion partial spell index resilience in tests/lib/5etools/dataLoader.test.ts (valid spell files load when some indexed files are malformed)
- Ingestion null entity array resilience in tests/lib/5etools/dataLoader.test.ts (class files with null entity arrays handled gracefully)
- Ingestion offline fail-fast coverage in tests/lib/5etools/dataLoader.test.ts (throws when zero top-level remote resources are reachable)
- Feat options parser coverage in tests/lib/5etools/featOptions.test.ts (parseFeatSpellFilter, deriveFeatOptionSteps all step kinds, hasFeatOptions, deriveSpellStepsForClass)
- Bonus feat option workflow coverage in tests/hooks/useFeatProvenanceMutations.test.tsx and tests/integration/featsPage.test.tsx (automatic configuration after selection, setup persistence, and grant cleanup on removal)
- Parameterized fixed feat coverage in tests/lib/featGrants.test.ts, tests/lib/provenance/applyFeatGrantBlocks.test.ts, tests/lib/migrations.test.ts, tests/integration/featOptionsModal.test.tsx, and tests/integration/featsPage.test.tsx (canonical lookup, variant migration, fixed-step skipping, fixed spell-list setup, and option persistence)
- Feats page Edit Setup hint coverage in tests/integration/featsPage.test.tsx (configured character and bonus feat anchors)
- Compendium edition selector coverage in tests/integration/compendiumPage.test.tsx (Both default, rendered filtering, and isolation from active-character ruleset/source restrictions)
- SpellProfileManager UI behaviors in tests/integration/spellProfileManager.test.tsx (cantrip rendering, remove callback, lock icon, missing-spell badge, racial profile hide/show, empty state)
- Spell display-name coverage verifies lowercase 5etools grant tokens render with canonical parsed casing
- Electron semver comparator coverage in tests/lib/updateManager.test.ts (major/minor/patch, pre-release ordering, stable vs pre-release)
- Electron updater lifecycle coverage in tests/lib/updateManager.test.ts (offline short-circuit, startup schedule skip, event forwarding, destroyed-window handling, duplicate-download guard, cancellation, and completed-token cleanup)
- Electron security boundary coverage in tests/electron/security.test.ts (renderer origins and canonical local-root containment)
- Compiled Electron smoke coverage in tests/electron-smoke/startup.ts (sandbox isolation, preload bridge, trusted IPC)
- Bundled asset URL coverage in tests/lib/assetUrls.test.ts and the compiled Electron smoke test,
	including class icons, legacy portrait paths, hosted base paths, and real packaged SVG loading
- Store-level empty background refresh guard in tests/store/gameDataStore.test.ts (prevents clobbering existing cache/state)
- Character sheet PDF boundary coverage for lookup-enriched view-model projection, semantic 2014/2024 mapping, field-capacity limits, real shipped-template field-name contracts, form filling, and 2014 MPMB cleanup, plus saved-file compatibility coverage for resistance, armor, language, tool, and checkbox appearances and flat workspace-shell/preview-canvas presentation coverage
- Importable PDF kitchen-sink character coverage in tests/fixtures/pdf-kitchen-sink.tbc and tests/lib/pdfKitchenSinkFixture.test.ts (multiclass/subclass, spell profiles, full skills/saves, attacks, magic items, 90-row inventory, narrative/runtime state, schema validation, and both template capacity boundaries)

## High-Priority Gaps

1. **SpellProfileManager decomposition**: Large component (~783 lines); defer until next feature touch.
2. **FeatOptionsModal**: Fixed-step skipping and unrestricted spellcasting-list initialization are covered; broader multi-step navigation and every option kind still need dedicated component coverage.
3. **Character page journeys**: Route access is covered comprehensively, but Race, Background, Proficiencies, Ability Scores, Feats, Rules, Conditions, and character-sheet behavior still rely primarily on integration tests rather than focused E2E journeys.

## Test Coverage by Layer

| Layer | Actual | Aspirational | Notes |
|-------|--------|--------------|-------|
| Calculations (lib) | ✅ Excellent | ✅ Complete | 34+ unit tests, all passing |
| Stores | ✅ Good | ✅ Good | Validation, rehydrate safety tested |
| Hooks (char) | ✅ Good | ⚠️ Growing | Spell, HP, and startup data-init branch coverage; other UI-dependent hooks remain limited |
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
