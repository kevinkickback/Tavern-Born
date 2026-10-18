# Race copies, versions and native spell parsing

Read this reference only when changing this contract. Start with the [topic index](../README.md).

The data-only copy resolver validates copied records, parent data, and applied templates before
modification. Reserved `__proto__`, `constructor`, and `prototype` keys or path segments are rejected
with a copy diagnostic, including nested spell groups and property selectors. Traversal reads only
own properties; newly created path and directive dictionaries have no prototype. A failed copy
keeps its original record and cannot change shared runtime prototypes. Loader/layer composition
treats unresolved concrete item/creature copies as required failures before publishing the catalog.
Optional primary item-type and magic-template copy gaps use the bounded
[item support diagnostics](item-ingestion.md) instead.
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
Traditional subraces retain their existing domain merge behavior. The three defense fields follow
the pinned upstream overwrite/null-removal rule; see [racial defenses](../provenance.md#racial-defenses).
Normalized records contain no
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
with their previous names; their consumed `_versions` definitions are removed. Parsed-cache invalidation covers changed child labels, structural duplicates and previously omitted unattached subraces.

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
catalog or future schedule. See [spell ownership](../provenance.md#reconciliation-rules).
