# Data flow

This guide owns sequence and lifecycle. Follow the linked owner for domain edge cases.

## Startup and game data

Entry points: useDataInit, gameDataStore, dataLoader and dataCache.

1. IndexedDB hydrates preferences and lightweight source configuration. Theme bootstrap applies
   local-storage colors before React paints and reconciles them after hydration.
2. The immutable Included SRD is always the base. One authorized local folder or HTTPS root may
   supply additional content. First successful bundled load offers a one-time welcome; continuing
   needs no external setup. Add/Change Additional Content opens the existing chooser, whose Back
   action returns to the introduction without acknowledging it.
3. A usable parsed cache supplies initial data. Required startup refresh keeps the startup overlay
   active until success/failure; editing cannot begin against a catalog awaiting replacement.
   Hydration, cache, connection and resource progress remain distinct. Later Settings refreshes are modeless.
4. Each source loads independently. Composition overlays exact identities, rebuilds retained raw
   families and lookup indexes, then publishes memory/cache atomically. Superseded work cannot commit.
5. Required failures preserve the prior complete catalog/cache. Remove Additional Content admits
   and loads the bundled catalog before removing external configuration; failure preserves both.

A changed installed pack invalidates bundled-only caches even with external auto-refresh disabled.
Layered identity includes the pack and external source; per-layer fingerprints/counts identify changes.
lastUpdateCheckAt advances after a successful check, while lastDataChangedAt requires a changed
content fingerprint. Missing optional lookup indexes are built once; supplied empty maps remain authoritative.

The external configurator loads on demand. In development, Electron disables persistent HTTP disk
cache before Chromium startup to avoid stale Vite chunks, and Vite excludes .tmp from watching.
Packaged apps retain normal HTTP caching. Source/assets/Electron watching remains active.

See [Ingestion](data-ingestion.md) for transport capabilities, required/optional resources, layering
and cache admission. The Included SRD summary presents SRD document versions, rules and offline
availability; internal cache/pack metadata stays out of that user flow.

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
contribute to character dirty state. The preload close callback still forwards the Electron event;
stripping it with correct listener cleanup remains queued work, not a delivered security claim.

See [State Management](state-management.md#saved-library-transactions) for hydration, overlapping
saves, reload ordering, failure/retry and quarantine acknowledgement. Unfinished-input dismissal
before creation is a separate open requirement from protection during a pending write.

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
Bundled-only selection surfaces hide source counts and direct additional-content setup to Settings.
See [Ruleset compatibility](contracts/reference-resolution.md#ruleset-compatibility),
[Source removal](contracts/reference-resolution.md#source-removal) and [Native racial spells](contracts/racial-ownership.md#native-racial-spells)
for exact source/printing removal, owner-specific pruning and restoration behavior. Other source
conflicts are reported rather than silently rewritten.

## Rules content and previews

GameContent renders supported structured entries as sanitized interactive content with source-aware
recursive lookup. RulesPreviewManager owns its shared pinned/transient chain. Creator TraitTooltip
wrappers still own a separate outer tooltip; [shared preview integration](contracts/rules-previews.md)
remains required work. Static PDF/compact projections may use the lower-level renderer explicitly.

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
