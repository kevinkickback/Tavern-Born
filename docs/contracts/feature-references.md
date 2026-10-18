# Class and subclass feature ingestion

Read this reference only when changing this contract. Start with the [topic index](../README.md).

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
Standalone saved feature actions retain their own IDs; description enrichment cannot attach them
to or suppress an earned class/subclass action. Qualified class choices retain complete target UIDs
and actual granting owners. Their actions require exact parsed rules and share stable structural
groups only within the same owner and feature family. Missing or ambiguous targets remain saved
intents without emitting opaque source-backed actions. The [provenance contract](../provenance.md)
owns grouping, manual override and restoration behavior.
A parsed-cache rebuild covers normalized class choices/schedules, lookup dictionaries and race/subrace normalization together.

## Composition and subclass presentation

Class/subclass choice options preserve their complete encoded feature UIDs through normalization
and exact catalog resolution. Dependency and capability audits check every owner, gain and printing
field rather than only `name|source`. A complete feature UID supplies its encoded or upstream-default
printing when the duplicated source is absent or blank; explicit source/name conflicts remain
unresolved. Other choice types still require an explicit source. Subclass feature parsing shares
the same UID defaults and complete identity codec. Every target field, including class, subclass
and feature printing, must match the declared UID. A copied subclass may have a different selected
class owner while retaining the exact original target; this does not relax target identity. An absent
printing stays unresolved, including inline references, intro text and level groups. Subclass intro
and level content come only from declared references; unreferenced raw rows are never synthesized
into subclass content or target catalogs. Content-layer collection and restoration use this same
complete identity, including omitted/blank upstream defaults; non-string sources are invalid and
selected owners do not supply target source fallbacks. Intro entries share one declared-reference
projection across parsing, composition and source filtering. The original intro UID remains its
target even when filtered out; another printing or gain cannot replace it. Subclass detail selection
retains its qualified owner/printing and derives content from the current filtered catalog. The panel
renders expanded intro references once within their level group; an exact target displayed as a
level feature is excluded from nested expansion. Different gains and printings remain distinct,
and the authoritative features retain their mechanical choices and Actions.
Changes to target identity/intro projections require a parsed-cache rebuild.

## Internal subclass-feature copies

Class documents materialize internal subclass-feature copies through the shared data-only copy
resolver before reference expansion and rule normalization. Production loading prepares the document
once for its class and class-feature projections; direct parser entry points use the same boundary.
Copy parents match all seven identity fields, with established source defaults and case/whitespace
normalization. Structural keys keep literal delimiters distinct; multiple exact parents are ambiguous.
The copied feature retains its own owner/gain while inherited nested references keep their original
targets. Local overrides, null removal and explicit upstream preservation rules apply without mutating
source data. Missing, invalid, ambiguous, cyclic or unsafe copies fail the required class resource;
foreground loads and background refreshes cannot replace complete memory/cache with that partial result.
Feature wildcard/template transformations are unsupported and fail explicitly. Existing explicit
shared copy operations retain their supported semantics. External cross-file feature-copy dependencies
and class-feature copies are outside this adapter's scope.

A parsed-cache rebuild restores previously empty copied bodies; saved character format11 is unchanged.
Restored text and nested declarations flow into the existing catalogs, Actions and PDF projections.
Materialization does not itself implement prose-only choices or qualify complete character journeys.

## Source-backed feature options

The exact PHB Dragon Ancestor target supplies a choose-one Draconic Ancestry selector through
the existing class-choice modal and shared SelectionModal. Rows and damage types come from the
resolved source table, including supported tagged damage cells. A saved `feature-option` selection
uses `featureOption` references: a JSON tuple of parent kind, complete canonical parent UID,
table and row. The actual selected subclass owner and earned level belong to the choice ID;
a copied owner never changes the encoded PHB target.

Only the current earned declaration and authoritative filtered owner catalog can verify a row.
Equivalent producer copies agree; conflicting, malformed, missing or filtered source data cannot
borrow an embedded/raw fallback. Audited source uncertainty is computed after copy materialization
and before first-match enrichment. Derived uncertainty metadata is excluded from action rule identity.

Builder, readiness, retained Overview details and both PDF summaries share this resolution.
They display the selected damage type and, once earned and source-verified, Elemental Affinity's
conditional Charisma bonus to one damage roll and optional one-sorcery-point, one-hour resistance.
Description-off summaries retain the selected name and verified damage type; unavailable rows
contribute no related context. They omit conditional rule prose.
They do not materialize an action, permanent resistance or a universal spell bonus. Fixed language,
interaction and Draconic Resilience rules retain their existing source presentation.

Missing source rules retain saved intent. Even a wholly pruned declaration produces a routed
restore-or-remove state for an existing saved selection. The same modal permits keeping/removing
saved rows without inventing a quota or replacement pool. Exact restoration verifies the original
selection; opening, Cancel and unchanged confirmation preserve its saved spelling, timestamps and
dirty state. Confirmation rechecks current source options. Clear/subclass removal/level rollback
retract only this owner's intent and preserve independently owned benefits.

This additive category uses character format11 and parsed cache42. Strict admission validates
the saved tuple/category/owner/slot relation without a catalog; live rules still govern entitlement.
Natural Explorer uses the separate literal-group boundary below; general passive automation remains outside these adapters.

## Required setup diagnostics

Normalization reports a bounded set of source-audited mandatory setup gaps: unavailable or
unverified Storm Aura/Natural Explorer declarations, PHB Ranger Favored Enemy, TCE Deft Explorer/Canny
and Mystic Psionics. Unsupported families remain diagnostic; unavailable Storm rules stay unverified.
Diagnostics never synthesize selectors or guess option counts. A retained known
UID with absent, conflicting or changed source rules reports unverified setup instead. Exact target
identity remains separate from the selected owner; nested diagnostics begin at the earliest reachable
grant after all enclosing levels are met. Unselected options are not earned declarations.

Builder and Review/readiness share active diagnostics and the filtered feature catalog. A known
Ranger base warning yields only to its exact declared, resolved, source-confirmed optional replacement;
missing, empty or ambiguous catalogs cannot waive it. The shared catalog retains repeated complete
class-feature identities for this audit before its lookup projection. Active Deft Explorer retains its
own Canny
warning. These checks do not change selections, benefits or character saves. Capability reports retain
all normalized gaps independently of a character's optional-feature toggle.

This detector covers retained, unconditionally reachable declarations. Fully pruned declarations or
unavailable enclosing features are not reconstructed. Other prose-only requirements and complete
choice coverage remain unqualified; zero diagnostics is not a completeness certificate.

## Storm Aura environment

The exact XGE Storm Aura declaration supplies one environment choice using real Desert, Sea or
Tundra subclass-feature UIDs at level 3. This bounded adapter derives its count from the audited
choose-one declaration; other countless options groups remain presentation. PHB and copied XPHB
Barbarian owners retain the original PHB targets. Both the declared intro-to-Aura path and its
current owner-scoped source parents must qualify before any option is eligible. A structured
`subclass-options:` ID binds the
actual owner, exact Aura target, environment group and earned gain. Strict admission checks this
new saved relation without requiring live catalogs; character format 11 stays additive.

One choice governs earned Storm Soul, Shielding Storm and Raging Storm. Shared filtered source
resolution supplies Builder, readiness, retained details, calculations, Actions and both PDF
families. Raw duplicate conflicts are audited before first-match enrichment.
The finite adapter qualifies all 14 source bodies with audited canonical SHA-256 fingerprints
and a top-level shape guard, including every duplicate producer before enrichment. Ordered source
rules and references are preserved; attached enrichment and recomputed audit metadata are ignored.
Unknown text, extra rule fields or a new source revision remain unverified until explicit re-audit,
even when some familiar phrases remain. The digest table distributes no source rules prose. Absent, empty,
changed or ambiguous rules preserve intent while retracting affected benefits and reporting an
unverified stage. The existing shared modal handles unchanged Edit, Cancel, replacement, Clear
and removal-only recovery even after the declaration is pruned. Confirmation rechecks availability.

Verified Storm Soul derives the selected resistance and Sea swimming speed through existing
character effects; independent faster movement, overrides and other grants retain their ownership.
Underwater breathing and extreme-temperature protection stay selected source context. Shielding
Storm describes chosen allies' conditional resistance in the aura. Aura supplies its bonus action;
Desert/Tundra Soul supply actions, Desert/Sea Raging supply reactions, and Tundra Raging augments
Aura's activation context. No future or alternative environment benefit is granted.

Action IDs use actual owner, selected real target and genuine source structure. Aura combines
parent and selected child source rules; later display context and character level do not change
its ID. Exact manual overrides and PDF action preferences remain bound through source loss and
restoration. Combat activation, damage, temporary hit points, target/ally state and duration
application remain player-managed. This adapter does not certify complete class automation or
complete legal progression coverage.

## Natural Explorer favored terrain

The exact PHB Ranger Natural Explorer pool supplies eight source literals, without fake terrain
entities or a table. Its level 1 grant and exact level 6 and 10 improvement declarations each earn
one independent choice. A `feature-literals:` ID binds actual owner, complete pool target, group,
complete grant target and earned level. The `featureOption` reference is the JSON tuple
`["source-group","classFeature",completePoolUid,"favored-terrain",canonicalTerrain]`.
Existing table-option and Storm identities remain unchanged. Offline admission validates the full
relation, exact slot, one pick and distinct gains/terrains within the same owner's pool and group,
including dormant records; current declarations still determine entitlement.

Four bounded source bodies (pool, both improvements and TCE Deft Explorer) qualify through full
ordered fingerprints and top-level shape guards. Every raw class-feature producer is audited
before first-match enrichment, including documents without subclasses. Unknown semantic fields,
nested changes or conflicting duplicates remain unverified. Equivalent audited pool/grant copies
may agree; the optional replacement must be singular. Current explicit empty catalogs remain
absent. A missing base invalidates the family; a missing later improvement affects that gain only.

Optional class features suppress terrain only when the actual owner currently declares the exact,
singular audited level 1 TCE Deft Explorer target in the filtered catalog. A shared effective
selection view derives activity for this family; saved inactivity is a hint. Source loss re-exposes
saved terrain and exact restoration suppresses it again, without writes during reads. Authorized
toggle/changed-edit commands reconcile persisted hints; unchanged confirmation preserves saved bytes.
Dormant intent retains names and gains marked
Inactive, with no eligible options, conditional facts, quota or recovery demand.

Builder, readiness, Overview, source/availability checks and both PDF families use these boundaries.
Unavailable grant warnings keep complete target and earned-level identity in navigation and list keys,
including explicit enclosing declarations that earn distinct targets at the same level. A saved
recovery replaces only its matching owner/grant/earned warning; unsaved gains remain unresolved.
Selected summaries keep conditional Intelligence/Wisdom proficiency and the full hour-or-more
travel qualifiers once per owner family, omitting alternative terrain names and future instructions.
Compact exports retain selected terrain names, gains and activity. The gain 6 Favored Enemy/language
paragraph does not become a terrain benefit. No global expertise, movement, resistance, travel state
or action is granted; other conditional Ranger prose retains its source presentation.

The shared selector handles Choose/Edit, unchanged confirmation, Cancel, per-gain Replace/Clear
and removal-only recovery after source/class loss. Confirmation validates current source authority
and distinctness against the latest character. Other earned gains and independent/manual grants
survive replacement/removal. Character format 11 stays additive; parsed cache 42 rebuilds the new
normalization and source audits. Complete Ranger automation and legal levels 1–20 remain unqualified.
