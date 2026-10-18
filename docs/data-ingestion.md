# Data Ingestion

The ingestion layer turns bundled and configured 5etools sources into stable, source-qualified application
data. UI code consumes parsed results through hooks; it never imports source JSON.
The loader and unloaded hook views share `createEmptyGameData`; each call owns fresh collections.

## Pipeline

| Stage | Owner | Contract |
| --- | --- | --- |
| Source validation | `validator.ts`, `urlUtils.ts`, Electron IPC | Accept bundled resources, authorized local folders, or valid HTTPS sources. |
| Resource transport | `resourceReader.ts` | Read normalized relative JSON paths from bundled, local, or remote sources. |
| Resource loading | `dataLoader.ts` | Load each known source independently with cancellation, timeouts, and bounded concurrency. |
| Validation | `validator.ts`, `schemas.ts` | Reject invalid required shapes; report optional degradation. |
| Parsing/normalization | `parsers/`, rule normalizers | Produce stable application entities and diagnostics. |
| Layer composition | `contentLayers.ts` | Overlay collections by canonical identity, rebuild races from raw records, and rebuild lookups. |
| Lookup construction | `lookups.ts` | Build source-qualified maps; class features use full owner/level identity. |
| Filtering/resolution | `filters.ts`, `entityResolvers.ts` | Filter catalogs while preserving exact saved-reference fallback. |
| Cache | `dataCache.ts` | Persist serializable parsed output plus freshness/schema metadata. |

Local reads are capability-scoped to a native-picker root, canonicalized against symlinks, limited
to JSON below that root, and size-limited by Electron. Remote production sources are HTTPS. GitHub
URLs are normalized to a data root; ambiguous slash-containing refs require an explicit `ref`.
GitHub repository release-page URLs are treated as links to that repository root.

Bundled reads use a separate, read-only IPC capability. The renderer supplies only a normalized
relative JSON path. Electron resolves managed data below `resources/srd/core/data` during
development and `process.resourcesPath/srd/core/data` when packaged. Both environments require the
fixed `tavern-born-srd-core` pack identity; packaged builds additionally require
`approved-for-distribution`, while unpackaged development can exercise a review-status snapshot.
Absolute paths, backslashes, empty/dot/parent segments, non-JSON files, symlink escapes, non-files,
and JSON larger than 50 MB are rejected.
Bundled, local, and remote resources all pass through the same loader and parser pipeline.
Source validation uses the same resource readers, so path construction, remote normalization,
timeouts, and Electron capability checks cannot drift between validation and ingestion.

## Content layers

The Included SRD is permanent. An optional validated local/HTTPS layer overlays exact identities;
records omitted by that layer remain available from the base. Composition rebuilds lookups once.

| Family | Composition boundary | Detailed contract |
| --- | --- | --- |
| Races/subraces | Compose raw identities before copies/versions and normalization. Parent replacement rebuilds children. | [Race ingestion](contracts/race-ingestion.md) |
| Items and shared/type text | Compose retained raw rows/definitions before copies, generation and text expansion. Final caches contain ready projections. | [Item ingestion](contracts/item-ingestion.md) |
| Class/subclass features | Re-link complete target UIDs, rebuild level groups/normalized choices, then validate required references. Intro content comes only from declared references. | [Feature references](contracts/feature-references.md) |
| Other families | Overlay normalized collections by their complete identity. Repeated/nested records include structural owner/kind fields. | [Reference resolution](contracts/reference-resolution.md) |

Top-level names alone are not identities. Class feature identities include owner and level; item
properties use abbreviation/source, with abbreviation fallbacks for existing saved values. Complete
feature UIDs supply their encoded/upstream-default printing; explicit conflicting source/name fields
remain unresolved. Selected owners never supply missing target fields. Copied subclass owners may
differ from their original targets. Exact intro targets render once per level group; distinct gains
and printings remain separate. Live retained raw inputs rebuild children after layer replacement;
only finalized serializable catalogs enter the cache. External configuration retains its persisted
shape; effective cache identity includes both base and external source.

The external directory/URL validator inventories every recognized top-level resource it can validate.
A partial source is accepted when it contains at least one valid supported family; readable malformed
families are rejected rather than treated as absent. The inventory is persisted with the external
configuration and becomes the layer's loading contract. Unlisted families are intentionally absent
and fall back to the SRD. An inventoried family that later disappears is a required failure, and an
indexed class or spell family still fails if one of its referenced files is missing. Adding a new
top-level family requires reselecting/revalidating the source so the inventory change is explicit.
An added class with unresolved class/subclass features or mechanically consumed feat, creature or
optional-feature choices is rejected as an incomplete layer. The previously active catalog and
cache remain unchanged. Item choices currently retain source-qualified selections without creating
inventory or applying item effects; missing item-choice metadata is an optional capability/dependency
diagnostic instead. The exact option stays unavailable until its metadata is restored. These gaps
are not resource failures and do not block an otherwise complete load or background refresh.

Future standalone add-ons should use the published 5etools homebrew document shape and a separate
document adapter, not imitate a full data tree.

The committed bundle is the approved output of a completed one-time source and PDF provenance
audit. `manifest.json` inventories every distributed top-level record and every data-file SHA-256
checksum; `provenance.json` pins the official documents, upstream revision, and final audit result.
The temporary source converter, correction adapters, exception queue, and PDF-review commands were
removed after pack 1.0.0 was reproduced byte-for-byte. The retained bundle validator rejects an
unapproved manifest, mismatched provenance or notices, missing or extra data files, and checksum
drift. The committed corpus test loads the reviewed files through the normal parser and capability
report. See the [Bundled SRD Provenance Record](../resources/srd/core/PROVENANCE.md).
The restricted manifest IPC returns validated pack identity, HTTPS source links, attribution,
license metadata, and the transformation notice for offline display in Settings. Renderer code does
not read arbitrary files or construct legal metadata independently.

## Loading rules

- The loader uses one bounded worker pool (maximum six requests), including expanded class/spell
  indexes. Do not replace it with unbounded `Promise.all`.
- Every load has a request identity and abort signal. Superseded progress, success, and failure are
  ignored.
- Bundled entity files, class/spell indexes, and spell-source association data are required. When a
  source inventories a bestiary index, its referenced files are loaded through the same bounded
  worker pool and retained as a creature catalog for character-option resolution; their sourcebooks
  are not thereby exposed as selectable character-content books. For an external partial layer,
  every inventoried entity file and every file referenced by an inventoried index is required;
  unlisted families are intentionally absent. Fluff/presentation data is optional.
- Foreground loads reject required failures. Background refresh rejects any dropped resource so it
  cannot replace a more complete cache.
- A remote source with no reachable top-level resources fails instead of producing an empty catalog.
- A bundled source with no readable top-level resources also fails instead of producing an empty
  catalog.
- Parser output and source ordering must be deterministic to avoid cache fingerprint churn.

## Parsing policy

Inspect the relevant pinned upstream 5etools behavior before writing an equivalent parser, reference,
filter or renderer. Reuse behind an adapter or adapt attributed data-only logic with parity checks;
record why application-specific behavior is needed. Keep saved choices, calculations and persistence
in the application. A browser-global upstream import needs its own trust/dependency assessment.

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

Complete class/subclass UIDs, defaults, gain levels and lookup ambiguity are defined in
[Feature references](contracts/feature-references.md).

Copy trust boundaries, race/subrace versions and native additional-spell grammar are defined in
[Race ingestion](contracts/race-ingestion.md).

## Prerequisite eligibility

See [Prerequisite eligibility](contracts/prerequisites.md) for raw OR/AND rules and explicit unsupported states.

## Normalized capabilities

See [Compound references](contracts/reference-collections.md) for condition/disease/status/trap/hazard identity and consumer limits.

The parser layer owns normalization that would otherwise be repeated across pages, including:

- class/subclass feature references, copied subclasses, spellcasting, resources, ritual casting,
  ASIs, and source-owned class and subclass choice descriptors;
- creature choices expressed as explicit stat-block references or structured bestiary filters,
  including type, size, challenge rating, and swarm exclusions;
- background origin rules, source-qualified narrative entries, and starting-equipment blocks;
- race versions/lineages, structured traits, and presentation entries;
- conditions versus diseases and structured rules entries;
- item type labels, generic magic variants, mastery definitions, generic equipment candidates;
- feat fixed references and unconditional lasting effects;
- fluff summaries and optional images/sections.

Generic magic variants prefer their own reference entries over inherited base-item templates.
When inherited entries are used, `{=field}` values are filled from the variant's structured
metadata before display; unknown values receive a visible fallback.
Sourcebook and adventure metadata IDs are matched without regard to case so their full names
appear in source lists, including the global Compendium filter.

The shared `getRaceTraits` presentation helper further excludes the descriptive Age entry from
gameplay-trait lists in the builder, creation wizard, and PDFs. Ingestion retains the original
entry for ancestry reference text; this display policy does not discard source data or require a
cache migration.

Choice normalizers preserve class/subclass owner, level, capacity, replacement rule, source filters,
and diagnostic provenance. Unsupported counted choice blocks remain visible as diagnostics instead of
becoming invented options. Countless presentation groups do not imply a choice; known mandatory setup
has [source-confirmed diagnostics](contracts/feature-references.md#required-setup-diagnostics).
Optional-feature and feat progression remain the count owners when feature prose
repeats the same choice. Feature variants retain replacement metadata so the character's optional
class-feature setting can swap the original and replacement choice without showing both.

## Identity and entity resolution

See [Reference resolution](contracts/reference-resolution.md#identity-and-entity-resolution) for exact target matching, retained choices, feat editing and restoration.

## Ruleset compatibility

See [Ruleset compatibility](contracts/reference-resolution.md#ruleset-compatibility) for source families, filtering and the global Compendium boundary.

## Spell enrichment

See [Spell enrichment](contracts/reference-resolution.md#spell-enrichment) for canonical class-list associations and slot tables.

## Items and starting equipment

See [Item ingestion](contracts/item-ingestion.md) for exact equipment resolution, shared text, primary/supplemental type rules, template references and starting-equipment selection.

### Fixed-bonus shields

See [Fixed-bonus shields](contracts/item-ingestion.md#fixed-bonus-shields) for the six supported combinations and generation limits.

## Cache compatibility

The current parsed cache schema is **39**, owned by [dataCache](../src/lib/storage/dataCache.ts);
use that constant when changing code. Old increment numbers are not the current version.

Cache entries include a normalization schema version. Increment it whenever parser-owned normalized
output or layer composition changes in a way that makes previous cached data unsafe. Character
schema changes are a separate concern and follow [State Management](state-management.md).
The item-property display update invalidates older caches so property definitions collapsed by
layer composition are rebuilt; the property hook can also rebuild missing lookup entries from the
parsed definitions in a cached catalog.

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
