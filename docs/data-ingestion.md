# Data Ingestion

The ingestion layer turns bundled and configured 5etools sources into stable, source-qualified application
data. UI code consumes parsed results through hooks; it never imports source JSON.
The loader and unloaded hook views share `createEmptyGameData`; each call owns fresh collections.

## Pipeline

| Stage | Owner | Contract |
| --- | --- | --- |
| Candidate preparation | catalogCandidate.ts, sourceRevision.ts, validator.ts | Inventory recognized resources and prepare one parsed catalog from an authorized folder or HTTPS root. |
| Resource transport | `resourceReader.ts` | Read normalized relative JSON paths from bundled, local, or remote sources. |
| Resource loading | `dataLoader.ts` | Load each known source independently with cancellation, timeouts, and bounded concurrency. |
| Validation | `validator.ts`, `schemas.ts` | Reject invalid required shapes; report optional degradation. |
| Parsing/normalization | `parsers/`, rule normalizers | Produce stable application entities and diagnostics. |
| Layer composition | `contentLayers.ts` | Overlay collections by canonical identity, rebuild races from raw records, and rebuild lookups. |
| Lookup construction | `lookups.ts` | Build source-qualified maps; class features use full owner/level identity. |
| Filtering/resolution | `filters.ts`, `entityResolvers.ts` | Filter catalogs while preserving exact saved-reference fallback. |
| Cache | `dataCache.ts` | Persist serializable parsed output plus freshness/schema metadata. |

Local reads are capability-scoped to roots explicitly granted through the native picker. Browsing
for a replacement gives that folder a temporary grant. A staged replacement retains its grant while
awaiting review, including when leaving Settings. A new folder selection replaces the temporary
grant. Applying a validated source saves the grant.
Reads are canonicalized against symlinks and kept inside the exact selected root, limited
to JSON below that root, and size-limited by Electron. Remote production sources are HTTPS. GitHub
URLs are normalized to a data root; ambiguous slash-containing refs require an explicit `ref`.
GitHub repository release-page URLs are treated as links to that repository root. The adapter
resolves a branch or tag to one commit before reading data. Every GitHub resource in the check
comes from that commit. A repository `/tree/<full-sha>` URL or raw URL with a full commit SHA
works without GitHub API calls. The accepted commit is shown separately from the configured source.

A personal HTTPS server can expose the same 5etools directory layout at any path, with the JSON
under data/ and cross-origin reads enabled for the desktop app. It uses no GitHub API. Each
resource is read once per candidate, including shared files referenced by more than one index
entry. For a stable snapshot, publish a versioned directory or switch the server's content
atomically. Local folders have the same per-attempt read guarantee.

The catalog worker requests bundled reads by normalized relative JSON path. Electron resolves
managed data below `resources/srd/data` during development and
`process.resourcesPath/srd/core/data` when packaged. Both environments require the
fixed `tavern-born-srd-core` pack identity; packaged builds additionally require
`approved-for-distribution`, while unpackaged development can exercise a review-status snapshot.
Absolute paths, backslashes, empty/dot/parent segments, non-JSON files, symlink escapes, non-files,
and JSON larger than 50 MB are rejected.
Bundled, local, and remote resources all pass through the same loader and parser pipeline.
Source validation uses the same resource readers, so path construction, remote normalization,
timeouts, and Electron capability checks cannot drift between validation and ingestion.

On desktop, Electron runs preparation, comparison, and cache repair in a catalog utility process.
The main process authorizes bundled and local reads and supplies file contents to the worker.
Chromium performs HTTPS reads with the existing origin and session policy, and sends raw bytes for
the utility to parse.
Progress and preview metadata reach the UI while the prepared catalog stays in the utility.
Applying retrieves that exact candidate. Cancelling or replacing a check releases its candidate,
and a renderer reload or utility exit invalidates outstanding previews.

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

Each check inventories the recognized resources again, so new families appear without selecting
the source again. A 404, 410 or missing local file means a family is absent. Partial sources can
supply any supported subset with usable records. Each declared mechanical document must parse and
its indexed files must contain the expected collection and printing. A named empty collection is
valid and can produce a withdrawal preview. Class documents must include the exact parent of any
subclass they supply so the parser can attach it. Transport, permission and
schema errors fail the candidate rather than silently narrowing the catalog.

Exact source and owner identities govern class and subclass ancestry, mechanically used choices
and item or creature copy targets. The base can satisfy an exact dependency. Incomplete required
dependencies keep the active catalog and cache intact. Item choice metadata can remain unavailable
as a diagnostic because these choices retain references without creating inventory or applying effects.
Fluff can degrade independently. A verified withdrawal shows the affected files or records in
Settings before the candidate can replace the active catalog.
The Included SRD must contain parsed rules or compendium records, including when it serves as
the base of a layered candidate. Source labels and shared text alone cannot open a bundled catalog.
Older catalogs without an external record inventory require one-time review, even if the composed
catalog appears unchanged. The preview explains that it may omit withdrawals masked by Included
SRD records. Applying the candidate records its external inventory for future checks.

Future standalone add-ons should use the published 5etools homebrew document shape and a separate
document adapter, not imitate a full data tree.

## Included SRD

`resources/srd/` holds the approved, read-only SRD 5.1 and 5.2.1 pack. Its `data/` directory
retains the 5etools file layout and indexes. Packaging copies that data, `manifest.json` and
`THIRD_PARTY_NOTICES.md` to `srd/core`. The manifest inventories distributed records and SHA-256
checksums. The release bundle check requires approval, an exact data file set, valid checksums,
and agreement between the manifest, provenance and legal notices. Curated fixes require refreshed
checksums and the normal parser, bundle and application checks. The corpus test uses the normal
parser. [Provenance](../resources/srd/PROVENANCE.md) · [Notices](../resources/srd/THIRD_PARTY_NOTICES.md)

The restricted manifest IPC returns validated pack identity, HTTPS source links, attribution,
license metadata, and the transformation notice for offline display in Settings. Renderer code does
not read arbitrary files or construct legal metadata independently.

## Loading rules

External validation recognizes the optional nested capability `book/book-tce.json`. It uses the
same authorized reader and bounded request pool; the Included SRD never requests it. Only a
confirmed inventory entry permits the loader to consume the read from this check. A check can
discover book-backed optional class features that an older inventory lacked.
Both the legacy `data` array envelope and the current singleton `bookData` envelope with exact
`TCE` id and source feed the same section checks. Malformed optional support is diagnosed without
rejecting otherwise valid ordinary content.

`optionalClassSections` retains thirteen compact source-qualified sections and their exact book,
chapter, class and optional-parent context, rather than the whole book. Independently reviewed
semantic inputs are separate from ordinary descriptor generation. Changed/ambiguous context or
body, missing source, or a missing current class granting declaration/progression leaves the
section unavailable. Members never supply a missing section. Later provided section identities
replace earlier candidates, retaining same-layer multiplicity for audit; omitted identities retain
the base. Current unavailable records cannot borrow old certificates. Background transport failure
retains the previous complete catalog under the existing refresh policy, rather than mixing revisions.
The closed context includes chapter/class introductory prose, document metadata and unexpected
structured ancestor entries. Only inventoried sibling frames/leaves are excluded; another known
class's title/page/body does not govern this class, while its type/field shape and stable ID remain
bounded. Each targeted class/section still requires its own complete context and exact identity.
Sibling inventories record whether an `entries` field was absent or an array. A known array body
may change or disappear; a new body on an entry-less node or a wrong-kind body remains unverified.
This applies at the book root and chapter, class and leaf lists. Books-index and TCE metadata keys
and value kinds are closed, while known publication/navigation values and unrelated books remain
independent of optional rules. These optional certificates do not tighten ordinary book validation.

Native optional class/subclass declarations use separate per-declaration records in
`optionalClassFeatureSources`. They bind the complete actual owner, encoded target and enclosing
gain to raw multiplicity, the exact local copy directive/lookup closure and complete retained
ancestor bodies before parser enrichment. Production copy preparation is shared with parsing.
Each declaration has its own scope: unrelated later declaration loss does not invalidate an
earlier root. Current filtered ancestors may omit only unrelated qualified subclass-reference entries,
preserving prose, metadata, order and the requested path. Unattached nested class references still
require the exact current candidate collection. Empty current indexes remain authoritative.
Winning owner/body identities replace their proof too, including absent or invalid incoming proof.
Existing proficiency/body audits remain independent. Parsed cache57 retains these serializable
records. Copies are materialized before composing layers; replacing a different owner without
providing a winning consumed body does not re-materialize an omitted copied owner. The
development semantic input is separate from ordinary generation; runtime rules retain
compact hashes and typed entry frames, rather than copies of corpus prose. Source qualification
alone neither adopts a feature nor implements its conditional benefits, spell grants or events.

The indexed class loader resolves class copies through declared internal and indexed dependencies.
It preserves the selected class's name, source, and overrides. Indexed subclass roots resolve
one level of copying against declared internal and indexed dependencies. The resulting features keep their original
source-qualified references. Starting and multiclass proficiency grants belong to the selected
class printing. Inherited features use their own source checks for class casting, optional features,
and other automated choices.

Each subclass feature resolves its nested references against the document that produced it
and that document’s declared subclass-feature dependencies. Dependency bodies retain their
original audits. Ambiguous targets carry a conflict and cyclic reference edges remain unresolved.
Dependency records stay in the producer’s entity inventory.

`node scripts/generate-copied-subclass-proficiency-roots.mjs --check` checks the generated
proficiency roots for plain indexed copies. The generator reuses the printed subclass’s
certified paths and records the copied owner’s retained first gain. Saved choices belong to
the selected class and subclass. A rule that refers to the printed class’s starting skill
pool uses that class’s current source, even when the selected copy has different starting skills.

Inherited mastery and Fighting Style choices resolve the selected class's declared feature
reference. The exact target supplies eligibility, while the selected class owns the saved choice.

Shared feature digests canonicalize current input on every call. Only exact canonical strings and
their SHA-256 values are reused in memory; source validity, ownership and multiplicity are always
checked separately. Retention is bounded to 256 entries, 32,768 code units per signature and a
512 KiB UTF-16 key/value payload charge (Map overhead is separately bounded by the entry limit).
Oversized inputs are hashed normally without retention; mutation and exact restoration are observed.
The same declaration channel also certifies ordinary granting dependencies for optional pool
expansions. Metamagic Options and Maneuver Options require their exact current standard grant
and structured progression; these dependency records remain standard features and never become
optional adoptions or additional selections. Their absence suspends only the expanded route,
retaining saved intent for exact restoration.

Numeric casting declarations use a separate `classCastingSources` collection. The shared declaration
resolver retains exact actual owners and requested feature targets; ordinary casting never becomes an
optional adoption merely by sharing that resolver. Additional raw exact-one proofs bind consumed
parent-class progression, preparation and table inputs. Parsed slot arrays must agree with the
production table derivation. The casting audit treats numeric and ordinal link labels for the same
explicit slot column as equivalent. It retains the link target, table rows and displayed data.
When a subclass uses the standard-table fallback, current authority
validates the actual helper-selected provider against the finite supported provider catalog; it does
not choose a different provider from an approved-only subset. Winning parent/provider layers replace
their proofs even when incoming proof is absent. Empty current evidence denies authority.
Exact licensed bundled declarations and full native declarations are alternative whole packages
within one producer; they never add another quota or saved slot identity. Raw auditing checks every
known package before projection. Current resolution first checks the complete evidence group for
closed shape, known certificates, one origin, one row per alternative and exactly one verified
package, then validates that package's complete owner/root/body. Unknown or conflicting evidence
cannot disappear through alternative filtering. Winning layers replace the entire group, so native
parent metadata cannot be stitched to a different bundled feature body.
The finite registry distinguishes level-earned cantrips/known spells, Wizard spellbook increments
and separate Arcanum gains; daily leveled preparation creates no historical numeric acquisition.
Simple class copies can use these same casting declarations when the current catalog proves the
declared copy, exact feature and casting fields. Saved slots name the selected class and reference
the original casting target. List membership still uses the selected class's current routes.
`node scripts/generate-class-casting-copy-owners.mjs` derives the owner pairs used to validate
saved intent offline. Changed casting features and transformed copies need their own authority.
Multiple named subclass spell schedules need a resolved configuration. Independent unnamed
schedules can still apply while the named schedules are unresolved.
Declaration and dependency qualification alone do not create character spell choices or usage events.
Ordinary `generate-class-casting-rules.mjs` checks the separate reviewed semantic input before writing
rules and its source/helper manifest; it never recaptures semantic authority on source drift.
The runtime registry shares repeated certificate and identity strings through generated constants.
Its complete values and field order must equal the canonical JSON registry; this changes only emitted
representation. The generator checks both outputs and includes the runtime module in its helper hashes.

- The loader uses one bounded worker pool (maximum six requests), including expanded class/spell
  indexes. Do not replace it with unbounded `Promise.all`.
- Every load has a request identity and abort signal. Superseded progress, success, and failure are
  ignored.
- Bundled entity files, class/spell indexes, and spell-source association data are required. When a
  source inventories a bestiary index, its referenced files are loaded through the same bounded
  worker pool and retained as a creature catalog for character-option resolution; their sourcebooks
  are not thereby exposed as selectable character-content books. For an external partial layer,
  inventoried indexes and their children are validated together. Absent top-level families are
  permitted. Fluff and presentation data are optional.
- Settings and startup share candidate validation. Verified removals require confirmation.
- A remote source with no reachable top-level resources fails instead of producing an empty catalog.
- A bundled source with no readable top-level resources also fails instead of producing an empty
  catalog.
- Parser output and source ordering must be deterministic to avoid cache fingerprint churn.

## Startup and update checks

Startup uses a compatible cache that matches the configured source and installed pack. Otherwise
it opens the Included SRD automatically. A session fallback preserves the configured source and
its last saved catalog. The overlay offers **Retry** and **Change source** if neither local
catalog is usable. If the pack is unavailable, recovery can admit a valid standalone external
catalog.

With automatic checks enabled, the configured source is checked after local game data becomes
available. Settings shows the configured location, when the content last changed, and when it was
last successfully checked. Failures and optional warnings appear separately. A changed catalog waits for
**Apply game data update** in Settings. The previous catalog remains active during checks and
review. The cache and accepted configuration are committed together after validation.
An unchanged check against a matching cache updates check metadata without rewriting the catalog.
The utility computes missing lookup indexes or a missing digest on cache open. A repair writes
only if the original cache generation is still current.

The source compatibility workflow checks a pinned public mirror revision and the mirror's current
default branch. It is scheduled and can run manually. Ordinary CI uses local fixtures.

## Parsing policy

Inspect the relevant pinned upstream 5etools behavior before writing an equivalent parser, reference,
filter or renderer. Reuse behind an adapter or adapt attributed data-only logic with parity checks;
record why application-specific behavior is needed. Keep saved choices, calculations and persistence
in the application. A browser-global upstream import needs its own trust/dependency assessment.

Prefer structure supplied by 5etools. When upstream exposes a rule only as prose, an adapter must
be narrow, ruleset/source-qualified, versioned, diagnostic when uncertain, and overridden by parsed
structured data whenever that becomes available.

The shared additional-spell normalizer preserves supported blocks, choices, counts, filters,
abilities and schedules without assigning an actor. Race adapters retain their suite/level
conventions; selected Class feature adapters establish actual ownership and supported missing
semantics separately. Unknown syntax cannot partially grant benefits. A successfully parsed block
does not certify arbitrary prose conditions or acquisition events; see [feature spell selection](contracts/spell-selection.md#selected-feature-cantrips).

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

See [Prerequisite eligibility](contracts/reference-resolution.md#prerequisite-eligibility).

## Compound reference collections

`conditionsdiseases.json` carries conditions, diseases and statuses. `trapshazards.json` carries
traps and hazards. Parser-owned `_sourceType` keeps each kind distinct in overlays and nested
references. Condition/status tags default to PHB. Disease and trap/hazard tags default to DMG.
Disease previews require a disease tag. Compendium reference availability is global. Character
condition controls and immunity names exclude diseases and statuses.

## Normalized capabilities

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

The current parsed cache schema version is defined in [dataCache](../src/lib/storage/dataCache.ts).
Use that constant when changing code.

Starting-item Basic classification records each parsed item's own input collection. Actual `baseitem`
rows are Basic; ordinary items/groups and unknown array-only inputs are Other. Copy resolution restores
that own category rather than inheriting it, generated variants remain Other, and winning layers/cache
round trips retain the boundary. A filename, source abbreviation or missing rarity cannot establish Basic.
Unmarked nonparser inputs retain absence and cannot inherit a parent's marker. Tool source certificates
exclude only this root collection marker from semantic hashes; full projection integrity and matching
raw/current marker ownership still protect restoration. Mechanical and nested copy rules remain certified.

Cache entries include a normalization schema version. Increment it whenever parser-owned normalized
output or layer composition changes in a way that makes previous cached data unsafe. Character
schema changes are a separate concern and follow [State Management](state-management.md).
Native Warlock patron rule exports use the current owner-qualified feature records. Older parsed
caches rebuild these attachments so unverified inline or copied bodies cannot supply the rules.
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
