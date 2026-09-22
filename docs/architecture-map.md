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

### Character mutations

User writes go through `updateCharacter(id, patch)` (or the active-character convenience wrappers).
Commands own transition and cleanup semantics. `reconcileCharacter` is reserved for silent system
corrections and must preserve dirty-draft behavior.

### Spellcasting

- `useSpellSlots` is read-only derived state.
- `useSpellProfileMutations` owns profile add/remove/prepare/racial-choice writes and commits spell
  state with provenance atomically.
- `useSpellProvenanceMutations` owns class-page per-level selection and replacement commands.
- Shared and Pact slot usage are separate persisted pools; maxima remain derived.

### Parsed game data

All canonical values originate from parsed entities. Exact references use `name|source`; filtered
resolution may fall back to the exact raw entity so saved choices survive filter changes, but must
never guess an unqualified printing.

### Rules content

User-facing 5etools content goes through `GameContent`, which provides sanitization and source-aware
recursive previews. PDFs and compact noninteractive projections may use the lower-level string
renderer explicitly. Preview positioning and the single pinned/transient chain are owned by
`RulesPreviewManager` and Floating UI helpers, not page components.

### Assets and responsive workspaces

Runtime assets resolve through `src/lib/assetUrls.ts` so development and packaged `file://` paths
behave alike. Documentation assets belong under `docs/assets/`. Content pages use the shared
centered width convention; `SplitPane` owns compact one-pane behavior and desktop collapse state.

## Current high-level flows

- Character creation composes the same race, class, and background commands used by edit pages.
- Class changes retract unavailable choices, ASIs, spell grants, and replacement events atomically.
- HP and AC are live derivations plus explicit adjustments/overrides; their header modals do not
  take ownership of class progression or equipment.
- Character actions and effects are view-neutral projections shared by Review, Builder, and PDF.
- Character duplicate/export/import operates on complete current-format records.
- The Compendium is an editorial entity index, not an index of every repeated class-feature
  definition. It includes canonical creature stat blocks and context-qualified subclass features so
  character-option references can be browsed independently of the builder. Creature field ordering
  and section semantics are adapted from the upstream 5etools bestiary renderer into a pure view
  model under `src/lib/5etools/`; React owns only Tavern Born's presentation.

## Dependency guardrails

The dependency-cruiser configuration enforces broad layer boundaries; `knip` catches unused public
surface. These checks supplement, rather than replace, the ownership rules above. When a feature
does not fit cleanly, update this document with the new stable boundary instead of adding another
parallel system.
