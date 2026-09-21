# Data Ingestion

The ingestion layer turns a configured 5etools source into stable, source-qualified application
data. UI code consumes parsed results through hooks; it never imports source JSON.

## Pipeline

| Stage | Owner | Contract |
| --- | --- | --- |
| Source validation | `validator.ts`, `urlUtils.ts`, Electron IPC | Accept bundled resources, authorized local folders, or valid HTTPS sources. |
| Resource transport | `resourceReader.ts` | Read normalized relative JSON paths from bundled, local, or remote sources. |
| Resource loading | `dataLoader.ts` | Load each known source independently with cancellation, timeouts, and bounded concurrency. |
| Validation | `validator.ts`, `schemas.ts` | Reject invalid required shapes; report optional degradation. |
| Parsing/normalization | `parsers/`, rule normalizers | Produce stable application entities and diagnostics. |
| Layer composition | `contentLayers.ts` | Overlay normalized collections by canonical identity and rebuild lookups. |
| Lookup construction | `lookups.ts` | Build collision-safe `name|source` maps. |
| Filtering/resolution | `filters.ts`, `entityResolvers.ts` | Filter catalogs while preserving exact saved-reference fallback. |
| Cache | `dataCache.ts` | Persist serializable parsed output plus freshness/schema metadata. |

Local reads are capability-scoped to a native-picker root, canonicalized against symlinks, limited
to JSON below that root, and size-limited by Electron. Remote production sources are HTTPS. GitHub
URLs are normalized to a data root; ambiguous slash-containing refs require an explicit `ref`.
GitHub repository release-page URLs are treated as links to that repository root.

Bundled reads use a separate, read-only IPC capability. The renderer supplies only a normalized
relative JSON path. Electron resolves approved managed data below `resources/srd/core/data` during
development and `process.resourcesPath/srd/core/data` when packaged. Both environments fail closed
unless the fixed manifest is `approved-for-distribution`. Absolute paths, backslashes,
empty/dot/parent segments, non-JSON files, symlink escapes, non-files, and JSON larger than 50 MB
are rejected.
Bundled, local, and remote resources all pass through the same loader and parser pipeline.
Source validation uses the same resource readers, so path construction, remote normalization,
timeouts, and Electron capability checks cannot drift between validation and ingestion.

## Content layers

The Included SRD is the permanent base catalog. When a local directory or remote 5etools root is
configured, both sources are loaded and parsed independently. `contentLayers.ts` then overlays the
external normalized collections on the SRD collections: an exact external identity wins, while an
SRD identity omitted by the external source remains available. Raw source JSON is never
concatenated. Unresolved class-feature references are re-linked against the completed catalog and
their normalized class rules are rebuilt before the final lookups are constructed. Subclass-feature
references are re-linked the same way and their level groupings are rebuilt. Explicit class-choice
references are checked against the completed class-feature, feat, item, and optional-feature
catalogs.

Top-level entities use source-qualified identity. Nested or repeated definitions require their
complete structural identity; class features include their parent class and level so repeated names
such as Ability Score Improvement do not collapse during composition. External-source configuration
remains persisted in its existing shape for upgrade compatibility, while the effective cache
identity records both the bundled base and external layer.

The external directory/URL validator inventories every recognized top-level resource it can validate.
A partial source is accepted when it contains at least one valid supported family; readable malformed
families are rejected rather than treated as absent. The inventory is persisted with the external
configuration and becomes the layer's loading contract. Unlisted families are intentionally absent
and fall back to the SRD. An inventoried family that later disappears is a required failure, and an
indexed class or spell family still fails if one of its referenced files is missing. Adding a new
top-level family requires reselecting/revalidating the source so the inventory change is explicit.
An added class with unresolved class features, subclass features, or explicit choice records is
rejected as an incomplete layer. The previously active catalog and cache remain unchanged.

Future standalone add-ons should use the published 5etools homebrew document shape and a separate
document adapter, not imitate a full data tree.

The committed bundle is the approved output of a completed one-time source and PDF provenance
audit. `manifest.json` inventories every distributed top-level record and every data-file SHA-256
checksum; `provenance.json` pins the official documents, upstream revision, and final audit result.
The temporary source converter, correction adapters, exception queue, and PDF-review commands were
removed after pack 1.0.0 was reproduced byte-for-byte. The retained bundle validator rejects an
unapproved manifest, mismatched provenance or notices, missing or extra data files, and checksum
drift. The committed corpus test loads the reviewed files through the normal parser and capability
report. See [Bundled SRD Provenance Record](srd-provenance-review.md).
The restricted manifest IPC returns validated pack identity, HTTPS source links, attribution,
license metadata, and the transformation notice for offline display in Settings. Renderer code does
not read arbitrary files or construct legal metadata independently.

## Loading rules

- The loader uses one bounded worker pool (maximum six requests), including expanded class/spell
  indexes. Do not replace it with unbounded `Promise.all`.
- Every load has a request identity and abort signal. Superseded progress, success, and failure are
  ignored.
- Bundled entity files, indexes, and spell-source association data are required. For an external
  partial layer, every inventoried entity file and every file referenced by an inventoried index is
  required; unlisted families are intentionally absent. Fluff/presentation data is optional.
- Foreground loads reject required failures. Background refresh rejects any dropped resource so it
  cannot replace a more complete cache.
- A remote source with no reachable top-level resources fails instead of producing an empty catalog.
- A bundled source with no readable top-level resources also fails instead of producing an empty
  catalog.
- Parser output and source ordering must be deterministic to avoid cache fingerprint churn.

## Parsing policy

Prefer structure supplied by 5etools. When upstream exposes a rule only as prose, an adapter must
be narrow, ruleset/source-qualified, versioned, diagnostic when uncertain, and overridden by parsed
structured data whenever that becomes available.

Do not:

- edit `data/`;
- put canonical game values in components;
- infer source identity by name alone;
- turn ambiguous prose into a guessed mechanical rule;
- mix persisted compatibility aliases into validation of the current upstream catalog.

Emergency content substitutions live in `sourceFallbacks.ts`; ruleset metadata gaps live in the
explicit ruleset metadata module. Both must be testable and removable.

## Normalized capabilities

The parser layer owns normalization that would otherwise be repeated across pages, including:

- class/subclass feature references, copied subclasses, spellcasting, resources, ritual casting,
  ASIs, and source-owned choice descriptors;
- background origin rules, source-qualified narrative entries, and starting-equipment blocks;
- race versions/lineages, structured traits, and presentation entries;
- conditions versus diseases and structured rules entries;
- item type labels, generic magic variants, mastery definitions, generic equipment candidates;
- feat fixed references and unconditional lasting effects;
- fluff summaries and optional images/sections.

Choice normalizers preserve owner, level, capacity, replacement rule, source filters, and diagnostic
provenance. Unknown choice blocks remain visible as diagnostics instead of becoming invented
options. Optional-feature progression remains the count owner when feature prose repeats the same
choice.

## Identity and entity resolution

Lookup keys are case-normalized `name|source`. Exact resolution checks the filtered primary lookup,
then the exact raw lookup so an existing saved selection remains resolvable after a filter change.
Persisted references without a source are rejected rather than matched to the first printing.

## Ruleset compatibility

The character's `originSystem` owns the core rules foundation. PHB/XPHB, DMG/XDMG, and MM/XMM
are replacement families; only the printing matching that foundation is effective. Parsed sources
whose entities explicitly carry revised-edition metadata are unavailable to 2014 characters.

2024 characters may use older supplements, adventures, and the explicit unreplaced PHB character
options recorded in `rulesetMetadata.ts`. A revised replacement always wins for a 2024 character,
regardless of the optional same-edition reprint preference. Source compatibility is normalized in
the shared domain helper before filtering and in both source-selection surfaces; components must not
recreate this policy.

Downstream UI uses `useFilteredGameData()`, `useWizardGameData()`, or named hooks from
`useGameData.ts`. Use lookup maps for exact references rather than repeated array scans.

## Spell enrichment

`generated/gendata-spell-source-lookup.json` is required ingestion input. Spell parsing merges its
class and subclass associations once into each `Spell5e`. Runtime class-list checks read that
canonical enriched record through `isSpellOnClassList()`/`isSpellOnSubclassList()`; there is no
second mapping system.

Class slot progressions come from parsed class tables. Shared multiclass slots use the matching
PHB/XPHB full-caster table, including Artificer's special contribution. Missing tables produce a
diagnostic/no invented capacity.

## Items and starting equipment

Item classification uses parsed `itemType` labels first; catalog codes are compatibility fallback.
Unfamiliar items remain available in an Other group instead of being dropped.

Generic starting-equipment tokens become choice descriptors whose candidates come from parsed
items. The character stores the selected concrete `name|source` separately from the package choice.
`items-base.json` supplies base items and mastery definitions; mastery records are not ordinary
inventory entries.

Core SRD/Basic Rules potions and scrolls housed in DMG/XDMG may be admitted by the shared
player-item policy without enabling the full source. When the bundled SRD is active, all public
SRD items for the character's matching ruleset are admitted without presenting DMG, MM, XDMG, or
XMM as selectable books. Their original source-qualified identities remain intact for references
and lookups. This is a filtering and source-catalog policy, not duplicated or relabeled item data.

## Cache compatibility

Cache entries include a normalization schema version. Increment it whenever parser-owned normalized
output or layer composition changes in a way that makes previous cached data unsafe. Character
schema changes are a separate concern and follow [State Management](state-management.md).

Layered cache identity includes the stable bundled pack ID/version and the selected external source.
An application update therefore invalidates a composition built on an older bundled snapshot, while
changing or removing external content selects a different cache identity. Successful layered loads
also persist each layer's normalized-content fingerprint and entity count, allowing diagnostics to
identify which layer changed without weakening source-identity cache matching.

## Adding a data family

1. Add passthrough validation/schema support.
2. Add and export a focused parser.
3. Register loading and required/optional behavior.
4. Add source-qualified lookup support if referenced.
5. Expose a named data hook.
6. Add synthetic parser/loader tests and, where useful, a guarded corpus contract.

## Corpus checks

`npm run report:capabilities` audits a configured local `data/` checkout without modifying it. The
report is observational: unknown fields and unresolved/ambiguous references are reported. Corpus
tests must skip cleanly when the ignored external checkout is absent; committed fixtures still
cover deterministic parser behavior in CI.
