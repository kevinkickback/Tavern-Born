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

Feat setup retraction also matches an absent option owner key exactly. Editing or removing an
ordinary selected copy does not treat that absent key as a wildcard for fixed/class/choice setup.
Whole-source callers keep their existing all-variant removal behavior.

Race, subrace and background commands reconcile fixed feat setup after the complete replacement
ledger is built. A matching fixed grant from a retained or new owner keeps its setup. Only the
final matching grant's removal retracts saved fixed options and their benefits; independently
configured feat choices and other printings/variants retain their own ownership. Strict persistence
requires separate target metadata on fixed feat tags. Pre-release grants with overloaded identity
are rejected with their character format rather than guessed or converted.

Option commits and edit dialogs use the requested feat owner. Fixed, class and racial/background
choice setups update their own records, including when a separately selected copy has the same
name and printing. They do not overwrite or borrow that independent copy's saved selections.

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
rebuilds the racial set, even when the child reference stays the same; compatible spell setup retains
the separate same-profile rule described below.

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

Race selection commands rebuild the persisted racial spell profile at the actual total character
level. They remove obsolete racial profiles and choice ownership, then restore saved choices only
for the same source-qualified profile and compatible choice rules. Existing choice commands enforce
current pool and count limits. Casting ability selections survive only while allowed by the current
fixed ability or choice options; removing that rule clears a historical ability. Independent class
and special profiles and spell-slot usage remain intact. A shared pure selection adapter keeps
command and spell-hook labels and blocks consistent; legacy profile labels and choice identifiers
remain stable.
Spells, Actions and PDF action projection consume the same resolved parent/subrace context through
the shared spell-profile builder. They preserve those profile identities when projecting saved choices,
filter named parent blocks to the selected child, and respect complete-version spell removal.
An unavailable exact selected parent or child projects cloned existing saved racial profiles,
including choices, casting ability and source identity, even when an available parent has spell
grants. Unrelated spell edits commit those retained profiles with provenance together. Exact
raw-catalog fallback counts as available; restored exact metadata resumes normal derivation.
Metadata-free consumers cannot establish a racial removal and retain selected saved racial profiles.
Only a fully resolved selection can establish empty racial grants. Without a selected race,
the projection omits racial profiles. Intentional race/subrace commands still remove obsolete setup atomically.
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
Choice IDs include the granting printing; updates target selected ability records rather than every
record sharing an opaque ID. Unrelated owners and nonability choices cannot consume ability slots.
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
Opening the race page or refreshing its catalog does not clear or substitute a saved child.
Explicit race selection chooses its initial child; explicit child selection owns later changes.

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

Class-page spell choices and replacements use pure spell commands. `useSpellProvenanceMutations`
exposes only `setClassSpellSelectionsAtLevel` and `swapClassSpellAtLevel`; general Spells-page writes
use `useSpellProfileMutations`, which already commits profile and provenance changes together.

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
