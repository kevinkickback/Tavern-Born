# Bundled SRD Rules Implementation Plan

Status: in progress on `feature/bundled-srd-rules` (2026-09-19).

## Outcome

Ship Tavern Born with an offline, read-only catalog containing both SRD 5.1 (the 2014/5e rules)
and SRD 5.2.1 (the 2024/5.5e rules). A fresh install must support character creation without a
user-selected data source. Users may still replace the bundled catalog with an external 5etools
checkout or URL for content they are entitled to use.

The bundle must use the existing 5etools-shaped resource files, validation, parsers, normalizers,
lookups, filters, and `GameData` model. It must not introduce SRD-specific entity types or a second
rules engine.

## Decisions

1. **One combined catalog.** Package SRD 5.1 and SRD 5.2.1 as one source because Tavern Born loads
   one global game-data catalog and can hold 2014 and 2024 characters at the same time. Preserve the
   original `PHB`/`XPHB` source-qualified identities so existing ruleset filters separate them.
2. **Same ingestion pipeline.** Select the source before resource loading, then run bundled,
   local, and remote resources through the same schemas, parsers, diagnostics, and lookup builder.
3. **External data replaces rather than merges.** Never merge the bundled and external raw
   catalogs. This avoids duplicate entities and ambiguous reprints while retaining stable
   `name|source` references when users switch sources.
4. **Generated data stays outside `data/`.** The managed `data/` tree is read-only input. Generated
   snapshots belong under `resources/srd/` and ship through Electron's packaged resources.
5. **Fail closed on licensing and dependency closure.** `srd` and `srd52` flags are candidate
   selectors, not sufficient provenance by themselves. Every distributed field must be traceable
   to the corresponding official SRD, and every unflagged supporting record must be explicitly
   justified or omitted.
6. **Bundled content is the safe default.** Existing users keep their configured external source.
   New users and users who choose “Restore bundled SRD” use the immutable bundled source.

## Current Extension Points

| Concern | Existing owner | Planned change |
| --- | --- | --- |
| Source configuration | `src/types/5etools.ts` | Add a discriminated bundled source while retaining local/remote fields. |
| Resource loading | `src/lib/5etools/dataLoader.ts` | Separate resource transport from the existing parse pipeline; add a bundled reader. |
| Local file capability | `electron/main.ts`, `electron/preload.ts` | Add a narrowly scoped, read-only bundled-JSON IPC capability. |
| Startup and fallback | `src/store/gameDataStore.ts`, `src/hooks/data/useDataInit.ts` | Default to the bundled source and preserve last-known-good external data. |
| Cache identity | `src/lib/storage/dataCache.ts` | Key source snapshots by stable source ID and bundled pack version. |
| First-run UI | `DataSourceStartupModal`, `DataSourceConfigurator` | Make bundled SRD the default and external setup optional. |
| Packaging | `package.json`, bundle-budget checks | Ship versioned SRD resources and measure their packaged size separately. |

## Phase 0 — Licensing and Provenance Gate

- [x] Pin the official English SRD 5.1 and SRD 5.2.1 documents, publication dates, download URLs,
  and SHA-256 checksums in a machine-readable provenance file.
- [x] Record the exact attribution statements supplied by both SRDs and the CC BY 4.0 license URL.
- [ ] Confirm that the planned structured representation contains only material licensed by those
  documents. Do not assume a 5etools repository's code license also licenses its data.
- [x] Define a transformation notice stating that Tavern Born converted and structured the SRD
  material. Keep it separate from the prescribed Wizards attribution statements.
- [ ] Explicitly exclude D&D Beyond Basic Rules, non-SRD books, product art, logos, trade dress,
  setting material, and records that cannot be traced to an official SRD.

Exit gate: do not commit a distributable snapshot until the provenance and notices have been
reviewed. The official SRD page confirms that SRD 5.1 and SRD 5.2.1 are available under CC BY 4.0;
the Creator FAQ separately states that D&D Beyond Basic Rules are not reusable SRD content.

Authoritative references:

- <https://www.dndbeyond.com/srd>
- <https://www.dndbeyond.com/creator-faq>
- <https://creativecommons.org/licenses/by/4.0/>

## Phase 1 — Reproducible Combined Snapshot

- [x] Add a deterministic extraction command that accepts an explicit 5etools-format input root
  and pinned upstream revision. It may read `data/`, but must never modify it.
- [x] Select candidate roots carrying `srd: true` or `srd52: true` across the entity collections
  already consumed by `FiveEToolsDataLoader`.
- [ ] Follow source-qualified references needed by selected classes, subclasses, class features,
  optional features, races/species, backgrounds, feats, spells, equipment, actions, conditions,
  skills, languages, and rule tables.
  - [x] Close class-feature, subclass-feature, inline subclass-feature, and base-item references;
    prune embedded non-SRD optional features only through explicit audited source rules.
- [x] Preserve the exact file layout, collection keys, indexes, and generated spell-source lookup
  expected by the existing loader. Emit both rules generations into one catalog.
- [ ] Reject unflagged dependencies unless an audited allowlist entry records the reference,
  reason, official-SRD location, and owning pack.
  - [x] Require complete, unique item-support approvals and fail when an approval becomes unused.
- [ ] Strip unused books, adventures, fluff, images, and non-SRD metadata. Optional resources may
  be empty only where the existing loader already accepts that shape.
- [x] Emit `resources/srd/core/data/`, a coverage report, and `manifest.json` containing:
  pack ID/version, the two SRD versions, source checksums, upstream revision, extractor version,
  attribution, transformation notice, entity counts, file checksums, and generation timestamp.
- [ ] Make generation byte-for-byte deterministic and add a verification mode that fails on stale
  output, missing references, duplicate `name|source` identities, unapproved records, or checksum
  drift.
  - [x] Verify missing, changed, and unexpected managed files in one pass; corpus construction now
    rejects dangling structural references and stale audit approvals.
- [x] Add corpus tests proving that every root record has the appropriate SRD marker and every
  dependency is covered by the provenance manifest.

Exit gate: the generated catalog passes the existing loader, validator, capability report, and
source-qualified lookup collision tests without any SRD-only parser branch.

## Phase 2 — Bundled Resource Transport

- [ ] Refactor `FiveEToolsDataLoader` around a small `readJson(relativePath)` resource-reader
  boundary. Keep the current bounded concurrency, abort, timeout, progress, validation, parsing,
  and partial-resource rules unchanged.
- [ ] Retain adapters for the existing remote URL and authorized local directory sources.
- [x] Add a bundled adapter backed by a preload IPC method that accepts only normalized relative
  `.json` paths below Tavern Born's immutable packaged SRD root.
- [x] Resolve the development root from the repository and the packaged root from
  `process.resourcesPath`; canonicalize both root and target, reject traversal/symlink escapes,
  and retain the existing JSON size limit.
- [ ] Configure Electron Builder `extraResources` for `resources/srd/core/**`. Do not place the
  snapshot in the renderer bundle or expose arbitrary packaged-file reads.
- [ ] Extend `DataSourceConfig` with `type: 'bundled'`, a stable pack ID, and version. Keep a
  compatibility migration for persisted local/remote configurations.

Exit gate: the same `loadDataFromSource` contract returns equivalent normalized `GameData` for a
bundled fixture and a matching local fixture.

## Phase 3 — Startup, Cache, and Fallback Semantics

- [ ] Define one `DEFAULT_BUNDLED_SOURCE` from the packaged manifest rather than scattering paths
  or versions through UI code.
- [ ] When hydration finds neither a configured source nor a compatible cache, load the bundled
  source automatically. Remove `unconfigured` as a normal fresh-install terminal state.
- [ ] Preserve existing local/remote choices during migration; do not silently replace a working
  external source for an existing user.
- [ ] Include bundled pack ID/version in cache identity so an app update invalidates only an older
  snapshot cache. Keep parsed-content fingerprints deterministic.
- [ ] Keep foreground/background replacement atomic. A failed external refresh retains the
  last-known-good external cache; if no usable external cache exists, offer an explicit bundled
  fallback and record diagnostics without deleting the external configuration.
- [ ] Change “Clear Data” into “Restore bundled SRD” for external sources. For the bundled source,
  allow rebuilding its parsed cache without making the app content-free.
- [ ] Do not auto-refresh immutable bundled data. It changes only with an application release.

Exit gate: first launch, cache reuse, app upgrade, external-source failure, source switching, and
cache clearing all end with a complete usable catalog.

## Phase 4 — First-Run and Settings Experience

- [ ] Replace the blocking data-source setup prompt with a short first-run message that says SRD
  content is included. Its primary action continues with bundled content; a secondary “Add more
  content” action opens the existing external local/remote controls.
- [ ] Rework `DataSourceConfigurator` into two clear states:
  “Bundled SRD 5.1 + 5.2.1” and “External 5etools source.” Reuse the current remote validation,
  local folder picker, load progress, cancellation, and error feedback.
- [ ] Show the active source, bundled version, last data change, validation status, and license in
  Settings. Show external-path details only for external sources.
- [ ] Update the status bar and empty states to describe “Bundled SRD” or “External source” instead
  of reporting no data on a normal installation.
- [ ] Explain that external data is user supplied, replaces the bundled presentation catalog, and
  is not distributed by Tavern Born.
- [ ] Preserve forced setup as a recoverable settings flow, but never require network access or a
  folder selection to enter the app.

Exit gate: a first-time user can remain offline and reach character creation with one confirmation;
an advanced user can configure, refresh, replace, and leave an external source.

## Phase 5 — Notices, Documentation, and Release Packaging

- [ ] Add the two official attribution statements, CC BY 4.0 link, transformation notice, source
  URLs, and bundled manifest version to repository and packaged third-party notices.
- [ ] Surface the same information in Settings/About without loading it from the network.
- [ ] Update `docs/data-flow.md` and `docs/data-ingestion.md` with the bundled reader, default-source
  selection, fallback rules, and cache identity.
- [ ] Update release and bundle-budget checks so the SRD pack is required in installers and
  portable builds, forbidden from development-only output, and measured as its own category.
- [ ] Verify Windows installer/portable, macOS, and Linux resource paths before release.

## Phase 6 — Verification and Acceptance

- [ ] Unit-test extraction, reference closure, deterministic output, manifest validation, source
  identity, cache invalidation, migrations, and fallback decisions.
- [ ] Integration-test startup modal behavior, Settings source switching, bundled status details,
  external validation, restore-bundled behavior, and error recovery.
- [ ] Add an Electron smoke test that reads packaged bundled JSON through the restricted IPC path
  and rejects traversal and arbitrary files.
- [ ] Add offline end-to-end journeys for representative 2014 and 2024 characters: create, edit,
  save, reload, open rules previews/compendium, and export PDF.
- [ ] Verify switching to a full external source produces no duplicate core choices and does not
  rewrite saved SRD `name|source` references.
- [ ] Run the full quality gate: focused tests, all Vitest tests, Electron and browser journeys,
  Biome, TypeScript, Knip, dependency boundaries, production build, release checks, and revised
  bundle budgets.
- [ ] Inspect the final installer/portable contents and compare every shipped SRD file checksum to
  the manifest before release.

## Suggested Pull-Request Slices

1. Provenance policy, extractor, manifest schema, and deterministic corpus tests.
2. Audited combined snapshot and license/notices review.
3. Shared resource-reader boundary, bundled IPC adapter, and packaging.
4. Store/cache migration, default loading, and fallback behavior.
5. Startup/Settings/status UX plus integration and end-to-end coverage.
6. Cross-platform packaging verification, documentation, and release gate.

Do not combine the distributable snapshot with the transport refactor until Phase 0 passes; this
keeps architecture work reviewable without accidentally shipping unaudited content.

## Acceptance Criteria

- A fresh offline install can build, save, reload, and export both 2014 and 2024 SRD characters.
- The bundled catalog passes the same validation and parsing path as external 5etools data.
- Existing users retain working external-source settings after upgrade.
- Switching sources creates no duplicate core choices and preserves saved source-qualified refs.
- A broken external source cannot replace a complete cache or strand the user without bundled data.
- Every distributed record is covered by the provenance/coverage manifest, and every artifact
  contains the required attribution and modification notice.
- No generated content is written under `data/`, no non-SRD content or art is packaged, and no
  network connection is required for bundled operation.

## Explicit Non-Goals

- Bundling non-SRD books, D&D Beyond Basic Rules, images, or a full 5etools checkout.
- Merging bundled and external raw catalogs.
- Adding homebrew/custom-content schemas or a second parser family.
- Automatically downloading new SRD versions outside a normal reviewed app release.
- Changing character entity identity away from `name|source`.
