# Data flow

This guide owns sequence and lifecycle. Follow the linked owner for domain edge cases.

## Startup and game data

Entry points: useDataInit, gameDataStore, dataLoader and dataCache.

1. IndexedDB hydrates preferences and lightweight source configuration. Theme bootstrap applies
   local-storage colors before React paints and reconciles them after hydration.
2. The immutable Included SRD is always the base. One authorized local folder or HTTPS root may
   add content; no external setup is required.
3. A matching parsed cache supplies initial data. If it is unavailable, the app loads the Included
   SRD automatically. The startup overlay waits for usable local data and the first workspace
   render. It offers recovery when local data fails, and Change source opens setup while the
   workspace is still loading. Automatic source checks respect the hydrated preference and run
   in the background.
   Automatic startup catalog attempts have a 15-second limit. Manual source checks, validation,
   and applying or restoring data allow up to 60 seconds per catalog attempt.
4. Each candidate is checked as a unit. Composition overlays exact identities, rebuilds retained
   raw families and creates lookup indexes. Changed background candidates and verified withdrawals
   wait for explicit review. Applying a candidate writes the source settings and cache together
   before publishing the accepted catalog in memory.
5. Required failures preserve the prior complete catalog and cache. Remove Additional Content
   loads the bundled catalog before removing the external configuration.

A changed installed pack invalidates caches for the previous pack. Layered cache identity includes
the installed pack and external source. The accepted GitHub revision, content digest and dates
distinguish a source check from a catalog change. Missing optional lookup indexes are built once.
Supplied empty maps remain authoritative.

The external configurator loads on demand. In development, Electron disables persistent HTTP disk
cache before Chromium startup to avoid stale Vite chunks, and Vite excludes .tmp from watching.
Packaged apps retain normal HTTP caching. Source/assets/Electron watching remains active.

See [Ingestion](data-ingestion.md) for transport capabilities, required/optional resources, layering
and cache admission.

## Character draft and save

Entry point: [characterStore](../src/store/characterStore.ts).

1. Startup has no active character; selection copies a saved record into the active draft.
2. Hooks derive UI values. User edits update the draft and dirty state through store APIs.
3. Save captures the requested revision and queues a durable IndexedDB transaction.
4. Success publishes the saved record and clears dirty state only if that same draft is current.
   Later edits remain dirty; rejection preserves the prior save and enables retry.
5. Create/import/duplicate/inactive changes/deletion use the same ordered library boundary. UI
   waits for acknowledgement before closing or announcing success. Rejected creation/deletion
   retains form input/selection. Pending forms cannot dismiss.
6. Clean system corrections share the acknowledged queue; dirty corrections wait for explicit Save.
   Draft edits and character selection do not rewrite the saved library.

Electron receives unsaved state and requests confirmation before close. Preferences/layout do not
make characters dirty. Event-only preload subscriptions expose no native payload and return cleanup
for their exact listener; consumers must unsubscribe on unmount.

See [State Management](state-management.md#saved-library-transactions) for hydration, overlapping
saves, reload ordering, failure/retry and quarantine acknowledgement. Before submission, the creation
wizard confirms discarding remaining edits; pending creation also preserves input and blocks dismissal.

## Domain mutation and derived values

A controller gathers exact choices and parsed dependencies; a pure command returns the full patch
and provenance; a hook commits both once. Initial creation uses the same commands. No intermediate
materialized/ledger pair becomes visible or durable.

CharacterCalculationContext resolves effective ability scores, HP/AC, effects and equipment.
Builder, Review, readiness, Actions and immutable PDF use this shared boundary. Persist allocated
choices and runtime values, derive calculations. See [State Management](state-management.md#calculation-context)
and [Provenance](provenance.md).

## Rules and source settings

Character Rules owns ruleset and character options. Additional Content owns allowed books and
newer-printing preference at /sources. Creation uses useWizardGameData; editing uses
useFilteredGameData or named hooks. Selection lists remain filtered while retained exact references
may use raw fallback according to their domain contract. Source removal atomically prunes affected
intentional spell choices and their ownership without retracting independent/fixed grants.

Core PHB/XPHB is implicit. Bundled public items stay available under the shared player-item policy;
DMG/MM/XDMG/XMM provenance does not enable those full books or create selectable sourcebook choices.
See [Ruleset compatibility](contracts/reference-resolution.md#ruleset-compatibility),
[Source removal](contracts/reference-resolution.md#source-removal) and [Native racial spells](contracts/racial-ownership.md#native-racial-spells)
for exact source/printing removal, owner-specific pruning and restoration behavior. Other source
conflicts are reported rather than silently rewritten.

## Rules content and previews

Interactive content uses sanitized `GameContent` and the [shared preview contract](contracts/rules-previews.md).
Static PDF/compact projections may use the lower-level renderer explicitly.

## Character format compatibility

Import/hydration validates the exact current format before exposing a record. Unsupported originals
stay in durable exportable quarantine until acknowledged; there is no pre-release conversion.
See [Schema compatibility](state-management.md#schema-compatibility) for current admission and the
separate promise to preserve released v1.x characters.

## Auto-update

[updateManager](../electron/updateManager.ts) owns check/download/cancel/install IPC. Automatic
checks run after startup and at the configured interval when enabled. Notifications offer download;
completed installers require the update modal before relaunch. Portable builds do not auto-install.
Scheduled failures stay quiet; manual checks report connection errors. Release creation follows the
separately authorized [release procedure](releasing.md).
