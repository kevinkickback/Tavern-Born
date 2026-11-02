# Architecture Map

Tavern-Born is an Electron application with a React renderer, Zustand state, pure domain commands,
and a parsed 5etools catalog. Dependencies should point inward: UI → hooks → domain/store, while
domain libraries remain independent of React and Zustand.

## Layers

| Layer | Owns | Main locations |
| --- | --- | --- |
| Electron host | Window lifecycle, secure IPC, local-file capability, updater, window state | `electron/` |
| Application shell | Routing, global providers, navigation, global overlays | `src/App.tsx`, `src/components/layout/` |
| Pages and components | User workflows and presentation | `src/pages/`, `src/components/` |
| Hooks | Thin state/data adapters and view derivation | `src/hooks/character/`, `src/hooks/data/`, `src/hooks/ui/` |
| Domain logic | Pure calculations, commands, readiness, transfers, PDF projection | `src/lib/` |
| Provenance | Grant ownership and reconciliation | `src/lib/provenance/` |
| Ingestion | Loading, parsing, validation, filtering, and entity resolution | `src/lib/5etools/` |
| State and persistence | Character drafts, game-data lifecycle, preferences, IndexedDB | `src/store/`, `src/lib/storage/` |
| Types | Runtime-independent shared contracts | `src/types/` |

## Placement rules

- Put canonical rules and calculations in a pure module under `src/lib/`.
- Put complete character transitions in `src/lib/character/commands/`. Commands return one
  `characterPatch` plus one `provenanceUpdate` when ownership changes.
- Hooks gather store state and parsed dependencies, invoke pure code, and commit once.
- Components render and coordinate interaction; they do not import JSON or recreate business rules.
- Types must not import parser or normalizer implementations.
- Game-data UI reads use `useFilteredGameData()` or named hooks from
  `src/hooks/data/useGameData.ts`. Raw store selectors are for lifecycle owners.

## Concern routing

Start at the narrowest matching owner instead of searching a manual file catalog:

| Concern | Start here |
| --- | --- |
| Character creation/editing | `src/pages/build/`, then the related character hook and command |
| Ability scores, HP, AC, skills, movement | `src/lib/calculations/` and `useCharacterCalculationContext` |
| Class progression and choices | `src/lib/character/commands/classCommands.ts`, class page controllers |
| Spells | `spellProfiles*`, `spellSlots.ts`, `spellCommands.ts`, spell hooks |
| Equipment | `equipmentCommands.ts`, `equipmentHelpers.ts`, `useEquipment.ts` |
| Readiness and Review | `src/lib/readiness/`, `src/pages/build/review/` |
| Source filtering and reprints | `useFilteredGameData.ts`, `src/lib/5etools/filters.ts` |
| Rules text and previews | `GameContent`, renderer modules, `RulesPreviewManager` |
| Compendium | `src/lib/compendiumEntries.ts`, 5etools stat-block adapters, `src/pages/compendium/` |
| PDF export | `src/lib/pdf/` |
| Imports, copies, exports | `src/lib/character/characterTransfer.ts`, character store |
| Updates and packaging | `electron/updateManager.ts`, update components, workflow files |

## Stable boundaries

### Character calculations

`CharacterCalculationContext` is the shared boundary for effective scores, resolved entities,
typed effects, equipment, rules metadata, HP, AC, prerequisites, spellcasting, readiness, and PDF
inputs. React callers use `useCharacterCalculationContext`. Ordinary UI/export code must not treat
persisted base ability scores as effective totals.
Filtered game-data views and calculation contexts are reused across hooks for the same source
settings, game-data object, and character object. Store updates must replace those objects when
their contents change so the shared derived values are invalidated.

### Character mutations

User writes go through `updateCharacter(id, patch)` (or the active-character convenience wrappers).
Commands own transition and cleanup semantics. `reconcileCharacter` is reserved for silent system
corrections and must preserve dirty-draft behavior.

### Spellcasting

See [spell state](state-management.md#spell-state) for intent, derived casting and mutation adapters.

### Parsed game data

Canonical values originate from parsed entities. Simple entity references use complete name/source
fields; class/subclass features also require owner and gain fields. Filtered resolution may retain
exact raw fallback where the domain allows it. Never generalize one domain's legacy source-less
exception into another resolver. See [Reference resolution](contracts/reference-resolution.md).

### Rules content

User-facing 5etools content goes through `GameContent`, which provides sanitization and source-aware
recursive previews. PDFs and compact noninteractive projections may use the lower-level string
renderer explicitly. Preview positioning and the shared pinned/transient chain belong to
RulesPreviewManager and Floating UI helpers. The [preview contract](contracts/rules-previews.md)
records current creator integration limits.

### Assets and responsive workspaces

Runtime assets resolve through `src/lib/assetUrls.ts` so development and packaged `file://` paths
behave alike. Documentation assets belong under `docs/assets/`; packaging artwork and its retained
source belong under `build/`. Content pages use the shared
centered width convention; `SplitPane` owns compact one-pane behavior and desktop collapse state.

## Current high-level flows

[Data flow](data-flow.md) owns startup, domain mutation, draft/save and update sequences.
The Compendium indexes editorial entities, including canonical creatures and context-qualified
subclass features, rather than every repeated feature definition. Its creature model adapts the
upstream 5etools bestiary renderer; React owns presentation.

## Dependency guardrails

The dependency-cruiser configuration enforces broad layer boundaries; `knip` catches unused public
surface. These checks supplement, rather than replace, the ownership rules above. When a feature
does not fit cleanly, update this document with the new stable boundary instead of adding another
parallel system.
