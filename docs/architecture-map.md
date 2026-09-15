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
- Shared `SplitPane` workspaces switch from side-by-side panes to a labeled, one-pane-at-a-time view
  when their own container is narrower than 840px; compact pane state is separate from the user's
  desktop collapse choices. The secondary workspace navigation remains permanently visible.
- Bundled runtime files from `public/` resolve through `src/lib/assetUrls.ts`; this preserves Vite
  dev-server URLs while producing relative URLs for packaged Electron's `file://` renderer. Class
  icons, placeholder portraits, organization artwork, the About logo, and PDF templates share this
  path. Documentation-only artwork belongs under `docs/assets/` so it is not copied into releases.
- Renderer styles compile through `@tailwindcss/vite`. `src/styles/theme.css` imports only the
  Radix scales reachable through the supported accent, neutral, warning, and destructive semantic
  tokens; there is no second PostCSS/Autoprefixer processing path.

3. State and persistence
- Purpose: app state ownership and IndexedDB persistence.
- Key files: src/store/characterStore.ts, src/store/gameDataStore.ts, src/lib/storage/idb-storage.ts, src/lib/storage/dataCache.ts, src/lib/storage/collapseState.ts.

4. Data ingestion and indexing
- Purpose: load and parse 5etools data from local or remote source, then build lookups.
- Key files: src/lib/5etools/dataLoader.ts, src/lib/5etools/parsers/index.ts, src/lib/5etools/parsers/*, src/lib/5etools/classData.ts, src/lib/5etools/classChoiceNormalization.ts, src/lib/5etools/validator.ts, src/lib/5etools/schemas.ts, src/lib/5etools/lookups.ts, src/lib/5etools/entityResolvers.ts, src/lib/5etools/filters.ts, src/lib/5etools/urlUtils.ts, src/lib/5etools/sourceFallbacks.ts, src/lib/5etools/index.ts.

5. Domain logic
- Purpose: pure calculations and game rules.
- Shared normalized class-choice and class-resource descriptors live in
  `src/types/classRules.ts`. The type layer must not import their parser/normalizer implementations.
- Key files: src/lib/characterUtils.ts, src/lib/character/ids.ts, src/lib/character/equipmentHelpers.ts, src/lib/calculations/characterCalculationContext.ts, src/lib/calculations/gameRules.ts, src/lib/calculations/abilityScores.ts, src/lib/calculations/movement.ts, src/lib/calculations/spellIdentity.ts, src/lib/calculations/spellSlots.ts, src/lib/calculations/spellProfiles.ts, src/lib/calculations/spellUtils.ts, src/lib/calculations/skills.ts, src/lib/calculations/prerequisites.ts, src/lib/calculations/featChoices.ts, src/lib/calculations/subclassEligibility.ts, src/lib/calculations/raceUtils.ts, src/lib/calculations/armorClass.ts.

6. Provenance system
- Purpose: track source of grants and reconcile when race/class/features change.
- Key files: src/lib/provenance/types.ts, src/lib/provenance/ledger.ts, src/lib/provenance/reconciliation.ts, src/lib/provenance/normalization.ts, src/lib/provenance/sourceLabels.ts, src/lib/provenance/summaries.ts, src/lib/provenance/resolveRaceAsiChoices.ts, src/lib/provenance/applyRaceGrants.ts, src/lib/provenance/applyClassGrants.ts, src/lib/provenance/applyBackgroundGrants.ts, src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts, src/lib/provenance/applyAsiChoices.ts, src/lib/provenance/applyProficiencyBlocks.ts, src/lib/provenance/index.ts, src/lib/provenance/sectionRows.ts.
- Domain mutation hooks — **production UI entry points**: src/hooks/character/useRaceProvenanceMutations.ts, src/hooks/character/useClassProvenanceMutations.ts, src/hooks/character/useBackgroundProvenanceMutations.ts, src/hooks/character/useSpellProvenanceMutations.ts, src/hooks/character/useFeatProvenanceMutations.ts, src/hooks/character/useEquipmentProvenanceMutations.ts. Hooks read stores and lookup dependencies, invoke pure commands under src/lib/character/commands, and apply one atomic character patch. Canonical transition logic belongs in commands, not hooks.
- Test aggregator (not for production use): src/hooks/character/useProvenanceMutations.ts calls all six `use*ProvenanceMutations` hooks and spreads their results; src/hooks/character/useProvenance.ts is the integration test harness that composes mutations + rows. Use these in tests that need cross-domain interactions (e.g. apply race + class + verify ledger). Do not call them from pages.
- Read-only derivation hook: src/hooks/character/useProvenanceRows.ts.
- Shared pure equipment helpers (canonical — used by both lib commands and hooks): src/lib/character/equipmentHelpers.ts.
- Class and background starting-equipment screens share the generic concrete-item selector in
  src/components/character/GenericEquipmentSelect.tsx while retaining separate domain commands.
- Manual equipment add/remove/proficiency transitions live in src/lib/character/commands/equipmentCommands.ts. Inventory and ledger changes are one command result and one store update.

7. Hooks and view derivations
- Purpose: thin wrappers from store state to UI-facing derived values.
- Key files: src/hooks/character/*, src/hooks/data/*.
- `useCharacterCalculationContext` is the canonical adapter for effective scores, resolved
  source-qualified entities, rules metadata, and equipment state. Consumers must not rebuild its
  score composition or read persisted raw scores as final values. See
  [Character Calculation Context](calculation-context.md).
- Shared lookup consumption uses the stable named hooks in src/hooks/data/useGameData.ts. Direct gameDataStore selectors are reserved for lifecycle state or callers that explicitly own raw collection sets.
- Combat-stat ownership is exposed through `src/hooks/character/useHitPoints.ts` and `src/hooks/character/useArmorClass.ts`. These hooks combine persisted player state with live class, ability, and equipment derivations and provide the modal-facing atomic save operations.
- Condition rule records are exposed by `useConditions()` in `src/hooks/data/useGameData.ts`; pages should not reconstruct condition names or rules text locally.

Spellcasting note:
- `src/hooks/character/useSpellSlots.ts` is a **read-only** derivation hook: exposes spell slots, profiles, and spellcasting detail per profile. It does not include mutations.
- `src/hooks/character/useSpellProfileMutations.ts` owns all spell mutation callbacks (add/remove spells, toggle prepared, racial spells, profile sync). Callers that need both derived spell state and mutation callbacks must call both hooks and wire their outputs together (see `SpellsPage.tsx` for the pattern).
- `src/hooks/character/useSpellSlotMutations.ts` is the thin store adapter for shared/Pact slot use
  and explicit manual corrections. `src/hooks/character/useRestPreview.ts` composes current derived
  maxima/resources/HP into `applyRest()` and commits its reviewed result as one draft patch.
- The Spells Builder page displays shared and Pact slot capacity without spend/restore controls.
  Slot-use mutations are retained behind the UI boundary for the deferred live-play workspace.
- `src/components/modals/RestPreviewDialog.tsx` remains the tested short/long-rest preview surface
  for the deferred local-play workspace. It is deliberately not launched from the shared builder
  header; the pure rest command and hook remain available without presenting a live-play control in
  the current product scope.

8. Pages and UI composition
- Purpose: user workflows and route-level behavior.
- Key files: src/pages/*, src/components/*, src/pages/rules/RulesPage.tsx, src/pages/rules/SourcesPanel.tsx, src/pages/details/ConditionsPage.tsx, src/components/modals/LevelUpModal.tsx, src/components/modals/HitPointsModal.tsx, src/components/modals/ArmorClassModal.tsx, src/pages/build/ability-scores/model/data.ts, src/pages/build/class/model/pageUtils.ts, src/pages/build/class/model/asi.ts, src/pages/build/class/model/levelsUtils.ts, src/lib/character/commands/classCommands.ts, src/lib/character/commands/raceCommands.ts, src/lib/character/commands/backgroundCommands.ts, src/lib/character/commands/featCommands.ts, src/lib/character/commands/spellCommands.ts, src/lib/character/commands/originSelectionCommand.ts, src/hooks/character/useUnifiedClassSelection.ts, src/pages/build/proficiencies/model/data.ts, src/pages/build/proficiencies/model/types.ts, src/pages/build/background/model/data.ts, src/pages/build/ability-scores/components/MethodPanels.tsx, src/pages/build/ability-scores/components/DetailsPanel.tsx, src/pages/build/class/components/AsiSection.tsx, src/pages/build/class/components/SpellSection.tsx, src/pages/build/class/components/SubclassSection.tsx, src/pages/build/class/components/PassiveFeatureList.tsx, src/pages/build/class/components/ProgressionChoiceCard.tsx, src/pages/build/proficiencies/components/DetailsPanel.tsx, src/pages/build/background/components/DetailsPanel.tsx, src/pages/compendium/CompendiumPage.tsx, src/pages/compendium/CompendiumEntryDetails.tsx, src/lib/compendiumEntries.ts, src/components/modals/FeatOptionsModal.tsx, src/components/updates/ChangelogModal.tsx, src/components/updates/UpdateProgressModal.tsx.
- Full user-facing 5etools rules text renders through `GameContent`, which applies sanitized,
  source-aware recursive previews consistently across build, selection, and Compendium detail
  surfaces. Static exports, text projections, and compact non-interactive summaries use the
  lower-level string renderer explicitly.
- Equipment item details resolve immutable rules text from the game-data `itemLookup` by `name|source` and render it through the same interactive path; recursive tooltip lookup includes both `items` and `itemsBase`. Persisted descriptions are fallback content for custom and imported items. The detail metadata grid is type-aware and omits irrelevant empty fields while retaining any exceptional populated statistics.
- Character entity resolution uses src/lib/5etools/entityResolvers.ts. Source-qualified references resolve exact matches in the caller's primary lookup first, then exact raw-data fallbacks so persisted selections survive filter changes. Name-only fallback is used only when the reference has no source and is deterministic.
- Character creation uses src/hooks/data/useWizardGameData.ts as its draft-scoped data boundary. Wizard steps receive filtered collections or resolved entities and never read the raw game-data store directly.
- Character-library duplicate policy lives in `src/lib/character/characterTransfer.ts`; HomePage
  owns file-picker/download orchestration and the duplicate-mode dialog. File transfer uses complete
  `.tbc` character records; the reusable-build reset is available only as a local duplicate mode.
- The Feats route is a composition shell. `src/pages/feats/hooks/useFeatsPageController.ts` owns
  route-local state/derived orchestration, while `src/pages/feats/components/FeatCards.tsx` owns
  cards and the inspector. Canonical mutations remain in the feat command/provenance layers.
- Characteristics keeps its data-agnostic draft and organization presentation helpers under
  `src/pages/details/characteristics/`. Built-in organizations use a neutral app surface behind
  their supplied artwork; only custom organizations expose a user-selected fallback gradient.
- Large class/feat command modules delegate reusable proficiency, identity, and command-result
  helpers to focused sibling modules without changing their public command entry points.
- Recursive tooltip lookup construction lives in src/lib/renderer/recursiveTooltip.ts. Raw and filtered callers pass an explicit collection set to the same builder, including `itemsBase`.

Current implementation notes:
- Race, class, background, feat, and spell mutations use complete pure commands returning `characterPatch` plus `provenanceUpdate`.
- BuildClassPage arranges sections and modals; subclass, spell, ASI/feat, optional-feature, and
  normalized class-choice decisions live in focused hooks under src/pages/build/class/hooks. The
  class-choice option resolver in src/lib/character/classChoiceOptions.ts joins descriptors to
  filtered source-qualified catalogs without embedding option lists. The class-choice controller
  delegates persistence and feature-shaped grant reconciliation to the class provenance mutation
  hook; item and feat kinds are not assigned mechanical semantics until their domain handlers own
  them. Subclass eligibility is a pure parsed-first calculation with isolated legacy fallbacks.
- Character creation composes the same origin commands through `buildInitialCharacter`; pages and hooks do not reconstruct grant pipelines.
- Level-up HP choices are committed with class progression through `applyLevelUp`; the stored gain is the raw hit-die result so Constitution changes remain live.
- HP reads resolve class/Constitution HP, per-level gain records, manual adjustments, active typed
  effects, and an optional exact override in that order. The management modal's default Overview
  shows the base and every active typed source as read-only calculation rows plus current and
  temporary HP; its separate Manual changes view owns adjustments and exact overrides.
- AC reads across UI and PDF surfaces resolve equipped armor and Dexterity, then manual and active
  typed adjustments, then an optional exact override. The management modal's default Overview
  exposes equipped armor and shields as read-only calculation rows so equipment ownership remains
  on the Equipment route; its separate Manual changes view owns adjustments and exact overrides.
  The legacy `character.armorClass` field is not a display source.
- Movement reads across Builder and PDF surfaces resolve the race/subrace-owned structured base,
  then labeled per-mode adjustments, then exact overrides. `character.speed` is only a walking-speed
  compatibility mirror for legacy import/export.
- Lasting feat resistances and immunities resolve from the selected feat's `name|source` runtime
  record through the calculation context. Structured choice objects are deliberately not guessed;
  their rules prose remains visible and the global manual-effects editor covers the resolved choice.
  Class records expose no equivalent top-level lasting-effect fields in the supported corpus, and
  known/prepared spell effects are not treated as active without an active-effect lifecycle.
- The header heart and shield open the HP and AC management modals. A one-time anchored hint
  advertises these controls from the first Builder page; resetting hints publishes an in-session
  reset event so mounted hints return without an application reload. Because the header persists
  across route changes and its stat group is responsive, the shared anchor hook also rechecks on
  window load/resize, observed anchor resize, and relevant DOM changes instead of assuming the
  anchor was visible when the hint first evaluated.
- Unpinned portaled hints and recursive rules previews use `@floating-ui/react-dom` for measured
  anchoring, offsets, collision-aware flipping/shifting, and live viewport updates. The shared
  scale-aware native title-bar inset in `src/lib/overlayPosition.ts` supplies Floating UI's top
  collision boundary; that module retains only the application-specific clamping used after a
  preview is pinned and dragged. Root previews keep only their Pin action, nested previews add
  direct-history navigation, and pinning freezes the selected entry at its current viewport
  position. Pinned title areas use `src/hooks/ui/useDraggablePreview.ts` for constrained pointer and
  keyboard repositioning while History and Unpin remain independent controls.
- Actions & Effects lives in Builder's Details group and presents source-derived actions and typed
  effects as read-only rows beside clearly separated manual editors. Its responsive split
  workbench keeps the manual form and Actions/Effects tabs in the narrower left pane and the
  complete current source/manual list in the larger right pane. Source-owned entries remain
  editable only through Equipment, Race, Class, Feats, Spells, and their other owning workflows;
  this page never duplicates or deletes them. Source action projection is conservative: structured
  weapon attacks and timed spells are supplemented only by race, feat, and class rules text that
  explicitly grants an action, bonus action, reaction, or attack replacement. Passive prose is not
  promoted to an action, and non-action casting times are omitted from the action-oriented list.
  Source-derived and manual effect lists are independently collapsible. Actions remains the default.
  Cross-page configuration links carry a presentation-only focus key so the destination card can
  scroll into view and briefly highlight itself; the query does not change character state and
  works for both legacy race bonuses and revised background bonuses. Review is the sole
  destination in Builder's final Finish group after Core and Details; its header separates Needs
  Attention from the remaining Character Overview. Builder has no one-item Options group. Rules is
  a character-scoped
  top-level workspace because it configures the whole build and loaded catalog. Its Ruleset,
  Advancement, Character Options, and Sources tabs remain protected until a character is active;
  `/sources` redirects to the Sources tab for compatibility. The selected ruleset remains fixed
  after creation.
- Ability Scores is the canonical editor for origin ability bonuses in both rulesets: 2014 race
  bonuses and 2024 background bonuses are persisted through their existing provenance commands.
  Race shows that link only while a parsed 2014 race choice remains unresolved; fixed and completed
  bonuses are display-only. The selected base-score method, including Custom, does not replace
  origin-bonus requirements. Background shows the current assignment and every parsed assignment
  pattern in compact form, then links to Ability Scores rather than maintaining a duplicate editor.
  Selecting a fixed-feat background does not force the feat options wizard; configurable origin
  feats expose a source-qualified link to their owning Feats entry. Before a 2024 assignment is
  complete, Ability Scores synthesizes a pending Sources row from the parsed background blocks so
  provenance remains visible without persisting a fake grant. Readiness issues for either origin
  route to `/build/ability-scores`.
- Movement remains a focused modal because it combines source-derived walking and alternate modes,
  hover, labeled table rulings, and exact per-mode overrides in one compact correction workflow.
  It is not a live-play surface, and removing it would leave alternate or unsupported structured
  movement without an understandable correction path.
- Conditions is tabbed by Combat State, Exhaustion, Conditions, and Class Resources. Condition names and descriptions, including exhaustion rules, come from the loaded PHB/XPHB condition records selected for the character ruleset.

Auto-update note:
- `electron/updateManager.ts` manages the full electron-updater lifecycle (check, download, install, cancel).
- Update checking runs on startup (3s delay) and every 24 hours when auto-update is enabled.
- `src/components/updates/ChangelogModal.tsx` shows GitHub release notes; `src/components/updates/UpdateProgressModal.tsx` shows download progress with a 3-second install countdown.
- The `autoUpdate` toggle is persisted in `appPreferencesStore`.

Feat options note:
- `src/components/modals/FeatOptionsModal.tsx` is a multi-step wizard for feats with optional player choices (spell picks, proficiency selections, ability score bonuses, optional features, expertise).
- Steps are generated dynamically from the feat's `additionalSpells` and option blocks; dynamic steps are injected after the user chooses a spellcasting class.
- Valid fixed spellcasting classes are retained in completed selections but omitted from wizard navigation, which starts on the remaining spell choices.
- Completed selections are persisted with their owning feat: regular feats use
	`character.feats[].options`, bonus feats use `character.specialFeats[].options`, class progression
	feats use `character.classFeatChoices[].feats[].options`, and race/background choice feats use
	`ChoiceRecord.selectedRefs[].options`. All paths use the same provenance-aware commit, edit, and
	removal workflow.
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
- The route follows the standard flat workspace layout: export controls live in the full-width pane
  header, while the scrollable preview sits directly on the workspace canvas without an enclosing
  page card.
- src/lib/pdf/characterSheetViewModel.ts is the pure character/game-data projection boundary and resolves class, race/subrace, background, organization, spell, and item-property entities from raw composite lookups.
- Pure template mappings live in src/lib/pdf/characterSheetMapping2014.ts and src/lib/pdf/characterSheetMapping2024.ts. src/lib/pdf/pdfFormAdapter.ts owns AcroForm filling, portable saved-file appearances, and MPMB cleanup; src/lib/pdf/pdfImageAdapter.ts owns portrait and organization-image loading and embedding; src/lib/pdf/characterSheetPdf.ts is the thin orchestrator.
- CharacterSheetPage prepares and memoizes the view model before template loading, then reuses it for mapping and adapter execution.
- Every download runs the pure `src/lib/pdf/exportPreflight.ts` contract against the same view model,
  readiness result, and active effect declarations. Fixed-form capacities are centralized in
  `src/lib/pdf/characterSheetCapacities.ts` and shared by mappings and preflight so warning limits
  cannot drift from actual output.
- The 2024 mapping covers every text and checkbox widget in the shipped two-page form, including weapons, spellcasting, prepared spells, inventory, attunement, and narrative blocks. The 2014 mapping targets semantic inputs across all four pages while excluding MPMB-only display/calculation helpers. See docs/pdf-generation.md for the audited coverage and fixed-template limits.
- PDF form editing is powered by `@cantoo/pdf-lib` (maintained fork of pdf-lib) to keep browser-side AcroForm fill/edit behavior stable.
- The 2014 pipeline also strips MPMB interactive chrome (buttons, ammo tracker widgets, calculation scripts, attack-mod placeholder state) before save/render.

## Routing Overview

- /: HomePage
- /build/*: Race, Class, Background, Proficiencies, Ability Scores
- /feats, /spells, /equipment
- /details/*: Portrait, Characteristics, Conditions
- /rules, /sources
- /character-sheet, /compendium, /settings

Primary definition: src/App.tsx.

## Boundary Rules

- Never edit data/ directly. Source fixups belong in src/lib/5etools/sourceFallbacks.ts.
- Components and pages should not import JSON data directly.
- Business rules belong in src/lib as pure functions.
- Hooks should orchestrate state and derivation, not own canonical rules.
- Character writes flow through updateCharacter(id, patch) in src/store/characterStore.ts.
- 5etools entity list keys must use name|source.
- `npm run check:health` enforces layer direction, production/test separation, managed-data access,
  circular-dependency, and unused-code rules in local validation and CI.

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
