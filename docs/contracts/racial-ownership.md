# Racial ability, defense and spell ownership

Read this reference only when changing this contract. Start with the [topic index](../README.md).

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
changes retain existing domain ownership behavior; defensive fields use the overwrite contract below.

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

### Racial defenses

`racialDefenses` stores the current fixed grants and their actual field owners, bound to the exact
selected parent/child name and source. For each of `resist`, `immune` and `conditionImmune`, an ordinary
child's absent key inherits the parent, null removes the field, an empty array grants nothing, and a
nonempty array replaces the whole parent array. This follows the pinned
[`Renderer.race._getMergedSubrace`](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js).
Inherited fields belong to the parent; explicit replacements belong to the child. Complete versions
own all three fields and never restore absent parent defenses. Only direct string values become
automatic grants; choices, nested conditions and prose remain available for manual interpretation.

Creation and race/subrace commands commit selection and this snapshot together. Exact live context
refreshes it through the shared pure projection and acknowledged active-character correction queue.
Missing either selected reference preserves the entire snapshot; exact restoration applies current
rules. Source filtering retains ancestry through raw exact lookup. Clearing a child with current
parent rules restores the parent, including when old child rules are unavailable; no parent rules
means Clear cannot infer replaced parent benefits. No dormant parent catalog is saved.

Typed effects combine these racial declarations with independently owned manual, feat and equipment
grants. Stable racial IDs encode the actual parent owner, or child plus its parent context, family
and target. Suppressing one source retains another active source's equal-valued grant. The
`racial-defense:` namespace is reserved, and manual declaration IDs must be unique. Review and PDF
use one effective active union; attribution retains separate owners. Adjustments exposes the same
declarations and activation rules. The custom 2014 PDF prints the mechanical defense list; other
templates retain their existing racial/feature prose projection. Source prose can still mention a
removed structured defense; it is not interpreted or rewritten. The format 11 cutoff removes the
ambiguous flat defense arrays without conversion; see [schema compatibility](../state-management.md#schema-compatibility).

### Native racial spells

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
Restoration evaluates rules at the current level. Within the same exact owner/context, an exact
selected suite survives; a sole mandatory suite can correspond to its previous mandatory suite.
Changed alternative suite identities require explicit reselection, including uniquely named suites.
Within corresponding suites, unique unchanged descriptor semantics match first. Remaining descriptors
correspond only when exactly one old and one new descriptor share eligibility level, native grant
kind, usage, daily limit and cantrip kind. Neither ordinal position nor uniqueness overrides a conflict.
This transient correspondence uses typed applied fields; structural IDs stay unchanged and never
supply missing rules. Current IDs and their inverse ownership are committed together.

Compatible casting abilities survive in the current options; a fixed ability applies immediately.
Current counts bound retained targets in order, and pools retain exact members. Filter selections,
including existing targets, reject available exact spell metadata conflicting with level/class rules.
Missing exact target metadata preserves an unchanged filter predicate, including count-only changes;
a changed predicate needs exact compatibility proof. Pool membership and native token kind remain
authoritative without the spell catalog. No special-profile kind rule is applied to native pools or
fixed grants. Removed choices never return merely because a count/pool expands or a source returns.

Direct edits use the same correspondence. A stale descriptor Clear cannot clear an unrelated new
descriptor; a removed descriptor is already retracted. Invalid new selections remain whole no-ops.
The store acknowledges active native corrections independently of the visible page, preserving dirty
drafts until Save and retaining the corrected snapshot through later absence. Inactive library entries
project current rules without bulk writes and correct when activated.
Independent class/special preparation and shared/Pact usage remain unchanged by racial transitions.
Available class and subclass data still derive current grants at the
character's level. Each unavailable exact class or selected subclass retains its own saved profile
even when another class resolves. This unavailable-class policy also applies to the Spells projection.
This fallback derives available subclass grants with their explicit spell source qualifiers, including
new level grants, so a competing printing cannot replace the requested spell. The shared spell-token
adapter always preserves the printing, with the upstream PHB default for an omitted or blank source.
The same fallback uses spell-reference identity for class grant merging and preparation. Action
aggregation always uses resolved spell-reference identity, including after exact race data returns.
A newly granted printing cannot prepare or hide an independently saved printing.
Source-less manual facts remain separate from qualified grants and never borrow catalog rules.
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
When exact loaded ability rules change, the shared ability refresh replaces only the selected
parent/child ability relation. An unchanged owner layout retains its slots. Changed layouts retain
unique matches by normalized pool membership, count and amount, then compatible selections from a
sole remaining old/new block within that owner. Ambiguous matches start empty; owner ordinals do not
identify blocks across a refresh. Rejected or out-of-count choices are discarded, so restoration
cannot resurrect them. Fixed bonuses follow the current parsed rules without resetting unchanged
choice blocks. Missing either exact context member freezes the complete saved ability snapshot.
Calculation, Sources, readiness and PDF project that same refreshed relation. The character store
acknowledges active-character corrections independently of page navigation; dirty drafts retain the
correction until explicit Save. Builder choice edits reconcile current rules and intentional slots
in one command. Repeating coherent refresh preserves references, timestamps and save state.
Opening the race page or refreshing its catalog does not clear or substitute a saved child.
Saved selection details resolve the exact current reference even when catalog filters hide it;
new race and child options remain restricted to the filtered catalog. Child option values retain
the separate complete name and source, without interpreting a joined label as an identity.
Nested child resolution compares both complete fields with case and surrounding whitespace
normalized; a different printing, truncated name or absent source cannot supply that child.
Explicit race selection chooses its initial child; explicit child selection owns later changes.
