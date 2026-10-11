# Provenance

Provenance records which source owns each materialized grant so changing a race, class, background,
feat, spell choice, or equipment option can retract only what that source supplied.

## Ownership model

`character.provenance` contains source tags for proficiencies, ability bonuses, features, feats,
spells, equipment, and structured choices. A tag identifies the source type/name/reference, grant
type, label, and domain-specific metadata such as class level or choice ID.

`sourceRef` identifies the granting owner's printing. Fixed feat tags separately store the granted
feat's printing in `grantSource` and its parameter in `grantVariant`; neither replaces owner identity.
Resolution and fixed setup keys use that target printing/variant. Ledger deduplication includes both
owner and target, so one owner can grant two printings without collapsing them. An unqualified fixed
target remains unresolved, even if only one printing is loaded; the owner's printing is not a default.

Normalization is case-insensitive for identity but preserves readable/source-qualified data for
display and resolution. Multiple tags may own the same grant; removing one owner must retain the
grant while another owner remains.
Separate owner name/source fields normalize only whitespace and case, preserving their complete
literal values. Proficiency/item key normalization must not truncate or reinterpret those fields.

Completed current-format characters have one active racial owner set: the selected source-qualified
parent and optional child. Every racial tag and choice in every ledger domain must match that set;
a selected child requires a parent. Persistence validates the complete character and rejects foreign
or orphan ownership, without requiring loaded metadata or inferring missing references. Empty
drafts without racial ownership remain valid. Creation and mutation commands commit identity,
materialized fields and provenance atomically; intermediate Finish patches are not saved characters.

## Layers

| Layer | Responsibility |
| --- | --- |
| `src/lib/provenance/` | Pure ledger primitives, normalization, summaries, source-specific grant helpers. |
| `src/lib/character/commands/` | Complete domain transitions and reconciliation. |
| Domain mutation hooks | Gather active state/data and commit one command result. |
| `useProvenanceRows` / UI components | Read-only explanation of current ownership. |

Production pages call their domain hook directly. `useProvenance` and
`useProvenanceMutations` are integration-test aggregators, not a production mutation API.

## Command pattern

```ts
const result = applyDomainChange(character, ledger, input, dependencies)

updateCharacter(character.id, {
  ...result.characterPatch,
  provenance: result.provenanceUpdate,
})
```

A command owns identity updates, old-source reconciliation, materialized fields, and the ledger.
Batch choices accumulate the full result before the single store write.

## Reconciliation rules

- Match the complete owner identity, including source and choice/level metadata where applicable.
- Remove only tags owned by the replaced or unavailable source.
- Remove the materialized value only when no tag remains.
- Preserve manual and unrelated grants.
- Rebuild dependent fields (for example expertise or fixed spell ownership) in the same command.
- Level-down/class removal processes spell replacement events in reverse order before pruning them.
- Initial creation uses the same commands as later editing.

Never clear a whole category because one source changed.

Fixed feat option edits opt into normalized name/reference and fixed-variant matching, consistent
with saved option keys. Choice/class owner keys still match exactly; another printing or distinct
variant retains its benefits. Other `removeGrantsBySourceRef` callers retain exact comparison.

## Feat setup ownership

Ordinary and bonus setup commands require an explicit `selectionKind` and exactly one active record
with the complete normalized name/source pair in that collection. Their benefit tags retain that
printing and distinct `selection:ordinary` / `selection:bonus` owner keys. Each collection permits
one copy of a printing; the same repeatable printing may belong to both. Fixed, class-choice and
racial/background-choice keys remain independent.

Commit/Finish replaces the addressed owner's saved setup atomically. Edit, Clear and removal read
its active saved choices for retraction across selected, fixed, class and provenance-choice owners;
stale dialog options cannot leave old materialized benefits behind. Class setup requires exactly
one class choice and one complete qualified feat reference before any setup command changes state.
Missing, conflicting or inactive selected owners reject without changing the draft. Clear leaves an
empty configured record and works without game data; removal deletes only the requested selection.
Configured records retain Edit recovery when the whole feat catalog is missing. Unchanged picker
confirmation retains unavailable saved selections; deselecting a saved entry explicitly removes it.
Shared benefits remain until their final owner is removed. Separate complete owner fields normalize
case and surrounding whitespace; literal pipes cannot collapse different name/source pairs.

Racial/background choice removal requires exactly one matching saved reference. An omitted source
can remove a unique complete name; absent or ambiguous targets leave the draft intact. Removing a
choice or class progression record retains its owner's aggregate feat marker while another selected
printing or literal name shares that ledger bucket. Racial/background reconciliation considers all
remaining feat choices with the same source owner, including distinct choice IDs. Class level-down
compares complete feat references rather than opaque issued IDs; new class feat IDs encode their fields without delimiter
collisions. Cards and Edit use the same normalized complete reference after catalog casing refresh.

Name-only unconfigured choice records remain visible and removable without catalog inference. They
require explicit printing reselection before setup. Commit/Edit must match exactly one qualified
saved choice reference; configured name-only references reject at admission. Choice setup benefit
tags require the exact choice ID and one matching qualified reference with saved options. A matching
unconfigured reference cannot legalize orphan setup benefits. This cutoff adds no converter.

Strict admission validates selected setup ownership and benefits in both directions, without loaded
rules. Every selected record, including an unconfigured record, requires exactly one manual feat
ownership marker for its copy and printing. Repeated normalized choices within a skill, language,
tool or spell array reject at admission and before setup commands change the draft. Distinct spell
printings remain separate choices; display aliases for the same printing do not count twice.
Spell targets require exactly two nonempty plain name/source fields or a valid source-qualified
5etools spell tag; trailing plain fields reject before parsing or mutation. Selected ownership uses
canonical ledger map keys, including name-only spell keys with their printing in `grantSource`.
Admission rejects aliases in those keys rather than normalizing them into a benefit that removal
cannot find. Readable saved references and separate owner fields still support case and whitespace.
The [schema 8 cutoff](state-management.md#schema-compatibility) rejects ambiguous earlier
formats without conversion. Whole-source callers retain their existing all-variant removal behavior.

Race, subrace and background commands reconcile fixed feat setup after the complete replacement
ledger is built. A matching fixed grant from a retained or new owner keeps its setup. Only the
final matching grant's removal retracts saved fixed options and their benefits; independently
configured feat choices and other printings/variants retain their own ownership. Strict persistence
requires separate target metadata on fixed feat tags. Pre-release grants with overloaded identity
are rejected with their character format rather than guessed or converted.

Option commits and edit dialogs use the requested feat owner. Fixed, class and racial/background
choice setups update their own records, including when a separately selected copy has the same
name and printing. They do not overwrite or borrow that independent copy's saved selections.

Feat-selected spells retain the exact target printing in the special profile, fixed list and
`grantSource`; the granting feat's printing remains in `sourceRef`. Retraction considers only
remaining owners in the special profile, so class or racial ownership cannot leave an orphan
special selection or fixed lock. Independent special owners and other printings remain intact.
Spells-page locks use that same exact target identity. The bonus picker still prevents selecting
an already-known logical spell; later independent feat grants can share its target.
Bonus additions and special-profile bulk writes retain established printings and fixed targets;
logical-name picker restrictions never deduplicate previously applied independent grants.

New feat spell selections require exact spell metadata. An established selection can retain its
saved cantrip/leveled kind without metadata when the same feat owner still owns that exact target.
Edits resolve all targets before retracting anything; an unavailable new target rejects the whole
command without dirtying the draft. Clear and removal use saved ownership, including while offline.
This does not infer missing target printings or convert earlier character formats.

New feat expertise and manual expertise selections use optional `proficiencies.expertise` ledger
ownership, separate from skill proficiency. Retraction preserves expertise from another owner.
Untracked expertise is retained while its proficiency remains, and a pre-existing untracked selection
is preserved as manual when a new feat grants the same expertise. Removing proficiency still prunes expertise. This ownership
rule does not reconstruct the origin of untracked expertise. Complete proficiency
removal commands also expire expertise ownership when its materialized selection is pruned, so
later proficiency grants cannot revive a historical expertise owner.

## Origin ability scores

Origin rules depend on `character.originSystem`:

- 2014: race/subrace owns origin ability bonuses and racial feat choices.
- 2024: background owns origin ability assignment and origin feat grants.

`resolveRaceAsiChoices()` and the background normalization/command path validate selections against
parsed blocks. Unresolved choices remain explicit readiness issues; commands do not invent defaults.
Allocated base scores are never modified by origin or feat contributions. Effective scores consume
the ledger through `CharacterCalculationContext`.

Materialized race versions own their complete mechanics under the selected subrace identity. Their
parent contributes selection identity and origin-policy flags, without reapplying parent grants.
Switching to or from a version rebuilds both race and subrace ownership in one command so explicitly
removed proficiencies, spells, feats, and abilities are not restored or doubled. Traditional subrace
changes retain the existing additive ownership behavior.

Ordinary child replacement or clearing preserves the unchanged parent's nonability selections when
the previous child resolves exactly as ordinary. If its metadata is unavailable or its kind cannot
be established, rebuild the whole selection: the old child may have been a complete version.
Do not guess its kind or treat another printing as the previous child. Parent replacement always
rebuilds the racial set, even when the child reference stays the same. Native spell identities include
both context printings, so changing either resets intentional spell setup.

Child versions retain upstream revised-parent metadata as `_baseFreeRules2024`. Origin normalization
recognizes that marker on complete versions so 2014 characters do not gain inherited revised racial
feats when saved selections are resolved from the raw catalog.

Complete versions also derive the legacy language fallback from their own string-valued lineage
when explicit language blocks are absent. Explicit arrays, including an empty array, suppress that
fallback for both parents and versions. The version owns both the fixed language and its choice;
traditional subraces do not synthesize a second parent fallback. The 2024 origin policy suppresses
racial language grants and retains its independent baseline.

Race commands compare proficiency ownership before removal with the ledger after all replaced
owners are removed, then apply the new grants. A value shared only by the old race and subrace
leaves with their final owner. Values still owned by a manual or unrelated source, and untracked
manual values, remain. Skill expertise is pruned with any proficiency that becomes unavailable.

Spell-profile adapters use the same complete-version boundary: the shared selection adapter omits parent
spell blocks for a materialized version, including inherited blocks already present on that version
and blocks explicitly removed by it. Traditional subrace spell blocks remain additive, with named
parent blocks filtered to the selected subrace. Saved selections use the same rule when resolved
from the unfiltered catalog.

Native racial spells use one profile per actual granting parent or child, scoped to the complete
selected context. One native block is mandatory and automatically active; multiple blocks are
alternatives and start unselected. Alternative Select/Replace activates all currently eligible
members of one whole suite. Clear leaves the owner unselected, including after source re-enable.
Internal descriptors retain independent quotas and exact target selections; descriptor Clear retains
fixed suite members. Structural identities include the complete context and block semantics, with
no historical ordinal aliases or owner inference.

`nativeRacialSpells.ts` evaluates live eligibility at total class level, materializes the typed applied
fixed/choice snapshot, and reconciles its exact inverse in spell provenance. Fixed tags identify the
selected suite; choice tags identify the full descriptor. Owner `sourceRef` and target `grantSource`
remain separate. Removing one descriptor/owner preserves other descriptors, fixed grants and
class/feat/manual ownership of the same exact target. Logical duplicates consume only one descriptor
quota, while different applied printings retain separate identities.

Race/child replacement, final Wizard Finish, class/progression changes and every Spells edit commit
profiles and provenance together. Source-setting pruning removes disallowed intentional exact targets
and their descriptor ownership; fixed members and independent allowed owners remain. Source re-enable
cannot recreate an erased choice. Expanded native targets extend live class-list eligibility without
automatically learning a spell or adding racial slot pools.

Spells, Sources, Actions, readiness and immutable PDF use the same projected relation. Either missing
exact context member freezes the whole established snapshot; an available parent cannot partially
refresh a missing child. Saved alternative/descriptor Clear remains possible, while new suite/target
selection requires complete rules. Level changes during absence retain the applied snapshot.
New filter-backed targets additionally require available exact-printing metadata matching the live
descriptor's level and class list. Retaining or removing an established target can use its saved
snapshot without that metadata. Unselected alternatives retain setup controls but contribute no
active casting summary or racial PDF page.
Restoration evaluates rules at the current level; compatible setup survives, ineligible descriptors
leave, and incompatible structural identities reset atomically. No dormant choices are resurrected.
Independent class/special preparation and shared/Pact usage remain unchanged by racial transitions.
Available class and subclass data still derive current grants at the
character's level. Each unavailable exact class or selected subclass retains its own saved profile
even when another class resolves. This unavailable-class policy also applies to the Spells projection.
This fallback derives available subclass grants with their explicit spell source qualifiers, including
new level grants, so a competing printing cannot replace the requested spell. The shared spell-token
adapter accepts source-preserving decoding; existing callers retain their legacy decoding contract.
The same fallback uses spell-reference identity for class grant merging and preparation. Action
aggregation always uses resolved spell-reference identity, including after exact race data returns.
A newly granted printing cannot prepare or hide an independently saved printing.
Source-less legacy fixed metadata still retracts its prior name-based grants; action aggregation
resolves legacy references before deduplication so equivalent references do not duplicate actions.
Only a resolved race selection can establish which racial spell blocks apply or were removed.
Mutation hooks resolve both current and previous subrace metadata from the unfiltered catalog.
Commands can therefore rebuild full race ownership when leaving a version hidden by source filters.
If the previous saved child is unavailable even in that catalog, its mechanics cannot establish an
additive transition. The command rebuilds the complete race selection and resets racial choices
against the newly selected data, preserving manual and unrelated ownership.

Racial ability grants and calculations use the same parsed fixed bonuses and choice blocks.
Explicit ability rules take precedence over flexible lineage defaults; fixed bonuses coexist with
choices. The three-ability distribution is one choice with a count of three. Parent choices precede
ordinary child choices, and an ability overwrite excludes only the exact parent printing's grants.
Selections are bounded by each pool and count, with duplicates excluded across racial blocks.
Choice IDs encode the complete normalized granting name and printing plus a numeric block ordinal.
Current saves require unique dense ordinals within each represented owner, explicit integer amounts
and bounded selections/status consistent with the player's slots. Parent blocks precede child blocks;
each owner's blocks follow numeric ordinals regardless of ledger array order. Updates retain the
ledger's array order and target the selected record objects. Unrelated domains and manual/class choices
may share IDs without consuming racial ability slots; opaque racial ability IDs are rejected.
Commands retain the player's slot layout while committing validated selections to provenance.
Ordinary child changes rebuild the selected parent's ability ownership with the cleared slots,
including restoring parent bonuses after an overwrite ends. Complete versions own synthesized
origin bonuses under the child identity. Wizard Review shares the bounded calculator, and the
Builder distribution control commits the new shape and ownership in one command update.
Changing only the distribution replaces ability records and retains every non-ability racial choice
and benefit. Ability values and choice amounts must be integers to match persistence validation.
When exact race data is unavailable, current-format saved fixed and chosen racial bonuses remain
available to calculation; revised origin rules suppress those racial bonuses.
Race summaries use the same bounded choices and selected distribution as calculation, preserving
the separate parent and child rules rather than deriving ability rules from a merged display record.
Missing exact parent or child metadata hides racial choice editing until that selection resolves;
an available parent alone cannot establish the missing child's layout. Rejected ability commands
leave the draft, modification timestamp and unsaved-change state untouched.
Selecting the already active distribution is also a no-op and retains assigned bonuses.
Direct ability-choice calls without a matching current racial block leave the complete draft and
save state untouched. Known matching records remain usable by pure commands without catalog inputs.
Opening the race page or refreshing its catalog does not clear or substitute a saved child.
Saved selection details resolve the exact current reference even when catalog filters hide it;
new race and child options remain restricted to the filtered catalog. Child option values retain
the separate complete name and source, without interpreting a joined label as an identity.
Nested child resolution compares both complete fields with case and surrounding whitespace
normalized; a different printing, truncated name or absent source cannot supply that child.
Explicit race selection chooses its initial child; explicit child selection owns later changes.

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

### Automatic feature actions

Actions and PDF use one pure projection. Earned class/subclass actions retain the complete encoded
feature UID and the actual selected owner. UID source defaults, casing and display aliases identify
one feature; subclass UIDs use their separate field order. A positive integer encoded gain level
is authoritative; malformed nonempty UIDs never borrow materialized metadata. Rows without a UID
require valid materialized levels and complete feature ownership.

Distinct owners, printings and different gain-level rules remain separate. Repeated gains share
one action only when their parsed entries are identical within the same owner/feature family.
Passive references do not consume an action identity. Saved name/source feature actions suppress
only one unambiguous active earned projection; catalog enrichment retains its unique-match policy.
When exactly one saved action replaces exactly one earned projection, its compatible IDs follow
that saved row. Multiple matching saved rows do not assign an override to an arbitrary row.

Existing unique raw-UID and no-UID action IDs remain usable. Projection-only aliases preserve manual
overrides and PDF selections across canonical UID spelling changes and identical repeated gains.
Issued owner-qualified IDs remain aliases when competing owners/gains leave. Unique materialized
name/source IDs also survive casing/whitespace changes; ambiguous normalized labels cannot bind.
Legacy uniqueness includes every eligible same-kind name/source target, including complete UID
targets that never issued that legacy label. Other printings and class/subclass ID kinds remain
independent.
Aliases are not character-format fields and are rebuilt from current eligible rules. Ambiguous
legacy name/source IDs cannot recover an owner: their manual actions remain separate, and wholly
stale PDF selections follow the usual automatic fallback. Explicit manual actions remain available
when their source disappears or their gain becomes ineligible; removing the override reveals any
still-earned action. No historical ownership guessing or character conversion is performed.

Class-page spell choices and replacements use pure spell commands. `useSpellProvenanceMutations`
exposes only `setClassSpellSelectionsAtLevel` and `swapClassSpellAtLevel`; general Spells-page writes
use `useSpellProfileMutations`, which already commits profile and provenance changes together.

The bonus picker blocks spell targets already known through any profile. Existing overlapping
owners remain independent when later class or origin changes grant an already selected bonus spell.
Bonus spell selection records manual ownership with the selected spell printing. Replacing the
bonus list retracts only its removed manual targets. Removing a bonus copy preserves racial,
class and feat ownership of the same target, including independently prepared class spells.
Qualified removals never assign an unknown-source grant to the requested printing.

## Equipment ownership

Starting packages and manual inventory/proficiency changes use equipment commands. Package option
identity, chosen concrete generic item, inventory record, currency, and ledger change atomically.
Replacing a background package removes its prior items/currency before applying the new package.

## Invariants

- No orphaned materialized grant after its final owner is removed.
- No lost value while another source still owns it.
- No separate component-level provenance patch after a domain mutation.
- Every automatic grant has an explainable source label.
- Every reversible choice has stable owner metadata.
- Unknown/ambiguous parser input remains diagnostic rather than becoming a grant.

## Testing

Test pure commands first. Cover:

- initial grant;
- replacement/source change;
- removal and level-down;
- overlapping owners;
- manual-grant preservation;
- atomic materialized + ledger output;
- source-qualified identity collisions.

Use hook integration tests only for adapter/store behavior or cross-domain composition. Avoid tests
that mutate the ledger separately from the materialized state; that is not a supported workflow.
