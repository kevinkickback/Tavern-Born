# Testing Map

This document maps current test coverage and practical priorities for expansion.

## Tooling

- Unit and integration: Vitest
- E2E: Playwright
- Lint: Biome
- Dead code and dependency hygiene: Knip
- Architectural boundaries and cycles: dependency-cruiser
- Coverage: V8 via Vitest, with baseline regression thresholds enforced in CI

Key scripts in package.json:
- npm run lint
- npm run check:bundle (run after `npm run build`)
- npm run check:health
- npm run report:capabilities (requires the externally managed local `data/` corpus)
- npm run test
- npm run test:coverage
- npm run test:e2e
- npm run test:electron (run after `npm run build`)

`npm run check:health` rejects unused files, exports, dependencies, circular dependencies, UI
imports of managed data JSON, production imports of tests, and dependencies from pure `src/lib`
modules into UI, hook, page, or store layers. Knip's duplicate-export diagnostic is excluded because
the few same-value public aliases are intentional compatibility names; unused-code diagnostics stay
enabled.

`npm run check:bundle` measures the actual production output and enforces reviewed budgets for the
initial renderer, lazy chunks, worker, static assets, and total distribution. Its measurement and
failure behavior is covered by `tests/bundle-budget.test.ts`; CI and `npm run dist` both enforce it.

The current global coverage floor is 60% statements, 50% branches, 57% functions, and 63% lines.
These values are an honest ratchet based on the measured suite, not the long-term target; raise them as
new tests land and do not lower them to merge a change.

## Current Coverage Areas

- Core calculations in src/lib/calculations/* (including spellUtils)
- Character calculation-context coverage for source-qualified resolution, ruleset normalization,
  origin/ASI score composition, equipment state, and cross-surface effective-score agreement.
- The six-fixture representative matrix in
  `tests/fixtures/representativeCharacters.ts` and
  `tests/integration/representativeCharacters.test.tsx` covers a 2014 dwarf martial, 2014 elf
  wizard, 2024 cleric choices, 2024 druid choices, 2024 weapon mastery, and a level-changing
  multiclass spellcaster. Every case crosses the real Builder review and header displays,
  prerequisite checks, equipment/carrying calculations, spell profiles and slot pools, readiness,
  and both PDF mappings from source-qualified lookups. The multiclass case also verifies active
  item effects and class-owned ASI retraction on level-down.
- Structured movement coverage for race/subrace inheritance, alternate and unknown modes, hover,
  manual adjustments, exact overrides, and both PDF templates.
- A focused source-ownership test prevents Builder, header-stat, prerequisite, spellcasting, and PDF
  consumers from bypassing the effective-score boundary.
- Spell profile/multiclass spellcasting calculations in src/lib/calculations/spellProfiles.ts,
  including independent spellbook/known, cantrip, and preparation capacities for 2014 and 2024
  casters. Readiness and presentation regressions verify fixed or always-prepared grants and
  case-variant duplicates do not satisfy or inflate player-choice quotas. Ownership regressions
  cover class selections that overlap subclass grants, case-insensitive/source-qualified readiness,
  replacement-only levels, reverse-order spell-swap rollback on level-down, and 2014 subclass-owned
  spellcasting profiles and class-page choice lists. Spell identity and selection coverage verifies
  exact `Name|Source` resolution, selected-printing persistence, source-safe pruning, and clean
  display labels.
- Character utilities and rules in src/lib/characterUtils.ts and src/lib/calculations/gameRules.ts
- HP derivation and state coverage for fixed-average and recorded hit-die gains, Constitution
  recalculation, manual flat/per-level adjustments, active typed-source display, exact overrides,
  uninitialized current HP, source-aware draft previews, and current/temp HP saves without
  typed-effect clamping drift
- AC calculation and state coverage for equipment/Dexterity derivation, read-only equipped-source
  breakdowns, positive and negative manual adjustments, exact overrides, source-aware direct-value
  drafts, and canonical effective reads
- Shared stat-settings coverage verifies HP, AC, and movement drafts preserve parsed source effects,
  typed manual effects, and activation context through preview and persisted settings writes.
- 5etools modules in src/lib/5etools/* (dataLoader, parsers, classData, filters, lookups, validator)
- Class-choice normalization coverage for source-qualified feature options, optional-feature
  progressions, generic table-backed capacity, tagged filters, replacement rules, name-independent
  classification, bounded singular/plural counts, proficiency-constrained item choices, and
  unsafe-shape diagnostics, including the configured 2024 core corpus.
- Corpus capability coverage inventories class choices, movement forms, top-level structured field
  shapes, and unresolved source-qualified references without making the external `data/` directory
  a CI prerequisite. Copied-subclass tests cover both unique source-safe resolution and ambiguous
  no-guess behavior.
- Class-choice option resolution and Builder workflow coverage in
  tests/lib/classChoiceOptions.test.ts, tests/hooks/useClassPageControllers.test.tsx, and
  tests/integration/classLevelsPanel.test.tsx and
  tests/integration/classChoiceSelectionModal.test.tsx (base-item catalog filters, parsed mastery
  descriptions, parsed-label weapon range, mastery-property filtering and presentation, source
  identity, retained unavailable selections, store-backed persistence, selection-card level/feature
  placement, eligibility-aware completion cards, unavailable-option selection guards, and
  unresolved-choice warnings). Shared pane tests also verify collapsed panes leave flex sizing.
- Composite-key entity resolver coverage, including filtered-primary/raw fallback, source collisions,
  source-less rejection, and nested subrace merging
- Organizations parser coverage in tests/lib/5etools/parsers.test.ts (faction extraction from fluff backgrounds)
- Renderer output in src/lib/renderer.ts
- Recursive tooltip builder, hook, and nested interaction coverage for explicit collection sets,
  stable source/name keys, `itemsBase`, multi-level tooltip chains, Floating UI anchoring, and
  active-depth styling
- Provenance ledger/reconciliation modules
- Provenance section row routing helper in src/lib/provenance/sectionRows.ts
- Provenance composed hooks in src/hooks/character/useProvenance*.ts
- Zustand stores in src/store/*
- Character persistence schema validation in tests/lib/characterSchema.test.ts
- Named game-data lookup hook coverage for stable empty defaults and ingestion-built race/background/item/metadata/skill lookups
- Character payload validation and rehydrate safety in tests/store/characterStore.test.ts, including
  subscriber notification and persistence of sanitized current-schema records. Home-page coverage
  verifies unsupported-record warnings are acknowledged after one display.
- Compile-time compatibility between normalized persistence output and the runtime `Character`
  contract in tests/lib/characterSchema.test.ts
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
- Equipment page detail rendering, category-matched detail icons, type-aware metadata, canonical armor enrichment, exceptional populated statistics, theme-surface styling, recursive link tooltips, persistent inventory headers, and the container-responsive inventory summary in tests/integration/equipmentPage.test.tsx, tests/unit/itemDetailFields.test.ts, and tests/e2e/equipment.spec.ts; base-item recursive lookup in tests/hooks/useRecursiveLookup.test.tsx
- Manual item-selection category coverage includes parsed spellcasting-focus types and unknown or
  homebrew type codes in tests/unit/itemSelectionModal.test.ts.
- Shared class/background generic-equipment selection has an accessible-name regression test in
  tests/integration/genericEquipmentSelect.test.tsx.
- Shared compact list/detail pane behavior in tests/integration/splitPane.test.tsx and tests/e2e/responsive-workspaces.spec.ts, including every split workspace and persistent secondary navigation at the 900x700 minimum app window
- Atomic equipment command coverage for add/remove/manual proficiency alignment, duplicate names, and retained source tags
- Armor-restriction reconciliation coverage for nonproficient armor, duplicate body/shield slots,
	legacy type-only armor records, and preservation of other equipped gear
- Wizard data-controller coverage for draft source filtering, implicit ruleset sources, reprint suppression, and raw fallback resolution
- Shared prerequisite snapshot and feat option-pool coverage, including multiclass progression and source collisions
- Feat command coverage includes class-owned progression choices, bonus-feat isolation,
  source-qualified race/background choices, option retraction, and class level-down cleanup.
- Subclass eligibility and class controller composition coverage for parsed/legacy restrictions, spell choices, ASI totals, and optional features
- Integration workflows: home page, startup modals, and level-up modal, including rolled/manual HP validation and persistence (tests/integration/*)
- Header HP/AC launch controls, deliberate Rest-action absence, immediate in-session one-time-hint
  reset coverage, and responsive persistent-anchor recovery in
  tests/integration/appHeader.test.tsx and tests/hooks/useAnchoredHintPosition.test.tsx
- Character-card action behavior and consistent accent-colored level, race, and class icons in tests/integration/characterCard.test.tsx
- Title-bar-safe Floating UI collision padding and live anchoring across supported interface scales,
  plus nested-only history navigation, streamlined transient controls, selected-entry pinning
  without a position jump, and constrained pointer/keyboard movement. Pure positioning tests cover
  only Tavern Born's pinned-preview clamping; Floating UI's geometry implementation is not
  duplicated in the test suite.
- HP and AC Overview/Manual changes modal coverage in tests/integration/hitPointsModal.test.tsx and
  tests/integration/armorClassModal.test.tsx
- Builder Actions & Effects page/editor coverage in tests/integration/adjustmentsPage.test.tsx,
  tests/integration/derivedMechanicsOverview.test.tsx,
  tests/integration/manualEffectsEditor.test.tsx, and tests/integration/manualActionsEditor.test.tsx,
  including Actions-first ordering/default, Effects deep links, action-sized source filtering,
  independently collapsible source/manual groups for both mechanic types, read-only source-owned
  rows, active equipment requirements,
  manual-entry separation, and the responsive form/detail split workbench
- Race summary coverage for parsed unresolved, completed, and fixed ability bonuses; the custom
  base-score method; shared accent-outline actions; and omission of race-bonus editing under 2024
  rules in tests/integration/racePageSummary.test.tsx
- Cross-page configuration coverage verifies source-qualified feat focus plus legacy race-bonus and
  revised background-bonus destination highlights, including explicit highlight expiry.
- Race-command coverage verifies that 2024 lineage selection is independent of unfinished
  background choices; the corpus-backed kitchen-sink test requires a valid selected lineage when
  the resolved race exposes lineages.
- Canonical 2014 race/2024 background readiness routing and revised background-bonus editing in
  tests/lib/characterReadiness.test.ts and tests/integration/abilityScoresPage.test.tsx. The 2024
  Background page regression in tests/integration/backgroundPage.test.tsx verifies selection does
  not force fixed-feat configuration, the proficiency grid is not duplicated with origin fields,
  configurable feats link to the source-qualified Feats entry, and all parsed ability-assignment
  patterns appear in the setup summary. Deep-link selection is covered by
  tests/integration/featsPage.test.tsx; pure compact summary and pending Sources-row formatting is
  covered by tests/unit/backgroundPageData.test.ts. Ability Scores integration covers unresolved
  2024 background attribution and ruleset-correct empty guidance.
- Review-page integration coverage in tests/integration/reviewPage.test.tsx verifies the default
  Needs Attention tab, separate Character Overview, and issue-qualified readiness navigation
  targets. Class readiness and level-panel coverage verifies that subclass, advancement, and
  normalized class-choice links retain their class and level and reveal the exact targeted control;
  feature-owned class diagnostics are covered so adjacent diagnostics cannot receive the same focus.
- Warning/destructive palette import regression coverage in tests/lib/themeColors.test.ts
- Combined Rules/Sources tab behavior and source-panel layout coverage in
  tests/integration/rulesPage.test.tsx and tests/integration/sourcesPanelLayout.test.tsx
- Ability-score method descriptors are tested for both origin systems in
  tests/unit/abilityScoreMethods.test.ts.
- Conditions tab, data-driven rule text/tooltip, whole-card toggle, and exhaustion-state coverage in tests/integration/conditionsPage.test.tsx
- Characteristics page draft synchronization, immediate detail persistence, and custom/preset
	organization transitions in tests/integration/characteristicsPage.test.tsx
- Import workflow integration (valid + invalid character payloads) in tests/integration/homePageWorkflows.test.tsx
- Portrait preview rendering and wizard preview wiring in tests/integration/portraitCardPreview.test.tsx and tests/integration/basicsStepPortraitPreview.test.tsx
- Spell hook behavior coverage in tests/hooks/useSpellSlots.test.tsx (add/remove spells, profile management, prepared toggles)
- Spell identity coverage includes lowercase legacy references, source-qualified catalog resolution,
  modal hiding/locking, and mixed-case command deduplication.
- Command-layer spell and class coverage in tests/unit/spellCommands.test.ts and tests/unit/classCommands.test.ts
- Structured class-choice command coverage in tests/unit/classChoiceCommands.test.ts includes
  partial drafts, cardinality/source validation, identity-stable slot ownership across later
  catalog-sorted additions, feature-shaped grant materialization/replacement, explicit
  non-inference for item choices, and level/class retraction.
- Source-qualified class-choice coverage tests select the upstream `srd52: true` cohort, require a
  unique 20-level matrix for every tagged class, and reject diagnostics, incomplete progressions,
  and mismatched owners (`tests/lib/5etools/classChoiceCoverage.test.ts` and
  `tests/corpus/dataCapabilities.test.ts`).
- Strict current-version import and hydration rejection coverage in tests/store/characterStore.test.ts
- Full spell workflow integration tests in tests/integration/spellManagement.test.ts (create/save/load cycle, multiclass slots, profile syncing)
- Current workflow coverage in tests/integration/spellOperations.test.tsx, tests/integration/multiclassUpdates.test.tsx, tests/integration/contentFiltering.test.tsx, and tests/integration/armorClass.test.tsx
- Class-page spell choice coverage in tests/unit/spellCommands.test.ts and
  tests/hooks/useClassPageControllers.test.tsx verifies that later-level additions and reselections
  update profile/provenance state atomically without removing earlier or unattributed choices. The
  command matrix covers every core 2014 and 2024 spellcasting class plus Artificer, including known,
  prepared, spellbook, and Pact casting models.
- Basic E2E startup/navigation smoke
- Exhaustive no-character route-guard E2E for every protected character route, with public Settings and Compendium access checks
- Character lifecycle E2E (import -> portrait edit -> save -> reload) in tests/e2e/lifecycle.spec.ts
- Complete create-character E2E (required wizard selections -> review -> create -> reload persistence)
- Character-library E2E for metadata search, cancel/confirm deletion, persisted deletion, and distinct malformed/schema-invalid import errors
- Character copy and transfer coverage for immediate exact deep copies, collision-free naming,
  complete-character `.tbc` export, and schema-validated import.
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
- Parameterized fixed feat coverage in tests/lib/featGrants.test.ts, tests/lib/provenance/applyFeatGrantBlocks.test.ts, tests/integration/featOptionsModal.test.tsx, and tests/integration/featsPage.test.tsx (canonical lookup, fixed-step skipping, fixed spell-list setup, and option persistence)
- Feats page Edit Setup hint coverage in tests/integration/featsPage.test.tsx (configured character and bonus feat anchors)
- Compendium edition selector coverage in tests/integration/compendiumPage.test.tsx (Both default, rendered filtering, and isolation from active-character ruleset/source restrictions)
- SpellProfileManager UI behaviors in tests/integration/spellProfileManager.test.tsx (cantrip rendering, remove callback, lock icon, missing-spell badge, racial profile hide/show, empty state)
- Shared/Pact slot command and hook coverage in tests/lib/spellSlotCommands.test.ts and
  tests/hooks/useSpellSlotMutations.test.tsx; read-only Builder capacity display in
  tests/integration/spellcastingDetailsCard.test.tsx and tests/e2e/rest-and-slots.spec.ts.
- Atomic rest calculation, hook commit, and preview-dialog choice coverage in
  tests/lib/restCommands.test.ts, tests/hooks/useRestPreview.test.tsx, and
  tests/integration/restPreviewDialog.test.tsx.
- Structured feat-effect coverage verifies source-qualified lookup across persisted feat owners,
  deduplication, unconditional resistance/immunity projection, and fail-closed handling of choice
  objects without interpreting rules prose.
- Spell display-name coverage verifies lowercase 5etools grant tokens render with canonical parsed casing
- Electron semver comparator coverage in tests/lib/updateManager.test.ts (major/minor/patch, pre-release ordering, stable vs pre-release)
- Electron updater lifecycle coverage in tests/lib/updateManager.test.ts (offline short-circuit, startup schedule skip, event forwarding, destroyed-window handling, duplicate-download guard, cancellation, and completed-token cleanup)
- Electron security boundary coverage in tests/electron/security.test.ts (renderer origins and canonical local-root containment)
- Compiled Electron smoke coverage in tests/electron-smoke/startup.ts (sandbox isolation, preload bridge, trusted IPC)
- Bundled asset URL coverage in tests/lib/assetUrls.test.ts and the compiled Electron smoke test,
	including class icons, current portrait and organization paths, hosted base paths, and real packaged SVG loading
- Store-level atomic load coverage in tests/store/gameDataStore.test.ts prevents failed background
  refreshes and required foreground resource failures from clobbering cache/state while allowing
  optional foreground presentation failures.
- Character sheet PDF boundary coverage for lookup-enriched view-model projection, active typed
  defenses, unified feat ownership, organization-emblem embedding, semantic 2014/2024 mapping,
  shared field-capacity limits, export-preflight classification, real shipped-template field-name
  contracts, form filling, and 2014 MPMB cleanup, plus saved-file compatibility coverage for
  resistance, armor, language, tool, and checkbox appearances and flat
  workspace-shell/preview-canvas presentation coverage
- Action projection coverage resolves parsed class, subclass, selected-feature, and every persisted
  feat-owner container instead of relying on empty saved presentation descriptions. Spellcasting
  detail coverage also verifies 2014 known and 2024 prepared limits owned by casting subclasses;
  action activation distinguishes known and level-only prepared casters from daily prepared casters.
- Class-rule normalization includes corpus-backed 2014 Paladin Channel Divinity progression checks.
- Importable, ruleset-specific PDF kitchen-sink coverage in
  tests/fixtures/pdf-kitchen-sink-2014.tbc, tests/fixtures/pdf-kitchen-sink-2024.tbc, and
  tests/lib/pdfKitchenSinkFixture.test.ts. The fixtures retain high-capacity multiclass, spell,
  skill/save, attack, magic-item, inventory, narrative, and runtime coverage while a corpus audit
  requires every source-qualified entity to resolve and forbids embedded item/feat/feature prose.
- Route-decomposition coverage keeps Feats and Characteristics behavior under their existing
  integration suites; `tests/lib/characteristicsModel.test.ts` additionally locks current structured
  organization drafts and data-agnostic organization presentation.

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
| Character schema | ✅ Good | ✅ Good | Exact-version import and hydration rejection coverage |

## Practical Test Patterns

Store tests:
- Mock IndexedDB adapter module in test setup.
- Assert draft behavior plus pending success, rejection/retry, and edits made during Save for the
  active character lifecycle.

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
