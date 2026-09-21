# Bundled SRD Rules Implementation Plan

Status: in progress on `feature/bundled-srd-rules` (updated 2026-09-20).

## Outcome

Ship Tavern Born with an offline, read-only catalog containing both SRD 5.1 (the 2014/5e rules)
and SRD 5.2.1 (the 2024/5.5e rules). A fresh install must support character creation without a
user-selected data source. Users may add an external 5etools checkout or URL for content they are
entitled to use. External content is composed above the Included SRD rather than making the offline
catalog disappear.

The bundle must use the existing 5etools-shaped resource files, validation, parsers, normalizers,
lookups, filters, and `GameData` model. It must not introduce SRD-specific entity types or a second
rules engine.

## Decisions

1. **One combined catalog.** Package SRD 5.1 and SRD 5.2.1 as one source because Tavern Born loads
   one global game-data catalog and can hold 2014 and 2024 characters at the same time. Preserve the
   original `PHB`/`XPHB` source-qualified identities so existing ruleset filters separate them.
2. **Same ingestion pipeline.** Select the source before resource loading, then run bundled,
   local, and remote resources through the same schemas, parsers, diagnostics, and lookup builder.
3. **Compose parsed content layers.** The Included SRD is the permanent base. One optional external
   5etools data source overlays it by canonical entity identity, with the external version winning
   exact matches and omitted SRD entities remaining available. Parse each source independently and
   never concatenate raw catalogs. The same internal boundary can support standalone add-on
   documents later without making this feature a homebrew implementation.
4. **Generated data stays outside `data/`.** The managed `data/` tree is read-only input. Generated
   snapshots belong under `resources/srd/` and ship through Electron's packaged resources.
5. **Fail closed on licensing and dependency closure.** `srd` and `srd52` flags are candidate
   selectors, not sufficient provenance by themselves. Every distributed field must be traceable
   to the corresponding official SRD, and every unflagged supporting record must be explicitly
   justified or omitted.
6. **Treat provenance review as one-time release preparation.** The PDF audit, exception queue, and
   source-corpus conversion/correction helpers exist only to establish the first distributable
   bundled snapshot. After that snapshot is approved and materialized, remove temporary generation
   corrections, review commands, reports, and exception infrastructure; retain only the bundled
   data, required notices and provenance, and checks that protect the shipped bytes. A future SRD
   correction or revision can be handled as a deliberate manual bundle edit rather than a
   maintained update pipeline.
7. **Included content is the safe default.** Existing users keep their configured external source,
   which is added above the immutable bundled source after migration. New users start with only the
   Included SRD. Removing additional content never removes the base catalog.
8. **Additional-content warnings use exact saved identities.** While the Included SRD is active,
   character cards compare source-qualified saved races/species, classes, subclasses,
   backgrounds, feats, spells, equipment, and structured choices with the loaded SRD catalog.
   Book abbreviations alone are not sufficient because both SRD and non-SRD options can use
   `PHB` or `XPHB`. The compact information indicator does not mutate existing characters.

## Current Extension Points

| Concern | Existing owner | Planned change |
| --- | --- | --- |
| Source configuration | `src/types/5etools.ts` | Retain individual source configs and add an ordered base/additional stack. |
| Resource loading | `src/lib/5etools/dataLoader.ts`, `contentLayers.ts` | Load sources independently, compose parsed collections, and rebuild lookups. |
| Local file capability | `electron/main.ts`, `electron/preload.ts` | Add a narrowly scoped, read-only bundled-JSON IPC capability. |
| Startup and fallback | `src/store/gameDataStore.ts`, `src/hooks/data/useDataInit.ts` | Default to the bundled source and preserve last-known-good external data. |
| Cache identity | `src/lib/storage/dataCache.ts` | Key composed snapshots by both bundled-pack and external-source identity. |
| First-run UI | `DataSourceStartupModal`, `DataSourceConfigurator` | Make bundled SRD the default and external setup optional. |
| Packaging | `package.json`, bundle-budget checks | Ship versioned SRD resources and measure their packaged size separately. |

## Phase 0 — Licensing and Provenance Gate

- [x] Pin the official English SRD 5.1 and SRD 5.2.1 documents, publication dates, download URLs,
  and SHA-256 checksums in a machine-readable provenance file.
- [x] Record the exact attribution statements supplied by both SRDs and the CC BY 4.0 license URL.
- [ ] Confirm that the planned structured representation contains only material licensed by those
  documents. Do not assume a 5etools repository's code license also licenses its data.
  - [x] Emit a deterministic per-record review inventory that binds each transformed row to its
    source-qualified identity, content hash, and either one SRD marker/version or one explicit
    dependency approval. Reject ambiguous markers and unexplained output; human content review is
    still required before changing distribution status.
  - [x] Provide an ignored review-snapshot command and CSV checklist; prevent review-required
    output from entering managed release resources or any output from entering the source `data/`
    tree.
  - [x] Add a PDF-backed provenance audit that verifies the pinned document hashes, normalizes
    5etools markup and PDF typography, matches user-facing evidence to official pages, and emits
    only unmatched passages or short structured records for review. Bind any reviewed exception to
    the document, transformed record, and fragment hashes; reject stale approvals.
  - [ ] Resolve the generated exception queue by correcting non-SRD differences or recording narrow
    reviewed representation exceptions, then pass the audit with `--require-clean`.
    - The initial development-corpus audit matched 9,200 evidence fragments automatically and
      isolated 3,730 exceptions across 1,929 records. This baseline is diagnostic only because the
      local corpus is not yet tied to the final immutable upstream revision.
    - The pinned 5etools v2.35.1 corpus at commit
      `e5d052071b635f58cc8006e9727053eaf78ea8f9` matches the former local development input. The
      current pass fully clears 2,551 of 3,039 records, leaving 637 evidence decisions across 488
      records. Exact SRD wording corrections,
      confirmed removal of book-only sidebars and action text, accurate 5etools display-tag
      rendering, and deterministic weapon, armor, equipment, vehicle, trade-goods, and language
      table reconstruction produced this reduction. The pass also excludes 23 records incorrectly
      marked as SRD 5.2.1 trade goods, removes non-SRD language origins, supplemental deity domains,
      full-book ammunition details, and item-catalog metadata; corrects the 2024 stabling price and
      the upstream `Lolth's Sting`/official `Spider's Sting` mismatch; and materializes 5etools'
      internal shared-item templates so bundled magic-item descriptions are complete. Exact
      parent-entry/table adapters now validate generated resistance, dragon-scale, healing-potion,
      giant-strength, flying-carpet, elemental-gem, Bag of Tricks, Armor of Vulnerability, Horn of
      Valhalla, Manual of Golems, Wand of the War Mage, and spell-scroll variants. The item-name
      inventory found no basis for bulk
      magic-item removal: the large catalog is present in the official SRDs, while generated variant
      names are represented by their official parent entries and tables. The item pass did remove
      full-book Iron Flask tables, setting-only Orb of Dragonkind wording, non-SRD catalog/search
      metadata and Artificer integration links, and an upstream editorial correction note; it also
      reconciled narrower item wording, attunement differences, Horn of Valhalla requirements, and
      Manual of Golems construction text to the official documents. Only 17 magic-item records
      remain under review, all in two known table-driven SRD families: Figurines of Wondrous Power
      and Rings of Elemental Command. They are not unexplained candidates for removal. Review output
      is generated from that immutable tagged checkout rather than the unversioned local `data/`
      copy.
- [x] Define a transformation notice stating that Tavern Born converted and structured the SRD
  material. Keep it separate from the prescribed Wizards attribution statements.
- [ ] Explicitly exclude D&D Beyond Basic Rules, non-SRD books, product art, logos, trade dress,
  setting material, and records that cannot be traced to an official SRD.
  - [x] Add a technical output gate that strips Basic Rules/catalog flags, supplemental entries,
    page/reprint metadata, and audio references; reject image payloads and source-bearing fields
    outside the audited 2014/2024 core-book source set.

Exit gate: do not commit a distributable snapshot until the provenance and notices have been
reviewed. The official SRD page confirms that SRD 5.1 and SRD 5.2.1 are available under CC BY 4.0;
the Creator FAQ separately states that D&D Beyond Basic Rules are not reusable SRD content.

Authoritative references:

- <https://www.dndbeyond.com/srd>
- <https://www.dndbeyond.com/creator-faq>
- <https://creativecommons.org/licenses/by/4.0/>

Human approval procedure: [Bundled SRD Provenance Review](../srd-provenance-review.md).

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
  - [x] Resolve structured inline class-feature, subclass-feature, optional-feature, and feat
    references; include explicitly approved unflagged option records and reject every other
    dangling or unapproved dependency.
  - [x] Resolve source-qualified equipment references across distributed records, include only
    explicitly approved unflagged item groups, and close references introduced by those groups.
- [x] Preserve the exact file layout, collection keys, indexes, and generated spell-source lookup
  expected by the existing loader. Emit both rules generations into one catalog.
- [ ] Reject unflagged dependencies unless an audited allowlist entry records the reference,
  reason, official-SRD location, and owning pack.
  - [x] Require complete, unique item-support approvals and fail when an approval becomes unused.
- [ ] Strip unused books, adventures, fluff, images, and non-SRD metadata. Optional resources may
  be empty only where the existing loader already accepts that shape.
  - [x] Emit empty optional book/adventure/magic-variant indexes and loader-compatible fluff
    resources, recursively remove known non-mechanical metadata, retain structured mechanics such
    as `_versions`, and record every stripped field in manifest coverage.
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
  - [x] Require the per-record inventory to cover every emitted top-level entity row and reject
    duplicate identities across generated files.
  - [x] Run the generated snapshot through the real loader/parser and capability report with no
    required or optional resource failures and no capability issues.

Exit gate: the generated catalog passes the existing loader, validator, capability report, and
source-qualified lookup collision tests without any SRD-only parser branch.

## Phase 2 — Bundled Resource Transport

- [x] Refactor `FiveEToolsDataLoader` around a small `readJson(relativePath)` resource-reader
  boundary. Keep the current bounded concurrency, abort, timeout, progress, validation, parsing,
  and partial-resource rules unchanged.
- [x] Retain adapters for the existing remote URL and authorized local directory sources.
- [x] Add a bundled adapter backed by a preload IPC method that accepts only normalized relative
  `.json` paths below Tavern Born's immutable packaged SRD root.
- [x] Resolve the development root from the repository and the packaged root from
  `process.resourcesPath`; canonicalize both root and target, reject traversal/symlink escapes,
  and retain the existing JSON size limit.
- [x] Configure Electron Builder `extraResources` for `resources/srd/core/**`. Do not place the
  snapshot in the renderer bundle or expose arbitrary packaged-file reads.
- [x] Extend `DataSourceConfig` with `type: 'bundled'`, a stable pack ID, and version. Keep a
  compatibility migration for persisted local/remote configurations.

Exit gate: the same `loadDataFromSource` contract returns equivalent normalized `GameData` for a
bundled fixture and a matching local fixture.

## Phase 3 — Startup, Cache, and Fallback Semantics

- [x] Resolve the default bundled source from one fixed, validated manifest rather than scattering
  pack IDs or versions through UI code. Packaged builds require `approved-for-distribution`;
  unpackaged development may use the ignored review snapshot without weakening release policy.
- [x] When hydration finds neither a configured source nor a compatible cache, load the bundled
  source automatically. Remove `unconfigured` as a normal fresh-install terminal state.
- [x] Preserve existing local/remote choices during migration; do not silently replace a working
  external source for an existing user.
- [x] Include bundled pack ID/version in cache identity so an app update invalidates only an older
  snapshot cache. Keep parsed-content fingerprints deterministic.
- [x] Keep foreground/background replacement atomic. A failed external refresh retains the
  last-known-good external cache; if no usable external cache exists, offer an explicit bundled
  fallback and record diagnostics without deleting the external configuration.
- [x] Replace destructive clear/rebuild controls with a “Change Additional Content” flow. External
  users can choose the warning-styled “Remove Additional Content” action. Confirm that it removes
  the saved external connection while retaining characters and the Included SRD, using the standard
  accent action inside the confirmation dialog. Do not show a rebuild action while only the
  Included SRD is active.
- [x] Do not auto-refresh immutable bundled data. It changes only with an application release.

Exit gate: first launch, cache reuse, app upgrade, external-source failure, source switching, and
cache clearing all end with a complete usable catalog.

## Phase 4 — First-Run and Settings Experience

- [x] Replace the blocking data-source setup prompt with a short first-run message that says SRD
  content is included. Its primary action continues with the Included SRD; a secondary “Add
  Additional Content” action opens the existing online/local controls and points users who need a
  starting place to the 5etools wiki.
  - [x] Keep the modal header concise, place source guidance beside the selector, and present the
    5etools wiki hint as a distinct help note beneath those controls.
- [x] Rework `DataSourceConfigurator` into clear Included SRD and additional-content states. Reuse
  the current remote validation, local folder picker, load progress, cancellation, and error
  feedback.
- [x] Show the Included SRD document versions, supported character rules, and offline availability
  in Game Data settings. Show location, update timestamps, and status only for external sources.
- [x] Update the status bar and empty states to use reader-facing “Included SRD” and “Game Data”
  language instead of reporting no data on a normal installation.
- [x] Explain that external data is user supplied, expands the Included SRD catalog, and is not
  distributed by Tavern Born.
- [x] Preserve forced setup as a recoverable settings flow, but never require network access or a
  folder selection to enter the app.
- [x] Rename the user-facing Sources workspace to “Additional Content” while retaining the existing
  route. Hide selection counts and source presets while the Included SRD is active, because it has
  no additional sourcebooks to enable, and direct users to Settings → Game Data to add their own
  compatible 5etools data.
- [x] Keep provenance-only DMG/MM/XDMG/XMM records available to the loader but out of selectable
  character source lists. Enforce ruleset compatibility so 2014 and 2024 core counterparts cannot
  be mixed; 2024 characters may still use compatible legacy supplements.
- [x] Audit Recommended and Expanded presets after the compatibility change. Their current
  supplement lists remain cross-compatible, so their membership does not change; preset matching
  and application still pass through ruleset compatibility normalization.
- [x] Remove the bordered panel treatment from the character-creation Included SRD explanation so
  it reads as supporting guidance rather than another selectable source card.
- [x] Mark character cards with a compact, neutral caution icon only when the Included SRD is active
  and exact source-qualified saved choices are absent from that catalog. Keep the glyph large enough
  to read clearly, explain the state on hover, do not infer it from a saved allowed-source list, and
  do not block opening or using the character. Keep the indicator persistent rather than relying on
  an easy-to-miss launch toast.
- [x] Normalize supported GitHub `/releases`, `/releases/latest`, and `/releases/tag/...` addresses
  to the repository root before validation.
- [ ] Revisit visual styling around the online/local Game Data chooser in a separate UX pass. The
  current layout is intentionally unchanged for this implementation slice.

Exit gate: a first-time user can remain offline and reach character creation with one confirmation;
an advanced user can configure, refresh, change, and remove an external source.

## Phase 5 — Notices, Documentation, and Release Packaging

- [x] Add the two official attribution statements, CC BY 4.0 link, transformation notice, source
  URLs, and bundled manifest version to repository and packaged third-party notices.
- [x] Surface concise SRD attribution, license, and source links in Settings/About without loading
  them from the network. Keep the implementation-focused transformation notice in packaged legal
  notices rather than the Game Data page.
- [x] Update `docs/data-flow.md` and `docs/data-ingestion.md` with the bundled reader, default-source
  selection, fallback rules, and cache identity.
- [x] Update release and bundle-budget checks so the SRD pack is required in installers and
  portable builds, forbidden from development-only output, and measured as its own category.
- [ ] Verify Windows installer/portable, macOS, and Linux resource paths before release.

## Phase 6 — Verification and Acceptance

- [x] Unit-test extraction, reference closure, deterministic output, manifest validation, source
  identity, cache invalidation, migrations, and fallback decisions.
- [x] Integration-test startup modal behavior, Settings source switching, bundled status details,
  external validation, restore-bundled behavior, and error recovery.
- [x] Add an Electron smoke test that reads packaged bundled JSON through the restricted IPC path
  and rejects traversal and arbitrary files.
  - [x] Exercise the real preload/main IPC bridge in the compiled Electron shell and reject path
    traversal and non-JSON files. A positive packaged-data read remains gated on the approved
    snapshot.
- [x] Add offline end-to-end journeys for representative 2014 and 2024 characters: create, edit,
  save, reload, open rules previews/compendium, and export PDF.
  - [x] Add a guarded compiled-Electron journey that loads only the Included SRD, creates both
    rules generations, levels and reloads a character, opens a real compendium entry, and generates
    an SRD character-sheet preview. Existing browser PDF journeys verify the final download and
    inspect the produced document.
  - [x] Keep Electron smoke tests active on unaffected CI hosts while skipping local launches on
    Windows builds affected by upstream Electron sandbox crash `0x80000003`; never disable the
    renderer sandbox merely to make the test pass.
- [x] Verify adding a full external source produces no duplicate core choices and does not rewrite
  saved SRD `name|source` references.
  - [x] Add composition and integration contracts proving that an external catalog overlays exact
    identities, retains omitted SRD entities, and leaves saved and active character snapshots
    byte-for-byte unchanged.
  - [x] Compose the generated SRD with the configured full 5etools corpus and reject required
    resource failures, unresolved added-class dependencies, and duplicate top-level identities.
- [ ] Run the full quality gate: focused tests, all Vitest tests, Electron and browser journeys,
  Biome, TypeScript, Knip, dependency boundaries, production build, release checks, and revised
  bundle budgets.
  - [x] On 2026-09-20, Biome, TypeScript, 1,614 Vitest tests, coverage, 26 browser journeys, Knip,
    dependency boundaries, the production build, normal bundle budgets, and current-version release
    metadata passed. Electron journeys were correctly skipped on the affected Windows 11 build;
    the distribution-required bundle gate remains blocked until the reviewed SRD snapshot exists.
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

## Content-Layering Implementation

The SRD implementation now uses an ordered, provenance-aware composition. This work is about making
the Included SRD a permanent base; it intentionally does not add a homebrew import surface:

1. Keep the Included SRD as the always-available fallback layer.
2. Allow one optional 5etools-compatible data source to overlay it. A source-qualified entity
   supplied by that source wins; an SRD entity omitted from it remains available from the fallback.
3. Reserve zero or more future add-on layers above the base content. They will require their own
   source codes and must reject silent collisions unless an explicit override contract is added.
4. Parse and validate each layer independently, then compose normalized `GameData` collections by
   their canonical source-qualified identities. Do not concatenate raw 5etools JSON.
5. Resolve cross-record references against the completed catalog and cache the ordered source list,
   per-layer fingerprints, precedence, and provenance so refreshes remain atomic and explainable.

Current progress:

- [x] Add a base/additional source-stack contract without invalidating existing persisted external
  source selections.
- [x] Load the Included SRD and an external source independently, compose normalized collections by
  identity, and rebuild lookups from the result.
- [x] Retain omitted SRD entities, replace exact top-level identities with richer external records,
  and use parent/level-aware identity for class features.
- [x] Cache the identities of both layers so either an SRD pack update or external-source change
  invalidates the composed cache.
- [x] Update Settings and status language so additional content is added or removed rather than
  replacing or reverting the Included SRD.
- [x] Allow coherent partial 5etools directory/URL layers through a persisted top-level capability
  inventory while rejecting malformed resources, broken indexes, and inventoried families that
  disappear during refresh.
- [x] Resolve supported cross-layer references after composition and report missing hard
  dependencies without partially applying a layer.
  - [x] Re-link class- and subclass-feature references against the completed catalog, rebuild class
    normalization and subclass level groups, and validate explicit class-choice dependencies.
- [x] Extend the persisted capability inventory with per-layer fingerprints and richer diagnostics
  for atomic refreshes.
- [ ] Add standalone 5etools homebrew/add-on document import in a future feature; do not require a
  repository folder structure or index for those documents.

## Explicit Non-Goals

- Bundling non-SRD books, D&D Beyond Basic Rules, images, or a full 5etools checkout.
- Merging bundled and external raw catalogs.
- Adding homebrew/custom-content schemas or a second parser family.
- Automatically downloading new SRD versions outside a normal reviewed app release.
- Changing character entity identity away from `name|source`.
