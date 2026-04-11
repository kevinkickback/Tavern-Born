# Architecture Map

This document describes the current Tavern-Born runtime architecture and where responsibilities live.

## Layered Architecture

1. Electron host layer
- Purpose: native window lifecycle, secure IPC bridge, filesystem access for local data source.
- Key files: electron/main.ts, electron/preload.ts.

2. Application shell and routing
- Purpose: route composition, global providers, app-level overlays.
- Key files: src/main.tsx, src/App.tsx, src/components/layout/AppLayout.tsx.

3. State and persistence
- Purpose: app state ownership and IndexedDB persistence.
- Key files: src/store/characterStore.ts, src/store/gameDataStore.ts, src/lib/storage/idb-storage.ts, src/lib/storage/dataCache.ts, src/lib/storage/collapseState.ts.

4. Data ingestion and indexing
- Purpose: load and parse 5etools data from local or remote source, then build lookups.
- Key files: src/lib/5etools/dataLoader.ts, src/lib/5etools/parsers.ts, src/lib/5etools/classData.ts, src/lib/5etools/validator.ts, src/lib/5etools/schemas.ts, src/lib/5etools/lookups.ts, src/lib/5etools/filters.ts, src/lib/5etools/urlUtils.ts, src/lib/5etools/sourceFallbacks.ts, src/lib/5etools/index.ts.

5. Domain logic
- Purpose: pure calculations and game rules.
- Key files: src/lib/characterUtils.ts, src/lib/calculations/gameRules.ts, src/lib/calculations/abilityScores.ts, src/lib/calculations/spellSlots.ts, src/lib/calculations/spellProfiles.ts, src/lib/calculations/spellUtils.ts, src/lib/calculations/skills.ts, src/lib/calculations/prerequisites.ts, src/lib/calculations/raceUtils.ts, src/lib/calculations/armorClass.ts.

6. Provenance system
- Purpose: track source of grants and reconcile when race/class/features change.
- Key files: src/lib/provenance/types.ts, src/lib/provenance/ledger.ts, src/lib/provenance/reconciliation.ts, src/lib/provenance/normalization.ts, src/lib/provenance/sourceLabels.ts, src/lib/provenance/summaries.ts, src/lib/provenance/applyRaceGrants.ts, src/lib/provenance/applyClassGrants.ts, src/lib/provenance/applyBackgroundGrants.ts, src/lib/provenance/applyFeatAndOptionalFeatureGrants.ts, src/lib/provenance/index.ts, src/lib/provenance/sectionRows.ts, src/hooks/character/useProvenance.ts, src/hooks/character/useProvenanceMutations.ts, src/hooks/character/useProvenanceRows.ts.

7. Hooks and view derivations
- Purpose: thin wrappers from store state to UI-facing derived values.
- Key files: src/hooks/character/*, src/hooks/data/*.

Spellcasting note:
- `src/hooks/character/useSpellSlots.ts` now derives spell list/detail data from profile-based spell state and multiclass slot breakdown helpers.

8. Pages and UI composition
- Purpose: user workflows and route-level behavior.
- Key files: src/pages/*, src/components/*, src/pages/build/ability-scores/model/data.ts, src/pages/build/class/model/pageUtils.ts, src/pages/build/class/model/asi.ts, src/pages/build/class/model/mutations.ts, src/pages/build/class/model/levelsUtils.ts, src/pages/build/proficiencies/model/data.ts, src/pages/build/proficiencies/model/types.ts, src/pages/build/background/model/data.ts, src/pages/build/ability-scores/components/MethodPanels.tsx, src/pages/build/ability-scores/components/DetailsPanel.tsx, src/pages/build/ability-scores/components/RacialBonusesPanel.tsx, src/pages/build/class/components/AsiSection.tsx, src/pages/build/class/components/SpellSection.tsx, src/pages/build/class/components/SubclassSection.tsx, src/pages/build/class/components/PassiveFeatureList.tsx, src/pages/build/class/components/ProgressionChoiceCard.tsx, src/pages/build/proficiencies/components/DetailsPanel.tsx, src/pages/build/proficiencies/components/TabsPanel.tsx, src/pages/build/background/components/DetailsPanel.tsx, src/pages/compendium/CompendiumPage.tsx, src/pages/compendium/CompendiumEntryDetails.tsx, src/lib/compendiumEntries.ts.

Character sheet PDF note:
- Route src/pages/CharacterSheetPage.tsx renders the PDF preview/download workflow.
- PDF mapping and filling logic lives in src/lib/pdf/characterSheetPdf.ts, with template-aware mapping for both 2014 and 2024 sheets.
- PDF form editing is powered by `@cantoo/pdf-lib` (maintained fork of pdf-lib) to keep browser-side AcroForm fill/edit behavior stable.
- The 2014 pipeline also strips MPMB interactive chrome (buttons, ammo tracker widgets, calculation scripts, attack-mod placeholder state) before save/render.

## Routing Overview

- /: HomePage
- /build/*: Race, Class, Background, Proficiencies, Ability Scores
- /feats, /spells, /equipment
- /details/*: Portrait, Characteristics, Appearance, Allies/Organizations, History
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
- New parser behavior: src/lib/5etools/parsers.ts plus validator/schemas updates.
- New ingestion lookup: src/lib/5etools/lookups.ts plus hook-level usage.
- New state field or mutation lifecycle: relevant store in src/store/*.ts.
- New route-level user flow: src/pages/* with extracted component logic under src/components/*.
- Page-specific pure helper logic for a single route: colocate under that route folder (for example src/pages/build/class/model/*, src/pages/feats/model/*, or src/pages/compendium/*) and keep it framework-free when possible.

## Drift Watch

Revisit this file when any of these happen:

- New store or persistence mechanism
- Significant route structure changes
- New ingestion stage or parser contract
- Provenance model changes
