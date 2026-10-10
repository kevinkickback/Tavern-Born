# Data Ingestion

The ingestion layer turns a configured 5etools source into stable, source-qualified application
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

The Included SRD is the permanent base catalog. When a local directory or remote 5etools root is
configured, both sources are loaded and parsed independently. `contentLayers.ts` then overlays the
external normalized collections on the SRD collections: an exact external identity wins, while an
SRD identity omitted by the external source remains available. Race data is retained as raw records
during loading: race identities and parent-qualified subrace identities are overlaid before copy
resolution, version expansion, and presentation normalization. This also rebuilds copies that resolved
within an earlier layer when a later layer replaces their parent. The loader retains these inputs
outside serializable `GameData`; only completed normalized catalogs enter the cache. Other families
currently compose their normalized collections. Unresolved class-feature references are re-linked against the completed catalog and
their normalized class rules are rebuilt before the final lookups are constructed. Subclass-feature
references are re-linked the same way, their level groupings are rebuilt, and their source-owned
choice descriptors are normalized after layering. Explicit class and subclass choice references
are checked against the completed class-feature, subclass-feature, creature, feat, item, and
optional-feature catalogs.

Top-level entities use source-qualified identity. Nested or repeated definitions require their
complete structural identity; class features include their parent class and level so repeated names
such as Ability Score Improvement do not collapse during composition. Item properties are identified
by abbreviation and source, whether their display name is top-level or in an entry. The lookup
indexes each source-qualified property UID and retains abbreviation fallbacks for older saved
characters. External-source configuration remains persisted in its existing shape for upgrade
compatibility, while the effective cache identity records both the bundled base and external layer.

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

Class-feature references decode the pinned upstream
[`DataUtil.class` UID contract](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js)
through `classFeatureIdentity.ts`. Resolution includes feature name, owner class name/source,
positive integer gain level and feature source. Empty packed class sources default to PHB; empty
feature sources default to the decoded class source, independently of the surrounding class.
Whitespace/case normalization does not change the retained raw UID or subclass-gain flag. An absent
exact target or incomplete UID remains unresolved; another owner, level or printing cannot supply
it, and a resolved record never rewrites the reference's encoded identity. Source-stack composition
uses the same identity codec for overlays and can resolve an absent target later using the retained
identity, including upstream default source fields. Incomplete reference fields remain unresolved
after layering. Embedded targets absent from the completed catalog are cleared, and their owning
class rules are rebuilt before required-reference validation. Choice owners and option references
use the resolved feature source, falling back
to the decoded UID source for omitted or blank target sources before considering the enclosing
class source.
This contract covers class-feature ingestion; global search/display lookups and stored-feature
consumer identities have separate compatibility requirements. Class ASI, expertise, subclass
selection, automatic class actions, and feature-owned choice gain levels use the same codec:
a complete encoded UID supplies the level
even when materialized metadata disagrees. A malformed nonempty UID cannot gain a level from
metadata or display text. Rows without a UID may use an explicit positive integer numeric level,
or the attached feature level when that field is absent. Subclass selection retains its legacy
level-three default only when there is no class-feature reference marked for subclass gain;
a marked reference with an invalid level remains unknown and cannot enable a selection. Readiness
navigation for an unavailable selected subclass omits the level when it is unknown.
Subclass references retain their separate layout and normalization contract.

The global `classFeaturesByKey` dictionary uses the same complete identity as ingestion and layers.
Incomplete records are retained under opaque catalog-local keys, which are not valid feature UIDs.
Stored features with only name/source may enrich their descriptions from exactly one matching
catalog record. Multiple owner/level matches preserve saved text; they cannot select a printing or
fall through to an optional feature. Actions and PDF use this shared description projection.
An earned class or subclass action is suppressed by a saved feature only when that feature
actually projects an action; missing or passive saved text cannot hide a qualified earned action.
Matching a produced saved action uses canonical case and complete class-feature source defaults;
subclass matching retains its separate source layout. Different saved printings remain distinct.
Matching uses the codec's name/source case normalization and effective source defaults for complete
records; incomplete rows use only their supplied name/source. A missing saved printing cannot prove
a match with a complete canonical record.
Fully qualified choice persistence and tooltip resolution retain their separate contracts.
Cache schema 27 rebuilds older cached catalogs, including normalized class schedules, global
lookup dictionaries, and the existing race/subrace normalization together.

The data-only copy resolver validates copied records, parent data, and applied templates before
modification. Reserved `__proto__`, `constructor`, and `prototype` keys or path segments are rejected
with a copy diagnostic, including nested spell groups and property selectors. Traversal reads only
own properties; newly created path and directive dictionaries have no prototype. A failed copy
keeps its original record and cannot change shared runtime prototypes. Loader/layer composition
treats unresolved copies as required failures before publishing the catalog.
The cache schema is bumped when copy trust rules change so previously resolved catalogs are rebuilt.

Race and subrace copies use this same data-only engine. Race parents use `name|source`; subrace
parents additionally require `raceName|raceSource`. Missing parents, unattached subraces, cycles,
invalid directives, and unsupported operations fail a completed catalog. A source-stack load can
defer these errors until all raw race inputs are composed; it cannot persist that incomplete view.

Race versions adapt `DataUtil.generic.getVersions` from the bundled snapshot's pinned
[5etools v2.35.1 revision](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js).
Template variables are substituted before implementation overrides, and copy modifications run
after those overrides. Versions use the shared ordered array/path modification engine, inherit
mechanics, and honor explicit null removals. Missing variables and unsupported transformations
produce diagnostics. The adapter excludes upstream browser cache, exclusion, and hash globals;
Tavern Born supplies source-qualified identity and its nested lineage presentation instead.
Resolved versions carry `_isVersion` and complete mechanics. Existing top-level versions retain
their saved short selection labels for compatibility. Selecting a version uses its complete record,
so parent abilities are not doubled and removed traits stay absent.
Traditional subraces retain their existing additive merge behavior. Normalized records contain no
unapplied `_copy`, `_mod`, or `_versions` directives from this race pipeline. Named race templates
are currently unsupported and reported as missing rather than silently skipped.

Subrace `_versions` expand after composing the resolved subrace with its exact parent, using a
data-only adaptation of the pinned upstream
[`Renderer.race._getMergedSubrace`](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js).
This merges corresponding ability blocks, applies explicit array overwrites and named entry
replacement, and removes null fields before version modifications can refer to inherited rules.
Parent-level version definitions are not reapplied to child families. Ambiguous ability/skill
merges or unsupported version operations are required diagnostics in a completed catalog; a raw
source stack can defer them until composition. Named and nameless subrace families use the same
pipeline. Empty child version arrays do not require composing ordinary subrace mechanics.
New child versions preserve their complete upstream `name|source` identities; shortening them can
collapse distinct families or nested names. Existing top-level version labels retain their saved
identities, including historical punctuation. Existing ordinary subrace entries remain available
with their previous names; their consumed `_versions` definitions are removed. Cache schema 24
rebuilds older catalogs, including unreleased child labels, structural duplicates, and catalogs
that previously omitted unattached subraces without reporting a required failure.

Array additions that use `appendIfNotExistsArr` compare JSON values structurally: object member
order does not create a second trait, while array order and distinct values remain significant.

Racial spell parsing preserves complete native additional-spell blocks: their names, fixed or chosen
casting ability, character-level schedules, direct/nested lists, positive choice counts, filters,
explicit target pools and supplied daily limits, including proficiency-based `pb` expressions.
Known, innate and prepared grants support direct,
`_`, will, ritual, daily and rest buckets. Expanded `sN` entries extend class-list eligibility; they
never become automatic known racial spells. This boundary does not implement expendable daily/rest
resources. Unsupported filter fields and invalid schedule levels/counts are diagnostic errors.
The native evaluator validates the complete supported grammar before returning a suite. Supplied
blocks and schedules must be objects, lists must be arrays, and every member must be recognized;
mixed supported/unsupported rules reject together. Expanded lists accept `s0` through `s9` only,
including cantrip eligibility. Unsupported upstream constructs such as resource/limited buckets
and all-matching descriptors produce diagnostics rather than partial grants. This validation runs
when native rules are evaluated; the source loader retains raw additional-spell records.
Choice descriptors reject unknown members and conflicting inner/outer counts. Both count locations
remain supported when unambiguous. Casting abilities must be one of the six abbreviations or a
nonempty choice set; spelling, case and whitespace normalization never invent a missing ability.
Malformed spell UIDs, display markup, unknown casting modifiers and extra UID fields reject locally
before decoding; the shared codec's unrelated consumers are unchanged. Empty lists and omitted optional rules remain
valid. No character conversion or data-cache change is needed for this live validation boundary.
Whole-field `additionalSpells: null` remains an upstream inheritance-removal marker, normalized to
absence before native evaluation. Null schedules or lists inside a supplied block are malformed.
An explicitly supplied class filter requires at least one nonempty class name; whitespace or
semicolon-only constraints reject instead of becoming unrestricted. Omitting the class segment
remains unrestricted, and class-only filters retain their native cantrip-level default.
Filter segments require exactly one equals sign. A level field may appear once; repeated class
fields retain their union semantics. Conflicting or duplicate level assignments reject.
Daily/rest usage keys must be canonical positive integers, optionally ending in `e`; only daily
also accepts `pb`. Zero, leading zeros and unsupported rest expressions reject before materialization.

Spell UIDs retain exact target printing and `#c`, including a marker after the printing. An omitted
target source defaults to PHB independently of the owner source or origin edition, following the
pinned upstream spell UID default. Casting modifiers and usage buckets remain part of live suite
identity. Complete versions suppress parent blocks; ordinary parent and child each retain an actual
owner. Named traditional parent blocks filter to the selected child.

`raceSpellIdentity.ts` encodes canonical structural owner/context/suite/descriptor identities.
Object/list order, casing and surrounding UID whitespace do not change equivalent setup. Duplicate
suite or descriptor identities reject rather than assigning an ordinal. Descriptor scope includes
its native grant kind and usage bucket, so identical pools at different
daily/rest limits remain independent. IDs are opaque to eligibility
consumers: missing rules cannot be reconstructed from an encoded identifier. The pure native evaluator
activates one complete block, retaining an applied snapshot rather than persisting an alternative
catalog or future schedule. See [spell ownership](provenance.md#reconciliation-rules).

## Prerequisite eligibility

The shared prerequisite checker consumes the upstream raw shape. Blocks in `prerequisite[]` are
alternatives (OR); conditions within one block must all hold (AND). Ability requirements use maps
such as `{ dex: 13 }`: every score in a map is required, and separate maps in `ability[]` are
alternatives. Never substitute the checker-specific `{ ability, score }` shape or an implicit
threshold for source data. Class-qualified level requirements use the matching class/subclass
progression and supplied source, not total multiclass level or just the primary class.
Class-choice snapshots resolve the selected subclass's upstream short name from the exact
source-qualified class catalog. An unavailable subclass identity requires review rather than
guessing an alias; levels belonging to distinct class entries are never added to meet one owner.
Contextual class choices and subclass eligibility carry the selected parent class source into
numeric level checks. A missing saved source cannot prove a source-qualified subclass condition.

The aggregate result distinguishes `met`, `unmet`, and `unsupported`. Unknown condition keys or
malformed supported conditions require manual review and cannot prove eligibility. A satisfied
alternative is sufficient even when another alternative is unsupported; a definitely failed
condition makes its own AND block unmet. Selection filters and feat details expose review reasons.
This does not imply that every upstream condition is automated: unsupported feat, campaign,
proficiency, and other conditions retain that explicit review state until their mechanics are
implemented against an authoritative character snapshot.

Known spell/cantrip names are decoded from source-qualified selections before prerequisite matching,
consistent with the existing logical spell-name equality contract. Spell lists are alternatives;
filtered spell choices and unknown spell-reference suffixes require manual review.

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
and diagnostic provenance. Unknown choice blocks remain visible as diagnostics instead of becoming
invented options. Optional-feature and feat progression remain the count owners when feature prose
repeats the same choice. Feature variants retain replacement metadata so the character's optional
class-feature setting can swap the original and replacement choice without showing both.

## Identity and entity resolution

Lookup keys are case-normalized `name|source`. Exact resolution checks the filtered primary lookup,
then the exact raw lookup so an existing saved selection remains resolvable after a filter change.
Persisted references without a source are rejected rather than matched to the first printing.

Fixed feat grants retain their explicit name/source and optional variant when the requested record
is missing. Their resolver checks the filtered catalog, then the exact raw catalog; it never
substitutes a same-name printing. Background and Feats projections show unavailable data and do
not offer setup from another printing; readiness reports unresolved fixed grants even when prior
options exist. Cards and details evaluate prerequisites only when the requested feat data is
available; missing rules cannot establish that prerequisites are met or unmet.
The selected card and inspector compare the complete normalized name/source identity, so a
selection made during absence follows its exact printing when rules return without rewriting
the saved grant or its options.
A source-less fixed grant remains unresolved even when only one printing is loaded; resolution
does not infer a target source or rewrite provenance or saved option keys. Exact raw fixed
grants remain viewable/configurable after source filtering without entering the selection list.
Feat editing resolves saved spell choices against exact raw rule records and retains them
in the dialog, while new spell, optional-feature, and language choices remain character-filtered.
An eligible row retains the original saved reference after complete name/source normalization,
so source changes and catalog casing changes preserve selection and removal without rewriting it.
Finishing resolves spell metadata by complete name/source; a competing printing cannot determine
cantrip classification. Materialized spell names use the shared reference parser and normalized
deduplication; the original full reference remains in saved options, and retraction uses the same
parsed name. An unavailable saved spell must be replaced or its rules restored before
completion; merely opening the dialog leaves saved options and provenance intact.
Retained saved spells remain visible and removable while selected in the current step even when
refreshed metadata no longer matches its filter. Clearing such a choice removes the out-of-filter
row; it cannot be newly selected in an unrelated step. The filter still governs new choices.
Aggregate saved spell choices are assigned once to eligible steps within their quotas, including
overlapping filters. Exact references cannot occupy two steps. When multiple steps cannot place a
saved choice from current metadata, the dialog keeps it visible for explicit recovery or removal;
it cannot silently discard that choice on Finish. Changing the casting class clears its spell
choices while retaining unrelated choices at their new step positions. Finish validates all steps
and exact spell availability; saved literal references and independent ownership remain unchanged.
If the exact feat's current rules leave no setup steps, reopening shows a dismissible recovery
dialog with the saved choices, including a fixed casting class whose entry has no picks. Opening,
Cancel and dismissal preserve the saved setup and benefits. Explicitly clearing applies an empty
setup through the existing atomic edit command: the feat and independently owned benefits remain,
while this setup's choices and grants are removed. The empty setup remains a configured record;
restoring the rules and reopening allows fresh selections without a format conversion.
Clearing requires an explicit caller action and an identifiable setup owner, including independent
ordinary and bonus copies of the same printing. See [feat setup ownership](provenance.md#feat-setup-ownership)
for the command and persistence contract. Fixed/class/choice owners retain their explicit identities.
Plain and tagged spell references
use the same shared parser for exact source resolution. Fixed option teardown compares normalized
feat name/source while preserving the distinct granting owner and variant.

Overview reads retained features and class-choice details through `useRetainedCharacterDetails`.
Its pure resolver indexes class/subclass features with the saved class and subclass owner context,
including raw nested subclass features when their source is filtered out. Choice details distinguish
available, loaded but source-unavailable, and missing records without changing saved selections.
The hook applies the character's implicit core source and reprint preference through the same filtering
policy as other character data hooks.
Class choices, retained details, and the Compendium share the recursive subclass-feature collector;
it traverses nested entry containers safely and preserves distinct records before owner-specific indexing.

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
Filtering class or subclass feature references also rebuilds their normalized rules, so the class
builder and readiness validation cannot retain choices owned by disabled or suppressed content.
Creature filtering admits the ruleset's implicit monster source (MM for 2014, XMM for 2024) and any
explicitly selected monster source only for resolving character options; this does not make those
books selectable in character source settings.
The global Compendium intentionally indexes the complete loaded creature catalog and canonical,
context-qualified subclass features. Character source filtering remains separate from that global
reference view.

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

5etools `_copy` records for items and creatures are resolved by source-qualified parent identity
after their respective catalogs have loaded. Bestiary copies can also apply `bestiary/template.json`
ancestry templates. The resolver reports missing parents, cycles, and unsupported transformations
instead of inventing missing mechanics; layered composition retries copies against the completed
base-plus-additional catalog before rebuilding lookups. Generic magic variants (`GV`) remain in
the reference catalog, but inventory and filtered item choices exclude these templates because
they lack a selected base item and its equipment properties.

Public SRD items housed in DMG/XDMG are admitted by the shared player-item policy without enabling
the full source. The Included SRD remains the base catalog when additional content is configured,
so these items stay available in both the bundled-only and layered views without presenting DMG,
MM, XDMG, or XMM as selectable books. Their original source-qualified identities remain intact for
references and lookups. This is a filtering and source-catalog policy, not duplicated or relabeled
item data.

## Cache compatibility

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
