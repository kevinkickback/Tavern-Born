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
| Races/subraces | Compose raw identities before copies/versions and normalization. Parent replacement rebuilds children. | [Race ingestion](#race-copies-and-versions) |
| Items and shared/type text | Compose retained raw rows/definitions before copies, generation and text expansion. Final caches contain ready projections. | [Item ingestion](equipment.md#catalog-and-templates) |
| Class/subclass features | Re-link complete target UIDs, rebuild level groups/normalized choices, then validate required references. Intro content comes only from declared references. | [Feature references](#feature-references) |
| Other families | Overlay normalized collections by their complete identity. Repeated/nested records include structural owner/kind fields. | [Reference resolution](#identity-and-entity-resolution) |

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

Each attempt uses a bounded pool of at most six requests and one cancellation identity, including expanded indexes. The Included SRD requires its entity files, class and spell indexes, and spell-source data. External layers can omit whole families but must supply complete, valid children for the indexes they declare. An authoritative empty collection is valid. Optional presentation files can degrade independently. Unreachable and empty catalogs never silently replace a usable catalog.

### Source authority for class choices and casting

The external inventory can include optional `book/book-tce.json`. The loader accepts a legacy
`data` array or a singleton `bookData` entry with exact TCE identity. Malformed optional
support is diagnosed without rejecting otherwise valid content. A book-backed option needs
the verified chapter, class, section, and current granting declaration.

Native optional-feature proof binds each exact owner, target and gain to its raw declaration,
ancestor entries, and declared copy dependencies. One missing declaration does not invalidate
an independent grant. Winning layers replace proof with the winning declaration. Explicitly
empty, conflicting, or unavailable current evidence cannot borrow authority from older data.

Numeric casting uses separate proof for the feature, prepared/known counts and actual source
table provider. The licensed bundled and full native declarations are alternative whole
packages. A single verified package supplies the quota and saved slot identity. A parser
cannot combine a native parent with a different bundled feature body. The casting generator
checks reviewed inputs and rejects source drift. Qualification alone grants no choices or
usage events.

## Startup and update checks

Startup uses a compatible cache that matches the configured source and installed pack. Otherwise
it opens the Included SRD automatically. A session fallback preserves the configured source and
its last saved catalog. The overlay offers **Retry** and **Change source** if neither local
catalog is usable. Automatic startup checks allow 15 seconds per attempt and manual catalog
operations allow up to 60 seconds. If the pack is unavailable, recovery can admit a valid
standalone external catalog.

With automatic checks enabled, startup checks the configured source after local data is available
if there is no successful check or the last one was at least 24 hours ago. Returning focus can start
a due check. After a failure, the retry delay starts at 15 minutes and doubles up to eight hours.
The app remembers the delay for the configured source across launches. A missing compatible cache
allows a recovery check before the daily interval, subject to failure backoff. Manual checks can
run immediately. Settings shows the configured location, when the content last changed, and when
it was last successfully checked. Failures and optional warnings appear separately. A rebuild
restores additional content automatically when the saved catalog's rules, source layers and
resource and record inventories match. Restoration waits for open character workflows and unsaved
edits to clear. Changed results and results without enough evidence to prove a match wait for
manual approval in Settings. When a new parser rebuilds an older cache at startup, it can activate
the result automatically if the accepted source inputs match, no records were withdrawn, and
saved characters retain their choices and calculated rules. Newly available choices may appear.
GitHub needs the same accepted commit. Local folders and other HTTPS sources need complete
matching hashes from the previous accepted catalog. Older settings without hashes can still
restore an exact parsed match. A full HTTPS check records hashes for future rebuilds.
On relaunch an unapplied preview can be
checked again before the daily interval, subject to backoff. The previous catalog remains active
during checks and review. The cache and accepted configuration are committed together after validation.
If startup needs built-in rules because the saved catalog could not open, a due recovery check
keeps the loading screen open within the startup check's time limit. A failed check or a result
that needs manual review opens the app with built-in rules. Startup with usable saved data
stays nonblocking.
An unchanged check against a matching cache updates check metadata without rewriting the catalog.
A complete accepted catalog with a matching cache schema, source and Included SRD can skip
preparation when the source still matches. GitHub checks the verified commit. Other HTTPS
sources recheck each JSON resource with an ETag or Last-Modified when available, and check
previously missing resources again. Local folders check file identity, size and timestamps for
the inputs the catalog uses, including indexes and files previously missing. Changes,
inconclusive results and older caches run the full check. A server that cannot provide or
accept validators can still be checked with ordinary requests.
An interrupted read of an existing source keeps the accepted catalog. A missing top-level file
or a record withdrawn from a successfully read file can appear in the removal preview. A missing
file still declared by an index fails the check. Confirmed removals require Apply. A same-source
reload that changes the accepted catalog also requires Apply, including changes to descriptions
that do not have separate record identities in the removal preview.

An open Wizard or Builder keeps its current catalog. A dirty Builder draft also blocks manual
catalog changes after leaving Builder. Applying or restoring a catalog briefly defers workflow
entry. Activation checks the accepted generation before writing; when a compatible catalog is
replaced, its data and settings are saved together as one restore point. Use **Restore previous
game data** in Settings to restore it without contacting its source. Restoration consumes that
restore point. Rollback restores game data and source settings. Character reconciliation still
follows the active rules, and rollback cannot restore character choices already changed under a
different catalog. Snapshots from incompatible rules packs or cache schemas are ineligible.
The utility computes missing lookup indexes or a missing digest on cache open. A repair writes
only if the original cache generation is still current.

The source compatibility workflow checks a pinned public mirror revision and the mirror's current
default branch. It is scheduled and can run manually. Ordinary CI uses local fixtures.

## Parsing policy

Normalize source data once, preserving structured requirements and complete identities. Unsupported
counted choice blocks stay diagnostic. A presentation group without a count does not create a pick.
A generic template remains a reference entry until a supported generator builds a concrete item.

### Race copies and versions

The data-only copy engine reads own properties and rejects prototype keys and unsafe paths or
directives. Failed copies cannot alter prototypes or replace a usable catalog. Race parents use
exact name/source. Subrace parents also include race name/source. Missing parents, cycles,
unattached subraces and unsupported rules fail the completed catalog. Raw stacks may defer
resolution until composition.

Versions substitute template values, apply overrides and then run copy modifications. Honor
explicit null removals. Subrace versions compose the exact parent before applying child version
rules. They do not inherit parent version definitions. Complete versions retain their full
mechanics and exact saved identity. Ordinary children keep domain-specific inheritance.
Named race templates are unsupported.
[Pinned upstream copy and version rules](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js) · [Pinned subrace merge](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js)

Native additional spells preserve named suites, abilities, earned schedules and exact fixed or
choice targets. Known, innate and prepared support direct, at-will, ritual and bounded daily/rest
declarations. Daily can use `pb`. Expanded `s0`–`s9` grants list eligibility only. Whole-field
null removes inheritance. Malformed or unsupported supplied blocks fail as a whole. No resource
or rest-use tracking is created.

Spell UIDs default an omitted source to PHB and retain printing and recognized casting modifiers.
Filters require valid class or level constraints. An empty supplied class constraint cannot
become unrestricted. Structural suite and descriptor IDs encode exact owner, grant kind and
usage bucket. Equivalent casing and order preserve identity. Duplicate descriptors reject.
The evaluator activates one valid suite, while the save retains its applied snapshot.
[Native spell parser tests](../tests/lib/5etools/raceSpells.test.ts)

### Background copies

Resolve mechanical copies against winning exact name and source pairs before normalizing origin
rules. A copy keeps its own printing and can inherit equipment, proficiencies and entries, remove
inherited fields with null, or apply supported array edits. Chains resolve recursively. Missing,
ambiguous, cyclic or unsupported copies reject the candidate. An overlay can supply the exact
parent. Source-local optional fluff attaches to its own printing. Background version expansion
and independent fluff copies remain unsupported.
[Pinned background copy rules](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js#L4727-L4734)

## Feature references

The shared UID codec follows the pinned [5etools class reference format](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js).
A class feature needs its name, class name and printing, positive gain level and feature printing.
Subclass features also require the subclass short name and printing in their own UID field order.
Blank class and subclass sources default to PHB. A blank feature source uses the decoded class
source for a class feature and the decoded subclass source for a subclass feature.
Compare normalized fields without rewriting raw UIDs. Explicit conflicts and incomplete or
ambiguous targets remain unresolved.

A complete encoded level overrides attached metadata. A malformed nonempty UID cannot borrow a
level. A row without a UID can use a valid explicit or attached level. Subclass gain defaults to
level 3 only when no class reference is marked as the subclass gain.

### Composition and subclass presentation

Layering re-resolves complete targets and rebuilds owning rules before required-reference
validation. A repeated label or selected parent cannot fill a missing target owner. Keep actual
selected owner, declaring feature and target identities separate. Intro presentation follows the
declared intro references. Raw unavailable details may remain readable without granting rules.
Legacy stored name/source descriptions can enrich only on one unique owner/level match.

A standalone external catalog also resolves cross-document class-feature targets before checking
required references. This path supports recovery when the Included pack is unavailable.

Builder follows the selected class and subclass's direct references, including exact targets
printed under another class. This keeps inherited descriptions and the Epic Boon choice tied
to the selected owner. Supported resource counters also require a matching declared feature
and the selected class's own table. Their saved counters are separate across printings.
An inherited Epic Boon claim retains its exact declaration so it can suspend or be cleared
when the class source is withdrawn.

Exact standalone use clauses can supply an ability-based maximum, a single-use pool, a dice
pool, or a fixed number of slot-free casts. Existing counters take precedence. Saved remaining
uses belong to the actual class or subclass owner and the qualified feature. Spell preparation
and manual use tracking have separate rules.

### Subclass copies

Subclass-owner copies support one declared parent and retain the exact child owner. The supported
contract covers gameplay fields and qualified references. Website-only flags and owner-level
version or template expansion are outside that contract.

Resolve copies before reference expansion, with the shared data-only copy engine. Match all seven
subclass-feature identity fields and retain the copied row's owner and level. Nested references
keep their original targets.
The indexed `_meta.dependencies.subclassFeature` scope supplies copy parents and exact referenced
features. Dependency rows stay in their producer documents. Missing, ambiguous, cyclic, unsafe or
unsupported copies fail the required class resource. [Copy tests](../tests/lib/5etools/subclassFeatureCopies.test.ts)

### Source-backed feature options

A structured option saves its canonical feature, table/row or source-group address, actual
selected owner and earned slot. Current exact rules determine its pool and derived benefit.
Classic Dragon Ancestor uses a table row. Revised Elemental Affinity uses an authored damage
type. Conflicting, absent or filtered declarations preserve saved selections for recovery without
granting benefits. Opening and cancelling leave the save alone. Clear removes the addressed owner.

An authored companion table keeps the pet family separate from its qualified creature stat
block. The family may occupy one ordinary Weapon Mastery slot for its Beast's Strike. Changing
the family releases that allocation, and changing forms within one family preserves it. Earned
specialization rules show their conditions with the companion. Existing generic companions
remain valid without a family. A family that requires a separate taming ability displays that
prerequisite.

### Required setup diagnostics

A known, reachable declaration with unverified rules reports a setup gap. The bounded detectors
cover Storm Aura, Natural Explorer, Favored Enemy, Canny and Mystic setup. They never guess counts
or reconstruct wholly pruned rules. An adopted unavailable replacement has one restore-or-clear
duty. An empty diagnostics list does not qualify all class choices.

### Specialized setup

- Storm Aura, Natural Explorer and Favored Enemy retain distinct earned choices. Campaign-authored
  humanoid labels are literals, and an explicit language assertion or none belongs to its own gain.
- Canny and other Expertise choices require current qualifying proficiency. Paired
  proficiency/Expertise uses its declared order. Save each provider separately so removal
  preserves independently earned proficiency and Expertise.
- Conditional proficiencies use exact declarations and the effective character. Unknown conditions
  require review. [Class choice normalization tests](../tests/lib/5etools/classChoiceNormalization.test.ts)

## Identity and entity resolution

Compare trimmed name and source fields independently. Resolve the exact filtered record, then
the exact raw record for a retained selection. New picks remain in the eligible filtered pool.
A unique candidate cannot supply a missing printing. Source-less custom equipment and manual
spells retain their saved facts without catalog enrichment. Display aliases never replace IDs.

Fixed feats and saved spell options remain visible through filtering or source absence.
Opening, cancelling and unchanged confirmation preserve ownership. A missing exact target
requires restoration or replacement before finishing a new edit. Keep unmatched saved choices
visible for explicit removal. Apply setup through the exact owner. [Feat ownership](provenance.md#feat-setup-ownership)

## Ruleset compatibility

`originSystem` selects the PHB/XPHB, DMG/XDMG and MM/XMM replacement families. 2014 cannot use
revised entities. 2024 can use older supplements and the explicitly unreplaced PHB options.
A revised replacement wins before same-edition reprint preferences. Missing, ambiguous and
cyclic reprint targets do not establish a replacement.

Qualified legacy subclass and option dependencies resolve under their exact current owner and
declared target. They do not enable a source globally. Conflicts, duplicate targets and explicitly
empty scopes cannot acquire authority from embedded or raw recovery data. The Compendium's
global catalog remains separate from character filtering. The applicable PHB or XPHB is implicit.
Bundled public items use the shared player-item policy. Their DMG/MM or XDMG/XMM provenance
does not enable those books for general selection.

## Source removal

Commit allowed sources, pruning and provenance together. Retain numeric and daily spell intent
while suspending unavailable benefits. Racial and Bonus pruning retracts only the removed exact
printing and its addressed owner. A fixed grant protects its exact profile target only. Removing
one owner preserves independent grants, preparation and usage. Re-enabling sources does not
recreate explicitly pruned racial or Bonus choices.
[Pruning tests](../tests/lib/nonracialSourcePruning.test.ts)

## Spell enrichment

Spell routes bind exact spell and class printings, base or variant channel, and any defining
source alternatives. Invalid declarations or duplicates cannot become unrestricted memberships.
Retain source-local audit evidence through layers and parsed cache. A winning layer replaces
the whole producer package. A changed or explicitly empty lookup replaces previous evidence.
Filtering checks target, owner and defining sources independently. An empty current view stays
empty. Base and variant lists remain separate. Missing casting tables provide no invented
capacity. [Route tests](../tests/lib/spellRouteSources.test.ts)

## Prerequisite eligibility

Upstream prerequisite blocks are alternatives. Conditions within a block all apply. Ability maps
require every named score, and separate maps are alternatives. Class-qualified levels use the
exact matching class/subclass and printing, without adding unrelated class levels.

The shared checker distinguishes met, unmet and unsupported. A met alternative is sufficient.
Malformed or unknown conditions require review. A known failure makes its own block unmet.
Known spell names use the shared logical identity. Filtered spell choices and unknown suffixes
remain unsupported.

## Compound reference collections

`conditionsdiseases.json` carries conditions, diseases and statuses. `trapshazards.json` carries
traps and hazards. Parser-owned `_sourceType` keeps each kind distinct in overlays and nested
references. Condition/status tags default to PHB. Disease and trap/hazard tags default to DMG.
Disease previews require a disease tag. Compendium reference availability is global. Character
condition controls and immunity names exclude diseases and statuses.

## Rule text in previews and sheets

Previews and the plain-text PDF projection share the entry renderer. Nested entries, lists,
tables, exact reference labels and supported tags retain their text. Table cells can display
authored entries, numbers, or exact and bounded rolls with their declared padding. Table
footnotes follow the rows. An authored `{@dice}` label supplies the text when present.
Rolls and conditional text remain instructions for the player. Unsupported entry shapes and
site-specific layouts do not supply mechanics or inferred rules.

## Items and starting equipment

An actual `baseitem` row carries Basic classification through copies, layering and cache reload. Missing collection metadata does not inherit the parent’s classification. Other and generated variants stay Other. See [Equipment](equipment.md#catalog-and-templates) for generation and saved rules.

## Cache compatibility

The [parsed schema version](../src/lib/storage/dataCache.ts) changes when parser or composition updates make earlier projections unsafe. Identity binds the installed Included SRD pack and the configured external source. Cache repair only writes over the same generation. Character format is independent.

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
