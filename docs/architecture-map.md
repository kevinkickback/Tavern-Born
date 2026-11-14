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

## From startup to export

Electron authorizes local file access and runs the catalog utility. The renderer opens a usable catalog before handing off the workspace. The wizard uses its draft rules and sources. The Builder opens a saved character as a draft, applies commands in memory, then saves through the durable library queue. Review and PDF export use the shared calculation context.

Read [catalog startup](data-ingestion.md#startup-and-update-checks), [durable writes](state-management.md#saved-library-transactions), and [PDF projection](pdf-generation.md#pipeline) for those boundaries. The Compendium uses the global catalog rather than the character filter.

## Assets and responsive workspaces

Runtime assets resolve through `src/lib/assetUrls.ts` so development and packaged `file://` paths
behave alike. Documentation assets belong under `docs/assets/`; packaging artwork and its retained
source belong under `build/`. Content pages use the shared
centered width convention; `SplitPane` owns compact one-pane behavior and desktop collapse state.

## Large selection lists

`SelectionModal` virtualizes the complete filtered result set with stable item IDs. Search, filters
and virtualizer state stay local; canonical catalogs stay in `gameDataStore`. Incremental batches
must not replace the full virtual range. Use `Number.POSITIVE_INFINITY` for an uncapped category.

The shared workspace components own scroll and responsive pane behavior. Compact details selection does not toggle desktop collapse. Use the shared keyboard and ARIA behavior for tab lists. Portrait pan uses the card’s logical coordinates and commits once at drag end.

## Rules preview manager

Interactive 5etools content is sanitized and uses `GameContent` and one root `RulesPreviewManager`. Creator triggers
and nested references use the wizard's catalog. Triggers pass immutable descriptors so a pinned
preview survives route changes and virtual row unmounts.

Two transient shells roll forward without moving the shell under the pointer. An explicit pin
action controls the one independent draggable snapshot. Escape closes the newest transient
first and restores focus without reopening the trigger. Ordinary dialogs, menus and listboxes
retain their own focus and Escape behavior.

The creator hosts the stable portal inside its viewport-fixed modal boundary before Radix hides
siblings. Host changes clear transient previews and preserve the pin. Use Floating UI with the
existing collision fallback, hover corridors and fade-only entry. Preview scrolling stays
inside its own shell.

Noninteractive compact text and PDF can use the lower-level renderer.

## Desktop lifecycle

Electron receives unsaved state and requests confirmation before close. Preferences/layout do not
make characters dirty. Event-only preload subscriptions expose no native payload and return cleanup
for their exact listener; consumers must unsubscribe on unmount.

Electron allows one Tavern Born process per desktop profile. Starting it again restores or focuses
the existing window and keeps its draft. Separate profiles can run independently.
The pinned Windows portable builder uses `portable.unpackDirName: true` for a directory unique to
each launch. This keeps the launcher from replacing a running instance's files before Electron
checks the lock. Verify the setting against the installed builder when upgrading it.

## Auto-update

[updateManager](../electron/updateManager.ts) owns check/download/cancel/install IPC. Automatic
checks run after saved preferences load and at the configured interval when enabled. Changing the
setting starts or stops future scheduled checks. Manual checks are available either way.
On macOS and Windows Portable, the update dialog links to the official release download page.
Install the new Mac app from its DMG or replace the portable executable with the new download.
Upgrading from macOS v0.6.0 or earlier starts on the
[GitHub releases page](https://github.com/kevinkickback/Tavern-Born/releases).
On Windows Setup and Linux, the notification offers installation and relaunch from the app.
Scheduled failures stay quiet; manual checks report connection errors. Release creation follows the
separately authorized [release workflow](../.github/workflows/release.yml).

## Dependency guardrails

The dependency-cruiser configuration enforces broad layer boundaries; `knip` catches unused public
surface. These checks supplement, rather than replace, the ownership rules above. When a feature
does not fit cleanly, update this document with the new stable boundary instead of adding another
parallel system.
