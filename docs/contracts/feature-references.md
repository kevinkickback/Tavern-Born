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
