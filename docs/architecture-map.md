# Architecture Map

This document describes the current Tavern-Born runtime architecture and where responsibilities live.

## Layered Architecture

1. Electron host layer
- Purpose: native window lifecycle, secure IPC bridge, capability-scoped filesystem access for the
  user-selected local data source, and auto-update management. IPC requests are restricted to the
  top-level trusted renderer; local paths are canonicalized and confined to the native-picker root.
- Key files: electron/main.ts, electron/preload.ts, electron/updateManager.ts, electron/windowState.ts.

2. Application shell and routing
- Purpose: route composition, global providers, app-level overlays.
- Key files: src/main.tsx, src/App.tsx, src/components/layout/AppLayout.tsx.

3. State and persistence
- Purpose: app state ownership and IndexedDB persistence.
- Key files: src/store/characterStore.ts, src/store/gameDataStore.ts, src/lib/storage/idb-storage.ts, src/lib/storage/dataCache.ts, src/lib/storage/collapseState.ts.

4. Data ingestion and indexing
- Purpose: load and parse 5etools data from local or remote source, then build lookups.
- Key files: src/lib/5etools/dataLoader.ts, src/lib/5etools/parsers/index.ts, src/lib/5etools/parsers/*, src/lib/5etools/classData.ts, src/lib/5etools/validator.ts, src/lib/5etools/schemas.ts, src/lib/5etools/lookups.ts, src/lib/5etools/entityResolvers.ts, src/lib/5etools/filters.ts, src/lib/5etools/urlUtils.ts, src/lib/5etools/sourceFallbacks.ts, src/lib/5etools/index.ts.

5. Domain logic
- Purpose: pure calculations and game rules.
- Key files: src/lib/characterUtils.ts, src/lib/character/ids.ts, src/lib/character/equipmentHelpers.ts, src/lib/calculations/gameRules.ts, src/lib/calculations/abilityScores.ts, src/lib/calculations/spellSlots.ts, src/lib/calculations/spellProfiles.ts, src/lib/calculations/spellUtils.ts, src/lib/calculations/skills.ts, src/lib/calculations/prerequisites.ts, src/lib/calculations/featChoices.ts, src/lib/calculations/subclassEligibility.ts, src/lib/calculations/raceUtils.ts, src/lib/calculations/armorClass.ts.

6. Provenance system
- Purpose: track source of grants and reconcile when race/class/features change.
- Key files: src/lib/provenance/types.ts, src/lib/provenance/ledger.ts, src/lib/provenance/reconciliation.ts, src/lib/provenance/normalization.ts, src/lib/provenance/sourceLabels.ts, src/lib/provenance/summaries.ts, src/lib/provenance/resolveRaceAsiChoices.ts, src/lib/provenance/applyRaceGrants.ts, src/lib/provenance/applyClassGrants.ts, src/lib/provenance/applyBackgroundGrants.ts, src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts, src/lib/provenance/applyAsiChoices.ts, src/lib/provenance/applyProficiencyBlocks.ts, src/lib/provenance/index.ts, src/lib/provenance/sectionRows.ts.
- Domain mutation hooks — **production UI entry points**: src/hooks/character/useRaceProvenanceMutations.ts, src/hooks/character/useClassProvenanceMutations.ts, src/hooks/character/useBackgroundProvenanceMutations.ts, src/hooks/character/useSpellProvenanceMutations.ts, src/hooks/character/useFeatProvenanceMutations.ts, src/hooks/character/useEquipmentProvenanceMutations.ts. Hooks read stores and lookup dependencies, invoke pure commands under src/lib/character/commands, and apply one atomic character patch. Canonical transition logic belongs in commands, not hooks.
- Test aggregator (not for production use): src/hooks/character/useProvenanceMutations.ts calls all six `use*ProvenanceMutations` hooks and spreads their results; src/hooks/character/useProvenance.ts is the integration test harness that composes mutations + rows. Use these in tests that need cross-domain interactions (e.g. apply race + class + verify ledger). Do not call them from pages.
- Read-only derivation hook: src/hooks/character/useProvenanceRows.ts.
- Shared pure equipment helpers (canonical — used by both lib commands and hooks): src/lib/character/equipmentHelpers.ts. src/hooks/character/provenanceHelpers.ts re-exports from there for backward compatibility.
- Manual equipment add/remove/proficiency transitions live in src/lib/character/commands/equipmentCommands.ts. Inventory and ledger changes are one command result and one store update.

7. Hooks and view derivations
- Purpose: thin wrappers from store state to UI-facing derived values.
- Key files: src/hooks/character/*, src/hooks/data/*.
- Shared lookup consumption uses the stable named hooks in src/hooks/data/useGameData.ts. Direct gameDataStore selectors are reserved for lifecycle state or callers that explicitly own raw collection sets.

Spellcasting note:
- `src/hooks/character/useSpellSlots.ts` is a **read-only** derivation hook: exposes spell slots, profiles, and spellcasting detail per profile. It does not include mutations.
- `src/hooks/character/useSpellProfileMutations.ts` owns all spell mutation callbacks (add/remove spells, toggle prepared, racial spells, profile sync). Callers that need both derived spell state and mutation callbacks must call both hooks and wire their outputs together (see `SpellsPage.tsx` for the pattern).

8. Pages and UI composition
- Purpose: user workflows and route-level behavior.
- Key files: src/pages/*, src/components/*, src/pages/build/ability-scores/model/data.ts, src/pages/build/class/model/pageUtils.ts, src/pages/build/class/model/asi.ts, src/pages/build/class/model/levelsUtils.ts, src/lib/character/commands/classCommands.ts, src/lib/character/commands/raceCommands.ts, src/lib/character/commands/backgroundCommands.ts, src/lib/character/commands/featCommands.ts, src/lib/character/commands/spellCommands.ts, src/lib/character/commands/originSelectionCommand.ts, src/hooks/character/useUnifiedClassSelection.ts, src/pages/build/proficiencies/model/data.ts, src/pages/build/proficiencies/model/types.ts, src/pages/build/background/model/data.ts, src/pages/build/ability-scores/components/MethodPanels.tsx, src/pages/build/ability-scores/components/DetailsPanel.tsx, src/pages/build/ability-scores/components/RacialBonusesPanel.tsx, src/pages/build/class/components/AsiSection.tsx, src/pages/build/class/components/SpellSection.tsx, src/pages/build/class/components/SubclassSection.tsx, src/pages/build/class/components/PassiveFeatureList.tsx, src/pages/build/class/components/ProgressionChoiceCard.tsx, src/pages/build/proficiencies/components/DetailsPanel.tsx, src/pages/build/proficiencies/components/TabsPanel.tsx, src/pages/build/background/components/DetailsPanel.tsx, src/pages/compendium/CompendiumPage.tsx, src/pages/compendium/CompendiumEntryDetails.tsx, src/lib/compendiumEntries.ts, src/components/modals/FeatOptionsModal.tsx, src/components/updates/ChangelogModal.tsx, src/components/updates/UpdateProgressModal.tsx.
- Equipment item details resolve immutable rules text from the game-data `itemLookup` by `name|source` and render it through `RenderedEntryWithTooltip`; recursive tooltip lookup includes both `items` and `itemsBase`. Persisted descriptions are fallback content for custom and imported items.
- Character entity resolution uses src/lib/5etools/entityResolvers.ts. Source-qualified references resolve exact matches in the caller's primary lookup first, then exact raw-data fallbacks so persisted selections survive filter changes. Name-only fallback is used only when the reference has no source and is deterministic.
- Character creation uses src/hooks/data/useWizardGameData.ts as its draft-scoped data boundary. Wizard steps receive filtered collections or resolved entities and never read the raw game-data store directly.
- Recursive tooltip lookup construction lives in src/lib/renderer/recursiveTooltip.ts. Raw and filtered callers pass an explicit collection set to the same builder, including `itemsBase`.

Current implementation notes:
- Race, class, background, feat, and spell mutations use complete pure commands returning `characterPatch` plus `provenanceUpdate`.
- BuildClassPage arranges sections and modals; subclass, spell, ASI/feat, and optional-feature decisions live in focused hooks under src/pages/build/class/hooks. Subclass eligibility is a pure parsed-first calculation with isolated legacy fallbacks.
- Character creation composes the same origin commands through `buildInitialCharacter`; pages and hooks do not reconstruct grant pipelines.
- AC reads across UI and PDF surfaces are aligned on effective AC resolution.

Auto-update note:
- `electron/updateManager.ts` manages the full electron-updater lifecycle (check, download, install, cancel).
- Update checking runs on startup (3s delay) and every 24 hours when auto-update is enabled.
- `src/components/updates/ChangelogModal.tsx` shows GitHub release notes; `src/components/updates/UpdateProgressModal.tsx` shows download progress with a 3-second install countdown.
- The `autoUpdate` toggle is persisted in `appPreferencesStore`.

Feat options note:
- `src/components/modals/FeatOptionsModal.tsx` is a multi-step wizard for feats with optional player choices (spell picks, proficiency selections, ability score bonuses, optional features, expertise).
- Steps are generated dynamically from the feat's `additionalSpells` and option blocks; dynamic steps are injected after the user chooses a spellcasting class.
- Valid fixed spellcasting classes are retained in completed selections but omitted from wizard navigation, which starts on the remaining spell choices.
- Completed selections are persisted on `character.feats[].options` or
	`character.specialFeats[].options` as `FeatOptionSelections`; both collections use the same
	provenance-aware commit, edit, and removal workflow.
- Selecting a new configurable bonus feat continues directly from the selection modal into the
	options wizard; pending cards retain Complete Setup as a recovery action.
- Configured feat cards anchor a one-time Edit Setup hint; its dismissal uses the
	`feats-edit-setup` local-storage hint key.
- Parsing support lives in `src/lib/5etools/parsers/featOptions.ts`.

Compendium edition filtering note:
- `src/lib/compendiumEntries.ts` classifies entries with `edition: "one"` or source `XPHB` as
	5.5e; untagged entries are classified as 5e.
- `src/pages/compendium/CompendiumPage.tsx` exposes a local 5e / 5.5e / Both selector beside
	Sources and always defaults to Both.
- Compendium builds its index from all loaded game data and does not read the active character's
	`originSystem` or `allowedSources`. Its edition, source, type, and text filters are explicit local
	UI state and do not mutate or persist character state.
- Character build and gameplay surfaces remain character-scoped through their existing ruleset and
	allowed-source filtering; the global Compendium behavior is intentionally page-local.

Character sheet PDF note:
- Route src/pages/CharacterSheetPage.tsx renders the PDF preview/download workflow.
- src/lib/pdf/characterSheetViewModel.ts is the pure character/game-data projection boundary and resolves class, race/subrace, and background entities from raw composite lookups.
- Pure template mappings live in src/lib/pdf/characterSheetMapping2014.ts and src/lib/pdf/characterSheetMapping2024.ts. src/lib/pdf/pdfFormAdapter.ts owns AcroForm filling and MPMB cleanup; src/lib/pdf/pdfImageAdapter.ts owns portrait loading and embedding; src/lib/pdf/characterSheetPdf.ts is the thin orchestrator.
- CharacterSheetPage prepares and memoizes the view model before template loading, then reuses it for mapping and adapter execution.
- 2024 mapping coverage includes core identity/combat stats, save/skill proficiencies, inspiration and death save checkboxes, and narrative/proficiency blocks when matching fields exist.
- PDF form editing is powered by `@cantoo/pdf-lib` (maintained fork of pdf-lib) to keep browser-side AcroForm fill/edit behavior stable.
- The 2014 pipeline also strips MPMB interactive chrome (buttons, ammo tracker widgets, calculation scripts, attack-mod placeholder state) before save/render.

## Routing Overview

- /: HomePage
- /build/*: Race, Class, Background, Proficiencies, Ability Scores
- /feats, /spells, /equipment
- /details/*: Portrait, Characteristics, Conditions
- /character-sheet, /compendium, /settings

Primary definition: src/App.tsx.

## Boundary Rules

- Never edit data/ directly. Source fixups belong in src/lib/5etools/sourceFallbacks.ts.
- Components and pages should not import JSON data directly.
- Business rules belong in src/lib as pure functions.
- Hooks should orchestrate state and derivation, not own canonical rules.
- Character writes flow through updateCharacter(id, patch) in src/store/characterStore.ts.
- 5etools entity list keys must use name|source.

## Where To Put New Code

- New game rule or stat logic: src/lib/calculations or src/lib/characterUtils.ts.
- New parser behavior: src/lib/5etools/parsers/* (barrel: src/lib/5etools/parsers/index.ts) plus validator/schemas updates.
- New ingestion lookup: src/lib/5etools/lookups.ts plus hook-level usage.
- New state field or mutation lifecycle: relevant store in src/store/*.ts.
- New route-level user flow: src/pages/* with extracted component logic under src/components/*.
- Page-specific pure helper logic for a single route: colocate under that route folder (for example src/pages/build/class/model/*, src/pages/build/background/model/*, or src/pages/compendium/*) and keep it framework-free when possible.

## Drift Watch

Revisit this file when any of these happen:

- New store or persistence mechanism
- Significant route structure changes
- New ingestion stage or parser contract
- Provenance model changes
