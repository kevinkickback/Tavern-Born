# Character format and admission

Current admission is implemented in [the version constant](../../src/lib/schema/characterSchemaVersion.ts),
[the strict schema](../../src/types/characterSchema.ts), and [the store](../../src/store/characterStore.ts).
The current character format is **12**; the [parsed catalog cache](../data-ingestion.md#cache-compatibility) is independent.

The runtime supports exactly `CURRENT_CHARACTER_SCHEMA_VERSION`. Pre-release character formats
are not carried forward through breaking changes while preparing for 1.0. Older or newer versions
are rejected before strict validation; the cutoff performs no conversion or ownership inference.
Current output is normalized by `characterPersistenceSchema` before persistence.

Format12 replaces ordinary numeric class spell selections with `managedClassSpellChoices` and a
monotonic `managedClassSpellRevision` allocator. Each choice has its actual class/subclass owner,
domain, exact casting declaration, earned class level and ordinal; it saves an exact target printing,
positive revision, class-list policy and optional learned preparation request. It saves no applied
snapshot or activity flag. Strict admission audits the choice/profile/provenance relation in both
directions. Arbitrary class-choice spell tags, unowned numeric membership, invalid reserved IDs,
duplicate spell/slot identities, counters and preparation relationships reject without loaded rules.
An intent may have no materialized profile membership or reserved tag while its source is unavailable.
A learned preparation request may remain saved without a prepared member when capacity or source
access is suspended. Materialized numeric rows and reserved tags must still own each other exactly.
An admitted relation establishes saved ownership, never current source access. Older numeric profile
rows, inferred attribution and `spellSwaps` are not converted or accepted. Format11 files must be
recreated, as with other prerelease breaking changes. See [class spell selection](spell-selection.md).
The additive `optionalClassFeatureAdoptions` collection binds the actual full class/subclass owner,
complete reviewed target and enclosing earned gain. Strict admission rejects unknown roots, children
as roots, duplicate identities and conflicting families. Absence is unselected; no adoption or
historical event is inferred from the Rules flag, materialized benefits or saved setup. Known
unavailable intent remains saveable and removable; current source authority is derived separately.
Book-backed option pools retain their actual `book-section|source|id` target rather than a fabricated
class-feature UID; selected members remain ordinary exact class-choice intents in their existing slots.
The additive `feature-option`/`featureOption` class-choice category validates structural saved
row identity without loaded data; see [source-backed feature options](feature-references.md#source-backed-feature-options)
for current entitlement, retained recovery and derived rules.
Storm Aura uses the existing subclass-feature category with a structurally checked `subclass-options:`
owner/target/slot relation; see [its source and recovery boundary](feature-references.md#storm-aura-environment).

Natural Explorer uses the same feature-option category with a five-field source-group tuple and
`feature-literals:` owner/pool/group/grant/earned-level ID. Each earned terrain remains distinct,
including dormant intent; see [favored terrain](feature-references.md#natural-explorer-favored-terrain).

Variant rules accept only the current settings: optional class features, average hit points,
ability-score method, any-race subclasses, newer-printing preference, and equipment restrictions.
Discontinued subclass-specific flags and unknown settings are rejected, including objects mixed
with current settings; they are not converted or silently discarded. Current optional defaults
are unchanged, and unsupported library records retain their original exportable contents.

The current format retains canonical owned action IDs, exact manual/PDF selection matching, and no earlier-ID
compatibility. Schema 8 prerelease saves are rejected by the version cutoff; no ID conversion is
performed. See [automatic feature actions](../provenance.md#automatic-feature-actions).

The current schema also requires independent ordinary/bonus feat setup ownership and a complete relation between
saved options, owned benefits and materialized proficiencies/spells. One printing may appear once in
each collection; duplicate printings in one collection, unqualified setup tags, orphan ownership and
missing/contradictory benefits reject without loaded rules. Schema 7's shared selected-copy owner
cannot establish this relation by relabeling its version; recreate those prerelease characters.
See [feat ownership](../provenance.md#feat-setup-ownership) for the command contract.

Configured racial/background feat choices also require a saved printing, and their setup benefit
tags must address exactly one qualified configured reference. Unconfigured name-only choices stay
removable but cannot borrow catalog setup; explicitly reselect a printing to configure them.

The active source-qualified racial owner set remains required: the selected parent and optional
child. Every racial provenance tag and choice belongs to that selection; a child requires a parent.
Racial ability choices use canonical encoded full owner references and dense numeric block ordinals
within each represented owner. Array order does not change block identity; integer amounts are
explicit, and selections/status agree with the bounded saved player slots. Ambiguous or incoherent
records are rejected rather than repaired. Schema 4 did not validate those block associations.
Revised (2024) origin saves contain no racial ability grants or choice blocks; independent
background, class and manual ability ownership remains supported.
Racial spell profiles persist player suite/ability/target setup and a typed current applied snapshot.
The snapshot records exact parent/child context, actual granting owner, mandatory/alternative mode,
selected suite, currently eligible descriptors and fixed target printing/kind. The live alternative
catalog and future grant schedule are derived from parsed rules and are not stored as a second
rules engine. Class/special profiles cannot carry racial choices, context or ability-option metadata.

Catalog-independent admission checks the complete relation in both directions: every applied target
has matching materialization and exact selected suite/descriptor ownership, and every racial spell
tag belongs to that relation exactly once. Repeated fixed schedules may share one suite/target tag;
different owners, descriptors and target printings keep separate tags. Labels and casing cannot
create a second copy of the same ownership. Every saved native target has exactly two nonempty
`name|source` fields, without display markup or casting modifiers. Case and surrounding whitespace
still normalize for comparison. Foreign contexts/owners, duplicate structural IDs, unselected suite
grants, wrong kind/printing, missing or extra materialization, out-of-pool targets and logical
quota violations reject. Independent fixed, descriptor, class/feat/manual overlaps remain valid.
Structural IDs validate scope; they never supply missing game rules.

Available-rule refresh and intentional edits commit materialization and provenance atomically.
The native [compatibility rules](../provenance.md#native-racial-spells) preserve proven compatible setup
within exact owner contexts and rebuild current structural IDs and their inverse tags together.
Missing either exact context reference retains the whole snapshot, including through level changes;
restoration evaluates the current live rules. Alternative
suite and descriptor Clear work from saved membership without missing-data inference. Shared/Pact
usage and independent preparation remain mutable and retain their existing shapes.

Native rule corrections use the central acknowledged active-character queue. Unchanged semantic
state preserves references, timestamps and save state after strict admission; dirty corrections wait
for explicit Save, while clean corrections become durable only after acknowledgment. Immutable views
and PDF do not write inactive library entries. New native suite/ability/target setup needs complete
live owner rules; established missing targets and offline Clear retain the saved-snapshot contract.
The Spells page keeps suite, casting-ability and target controls in its Racial view, including before
any target is selected. Fixed suites without setup choices have no extra status-only card. The right
casting summary remains read-only; opening or switching views never mutates the character.

Matching current-format saves are supported regardless of age, and new 2014/2024 characters are both
supported. Schema 2–10 characters must be recreated; merely relabeling a version cannot establish
native ownership. Incompatible originals remain untouched in durable quarantine and exportable
through hydration, rejected imports in either order, retry and later successful library writes.
There are no prerelease converters, flattened-profile adapters or age-based rejection.

Schema 10 rejects duplicate special targets within or across kind lists and mismatched fixed
membership/nonmanual special grants without loading catalogs. It adds no per-owner historical kind
or conversion. Format 9 originals remain untouched and exportable through the same quarantine and
recovery paths; changing their version alone cannot legalize contradictory memberships.

Format 11 requires an exact selected-context racial defense snapshot whenever a race is selected,
including empty fixed-grant arrays with explicit parent/child field ownership. Empty unselected
drafts carry no snapshot. Strict admission rejects foreign/orphan contexts, malformed or duplicate
targets, duplicate manual effect IDs, and manual IDs in the reserved racial-defense namespace.
The old unowned `damageResistances`, `damageImmunities` and `conditionImmunities` fields are rejected,
including after version relabeling. Format 10 originals remain untouched and exportable through the
existing quarantine/recovery flow; there is no migration or historical ownership inference.

For a breaking change, update together:

1. version constant;
2. `Character` type and strict schema;
3. `createEmptyCharacter` and fixtures;
4. current exported fixtures and a documented compatibility cutoff;
5. persistence/import/rejection and original-export recovery tests.

Do not add pre-release migrations, downgrade paths or compatibility mirrors in feature code.
Newer, malformed, and unsafe records go to the durable exportable quarantine until acknowledged.
Announce a deliberate compatibility cutoff with the change and retain export-before-removal recovery.
