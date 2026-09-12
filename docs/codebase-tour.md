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
- src/types/characterSchema.ts — Zod validation schema for character imports and persistence validation (separate from TypeScript types)
- src/lib/schema/migrations.ts — Schema versioning and migration system for backward compatibility
- src/hooks/character/*
- src/lib/provenance/sectionRows.ts

Game data load and cache:
- src/store/gameDataStore.ts
- src/hooks/data/useDataInit.ts
- src/hooks/data/useFilteredGameData.ts — use useFilteredGameDataParams({ allowedSources, preferNewerPrintings }) when filtering outside a character context
- src/hooks/data/useGameData.ts
- src/hooks/data/useRecursiveLookup.ts
- src/hooks/data/useAvailableProficiencies.ts
- src/hooks/data/useWizardGameData.ts — draft-scoped filtered collections and source-qualified resolvers for character creation
- src/lib/storage/dataCache.ts
- src/lib/storage/idb-storage.ts
- src/lib/storage/collapseState.ts

5etools parsing and filtering:
- src/lib/5etools/dataLoader.ts
- src/lib/5etools/parsers/index.ts
- src/lib/5etools/parsers/*
- src/lib/5etools/classData.ts
- src/lib/5etools/validator.ts
- src/lib/5etools/schemas.ts
- src/lib/5etools/lookups.ts
- src/lib/5etools/entityResolvers.ts — exact primary/raw fallback resolution for persisted class, race/subrace, and background references
- src/lib/5etools/filters.ts
- src/lib/5etools/urlUtils.ts
- src/lib/5etools/sourceFallbacks.ts
- src/lib/5etools/index.ts

Game rules and derived calculations (search here before adding new logic):
- src/lib/calculations/skills.ts — skill modifier math, proficiency application
- src/lib/calculations/abilityScores.ts — ability modifiers, ASI grants, background ability data
- src/lib/calculations/gameRules.ts — proficiency bonus, level rules
- src/lib/calculations/prerequisites.ts — feat/feature prerequisite checks
- src/lib/calculations/featChoices.ts — shared feat option-pool filtering and initial modal filters
- src/lib/calculations/subclassEligibility.ts — parsed subclass prerequisites and isolated legacy restrictions
- src/lib/calculations/spellSlots.ts — multiclass slot derivation
- src/lib/calculations/armorClass.ts — equipment/Dexterity AC, lasting adjustment totals, and canonical effective AC resolution
- src/lib/calculations/itemEquippable.ts — isEquippable() predicate (type codes + wondrous/tattoo/focus flags)
- src/lib/calculations/raceUtils.ts — race ASI and trait helpers
- src/lib/characterUtils.ts — cross-cutting character helpers, including per-level HP breakdowns, lasting HP adjustments, and effective maximum HP
- src/lib/character/ids.ts — generateEquipmentId() for all equipment item ID creation

Provenance and source attribution:
- src/lib/provenance/* — pure grant/reconciliation logic
- src/lib/character/commands/* — complete pure character transitions returning characterPatch + provenanceUpdate
- src/lib/character/commands/equipmentCommands.ts — atomic manual inventory/proficiency and provenance transitions
- src/components/provenance/* — provenance UI (ledger display)
- src/hooks/character/useProvenance.ts — public hook (aggregates mutations + rows)
- src/hooks/character/useProvenanceMutations.ts — thin aggregator; delegates to domain hooks
- src/hooks/character/useRaceProvenanceMutations.ts — race command adapter
- src/hooks/character/useClassProvenanceMutations.ts — class command adapter
- src/hooks/character/useBackgroundProvenanceMutations.ts — background command adapter
- src/hooks/character/useSpellProvenanceMutations.ts — spell grant/swap/remove mutations
- src/hooks/character/useFeatProvenanceMutations.ts — feat command adapter
- src/hooks/character/useEquipmentProvenanceMutations.ts — manual equipment and proficiency toggles
- src/hooks/character/useProvenanceLedger.ts — read-only ledger derivation hook for pages that only display provenance state
- src/lib/character/equipmentHelpers.ts — canonical shared pure equipment helpers
- src/hooks/character/useProvenanceRows.ts — ledger row derivation for the UI
- src/lib/provenance/sectionRows.ts

Build flow orchestration helpers:
- src/pages/build/ability-scores/model/data.ts
- src/pages/build/class/model/pageUtils.ts
- src/pages/build/class/model/asi.ts
- src/lib/character/commands/classCommands.ts
- src/lib/character/commands/raceCommands.ts
- src/lib/character/commands/backgroundCommands.ts
- src/lib/character/commands/featCommands.ts
- src/lib/character/commands/spellCommands.ts
- src/lib/character/commands/originSelectionCommand.ts
- src/hooks/character/useUnifiedClassSelection.ts
- src/pages/build/proficiencies/model/data.ts
- src/pages/build/proficiencies/model/types.ts
- src/pages/build/background/model/data.ts
- src/pages/build/class/model/levelsUtils.ts
- src/pages/build/class/hooks/useSubclassSelectionController.ts
- src/pages/build/class/hooks/useClassSpellChoiceController.ts
- src/pages/build/class/hooks/useClassAsiFeatController.ts
- src/pages/build/class/hooks/useClassOptionalFeatureController.ts
- src/pages/build/ability-scores/components/MethodPanels.tsx
- src/pages/build/ability-scores/components/DetailsPanel.tsx
- src/pages/build/class/components/AsiSection.tsx
- src/pages/build/class/components/SpellSection.tsx
- src/pages/build/class/components/SubclassSection.tsx
- src/pages/build/class/components/PassiveFeatureList.tsx
- src/pages/build/class/components/ProgressionChoiceCard.tsx — shared card for classFeat and optFeature progression gains (choose/edit + chosen pills)
- src/pages/build/proficiencies/components/DetailsPanel.tsx
- src/pages/build/proficiencies/components/TabsPanel.tsx
- src/pages/build/background/components/DetailsPanel.tsx

Compendium normalization and detail rendering:
- src/lib/compendiumEntries.ts
- src/pages/compendium/CompendiumEntryDetails.tsx

Feats page UI orchestration:
- src/pages/feats/FeatsPage.tsx — Character/Bonus feat accordions, warning badges, and tooltips for potential feat sources

Spells page UI orchestration:
- src/pages/spells/SpellsPage.tsx
- src/pages/spells/components/SpellProfileManager.tsx — spell profile accordions and warning badges/tooltips
- src/lib/character/commands/spellCommands.ts — canonical spell mutation commands for profile/provenance coordination
- src/hooks/character/useSpellSlots.ts — read state: spell slots, profiles, spellcasting detail (no mutations)
- src/hooks/character/useSpellProfileMutations.ts — all spell mutation callbacks (add/remove/prepare/racial spells)

Combat stats and advancement:
- src/components/modals/LevelUpModal.tsx — class-level changes and average/rolled/manual hit-die result collection
- src/lib/character/commands/classCommands.ts — atomic progression updates and durable per-level HP gain records
- src/hooks/character/useHitPoints.ts — calculated, adjusted, overridden, current, and temporary HP views plus atomic modal save
- src/components/modals/HitPointsModal.tsx — player-facing current/temp HP and lasting maximum-HP management
- src/hooks/character/useArmorClass.ts — calculated, adjusted, overridden, and effective AC views plus atomic modal save
- src/components/modals/ArmorClassModal.tsx — player-facing lasting AC changes and fixed AC management
- src/components/layout/AppHeader.tsx — heart/shield launch controls and the one-time anchored management hint

Rules, sources, and condition tracking:
- src/pages/rules/RulesPage.tsx — post-creation rules review and edits, split into Ruleset, Advancement, and Character Options tabs
- src/pages/sources/SourcesPage.tsx — per-character allowed sources and newer-printing preference
- src/pages/details/ConditionsPage.tsx — Combat State, Exhaustion, Conditions, and Class Resources tabs
- src/hooks/data/useGameData.ts — `useConditions()` supplies parsed condition records
- src/lib/5etools/parsers/basic.ts — tags condition and disease records during ingestion so gameplay UI can exclude diseases without hardcoded lists

5etools rich text rendering:
- src/lib/renderer.ts
- src/lib/entryRenderCache.ts — object-identity cache for repeatedly rendered entries
- src/lib/renderer/recursiveTooltip.ts — shared recursive tooltip types, reference resolution, positioning, and explicit collection-set lookup builder
- src/components/editor/RenderedEntryWithTooltip.tsx — recursive source-aware rich-text UI

Character sheet PDF:
- src/lib/pdf/characterSheetViewModel.ts — pure character and raw game-data projection
- src/lib/pdf/characterSheetMapping2014.ts and src/lib/pdf/characterSheetMapping2024.ts — pure template field maps
- src/lib/pdf/pdfFormAdapter.ts and src/lib/pdf/pdfImageAdapter.ts — AcroForm/MPMB and portrait I/O adapters
- src/lib/pdf/characterSheetPdf.ts — thin template/orchestration API

Application settings:
- src/pages/SettingsPage.tsx
- src/components/settings/*

Electron integration:
- electron/main.ts
- electron/preload.ts
- electron/updateManager.ts — auto-update lifecycle (check/download/install/cancel via electron-updater)
- electron/windowState.ts — persist and restore window bounds/maximized state

Auto-update UI:
- src/components/updates/ChangelogModal.tsx — GitHub release notes modal
- src/components/updates/UpdateProgressModal.tsx — download progress + install countdown
- src/components/settings/GeneralPanel.tsx — Settings panel for manual check and auto-update toggle

Feat options wizard:
- src/components/modals/FeatOptionsModal.tsx — multi-step wizard for feats with player choices
- src/lib/5etools/parsers/featOptions.ts — derive step definitions from feat data

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
