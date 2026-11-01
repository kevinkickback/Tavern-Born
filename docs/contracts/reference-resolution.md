# Saved references, selection and source policy

Read this reference only when changing this contract. Start with the [topic index](../README.md).

## Identity and entity resolution

Lookup keys use trimmed `name|source` fields. Exact resolution checks the filtered primary lookup,
then the exact raw lookup so an existing saved selection remains resolvable after a filter change.
Generic entity resolution requires a source instead of taking the first printing. This is not a
universal admission rule for every persisted field: source-less custom equipment and manual spell
values retain their saved facts without catalog enrichment. See [equipment resolution](item-ingestion.md)
and [spell state](../state-management.md#spell-state).

Class selections compare complete name and source fields independently after trimming and
case normalization through `findClassReference`. Catalog spelling changes retain calculations,
HP, spells, Actions, readiness and PDF rules without rewriting saved owner fields or profile IDs.
Explicit different names or book printings remain distinct, including during missing/restored
metadata; a source-less class never acquires a printing from a unique candidate. Generic entity
lookup keys and subclass name/source matching retain their own existing contracts.

Racial feat choice displays use the complete saved feat name/source and retain that visible
reference when its rules are unavailable. Change-dialog preselection requires the exact printing
in the filtered eligible pool; saved unavailable records never expand the new-choice list.
Opening, Cancel and unchanged confirmation preserve configured options and character dirty state.

Subrace display labels may remove a recognized parent prefix when the parent is already shown,
retaining lineage qualifiers and book disambiguation. Summaries and native spell displays retain
parent context. Unsafe name shapes retain their full names. These are presentation projections:
canonical parsed/saved names, selection values, lookup keys, spell profiles and grant owners stay
unchanged, including when exact metadata is filtered out or missing.

Readiness, source-conflict notices, movement and action/effect attribution derive the same
contextual labels. A racial source is associated with the selected child only when its complete
normalized name and book match the saved selection; missing or conflicting references retain
their original names. Native profiles use their saved parent/child context even before a spell
suite is chosen. Source objects, generated effect titles, custom labels and list/choice identities
remain canonical; display formatting never supplies an identity or rewrites the character.

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
ordinary and bonus copies of the same printing. See [feat setup ownership](../provenance.md#feat-setup-ownership)
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

## Source removal

Source-setting changes commit allowed sources, affected spell selections, materialization and
ownership together. [sourceConflicts](../../src/lib/sourceConflicts.ts) coordinates racial descriptor
removal and the [nonracial command](../../src/lib/character/commands/sourceSpellPruningCommand.ts).

- Racial pruning uses the saved descriptor's exact target/printing removal command, even when
  rules are unavailable. Another owner or printing cannot retain the removed descriptor's tag.
- Numeric class choices and daily preparation retain their exact saved intent. Current projection
  suspends unavailable benefits; restoring the exact source re-evaluates that intent without
  allocating another gain or changing its revision.
- Bonus pruning retracts choice tags only for the removed exact target and its affected owners.
  Other owners and printings remain independent.
- A fixed declaration protects only its exact saved reference in that profile. Another printing
  cannot shield a disabled choice; a fixed grant in another profile does not protect that choice.
- Mandatory fixed grants and unaffected independent selections remain intact, as do saved
  preparation and slot usage. Re-enabling a source does not recreate removed Bonus or racial choices.
- Source-less manual spells remain independent of source settings. Removing one targets only its
  empty-source identity and preserves qualified copies and unrelated owners. Catalog metadata
  requires a complete source-qualified reference, including before accepting a direct lookup hit.
- Other source conflicts are reported for review instead of silently rewriting saved choices.

See [nonracial source-pruning checks](../../tests/lib/nonracialSourcePruning.test.ts) and
[native racial ownership](racial-ownership.md#native-racial-spells) for the distinct inverse contracts.

## Spell enrichment

`generated/gendata-spell-source-lookup.json` is required ingestion input. Spell parsing adapts
5etools' separate `class` and `classVariant` associations into source-qualified routes. Each route
includes the exact spell printing, class printing, channel and defining-source alternative. `true`
means no additional defining source; a singular source or nonempty plural string/null list supplies
OR alternatives. Invalid predicates and conflicting producer sets cannot become unrestricted routes.
Canonical aliases are checked before lookup projection; overlapping separate embedded rows remain
unverified, while repeated alternatives within one valid plural predicate deduplicate.
Each parse invocation prepares one shared index from its current supplied lookup. Prepared indexes
are not reused across calls, so malformed alias mutations cannot hide behind a lossy JSON revision.

Each parsed spell retains its original routing input, source-local lookup evidence and target
occurrences in `classSpellRouteSource`. Its digest binds reconstruction, not authenticity or actor
permission. Duplicate spell targets remain ambiguous through document loading, cross-file merging,
layer Maps, direct lookups and JSON cache. A later winning layer replaces the whole source package;
it cannot borrow the losing layer's associations. Reparse without new lookup restores validated
evidence; an explicitly supplied changed or empty lookup replaces old lookup evidence, retaining
only genuinely original embedded input. Invalid derived packages never fall back to enriched lists.

Shared source filtering derives `classSpellRoutes` and compatibility lists from the retained package,
checking spell, class-owner and nonnull defining sources independently. An explicit empty current
view stays empty through lookup construction; source restoration derives from retained evidence.
Original validated display labels are preserved while identity comparisons use canonical values.
Unique legacy records without an audit retain old compatibility behavior and acquire no new proof.
Subclass associations keep their existing contract and are cloned without mutating input.

Lookup and layer boundaries validate every audited record, including singletons and malformed
targets. They rebuild compatibility lists from the verified current route subset, preserve an
explicit empty view and diagnose invalid current routes. An absent current field may derive the
validated source view; malformed or unsupported current routes cannot restore hidden memberships.

Runtime class-list checks continue to consume only the verified base `fromClassList` projection
through `isSpellOnClassList()`. Variants remain separate in `fromClassListVariant`; this source-only
boundary does not enable optional spell-section adoption, add casting quotas, select spells or
create managed acquisition/preparation/event state.

Class slot progressions come from parsed class tables. Shared multiclass slots use the matching
PHB/XPHB full-caster table, including Artificer's special contribution. Missing tables produce a
diagnostic/no invented capacity.
