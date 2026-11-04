# Class ownership and automatic feature actions

Read this reference only when changing this contract. Start with the [topic index](../README.md).

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

Mystic talent, discipline and order-bonus selections use the same Class-choice ownership and
current-benefit projection. Their distinct catalog, saved relation and setup limits are described
in [psionic setup](psionic-selection.md).

Legacy College of Swords and Way of the Kensei setup retain their declaring XGE subclass owner
and exact PHB targets under either PHB or XPHB parents. Their qualified dependency catalogs are
limited to these Class choices; they do not enable PHB sources, ordinary inventory options or
conversion to revised feats. Swords uses its explicit two-option Fighting Style list and one quota.

Kensei uses separate initial melee/ranged weapon-type choices, later distinct weapon choices and
the declared tools choice. Canonical PHB M/R weapon types share the source filter and explicit
longbow exception; staff focus records do not create additional types beside Quarterstaff.
Saved item references and earned slots identify intent. A finite relation validates those fields
and their proficiency provenance; current exact owner/path/target authority activates weapon/tool
proficiencies in the shared foundation before Expertise. Clear, source loss and owner/gain removal
retract only this provider. Independent providers survive; valid missing-source intent remains
recoverable. These choices add no inventory or Weapon Mastery and do not automate attack effects
or gameplay replacement events. Changed or conflicting unqualified prose remains diagnostic.

### Fighter and Champion Fighting Styles

The base and additional Fighting Style slots share an edition-specific pool. The picker and
confirmation validate the current source-qualified options against the other earned slot.
An older duplicate remains editable. The base slot supplies the effective style, and clearing
or changing it lets the additional slot supply its retained style when eligible. Readiness,
saved details, legacy feature effects and revised feat effects use the effective slot.
Revised configured feat options, including spells, follow their exact slot owner. Mixed-edition
style equivalence and styles from other classes use their existing rules.

### Revised Hunter choices

The XPHB Hunter chooses one initial option for Hunter's Prey at level 3 and one for
Defensive Tactics at level 7. The shared picker reads the named alternatives from
each current source group. The saved reference keeps the exact parent feature,
earned gain and selected option. Current character details and PDF use that choice.
Source loss keeps the selection available for recovery. Losing the gain removes it.
Rest-triggered replacements remain a gameplay rule outside initial setup.

### Beast Master companion recovery

A companion needs its current earned feature declaration and the exact eligible creature
printing. Missing rules preserve the saved pick for recovery and withhold the companion
from sheet export. The Builder keeps the normal replacement picker while the feature is
available and offers removal of the saved choice if the feature is unavailable.
An unavailable Tasha's adoption keeps its existing recovery prompt and reserves the
replaced classic feature until the adoption is restored or cleared.

The verified PHB Ranger's Companion declaration adds the character's proficiency
bonus to armor class, attack and damage rolls, and the creature's proficient skills
and saves. Its maximum HP is the greater of the creature's normal maximum and four
times the owning Ranger level. Both companion PDF layouts use the same projected
stats. Fixed damage and save DCs retain their published values. The Tasha's and
revised Primal Companion forms keep their source-defined formulas.

### Weapon Mastery

The current class, its unambiguous declaring feature, and the filtered base-weapon catalog govern
mastery selection, completion and attack notes. The shared proficiency matcher recognizes the
revised Rogue's Light-or-Finesse martial grant and the Monk's Light martial grant. Class-owned
fixed proficiencies are checked against the current primary or multiclass declaration. Qualified
martial grants also require the matching structured filter. Independent and unattributed weapon
proficiencies retain their saved values.

Previously saved unavailable item picks remain editable and confer no mastery while ineligible.
Duplicate saved rows suspend the choice until it is confirmed again or cleared.
The revised arcane Staff and druidic Wooden Staff use the Quarterstaff mastery selection when
wielded. They have no separate mastery slots. This relation follows the [SRD equipment tables](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf#page=96)
and applies when these exact revised focus printings are in the filtered catalog.

### Individual optional class features

The Rules setting permits optional choices; it never selects them. Class records individual
`optionalClassFeatureAdoptions` by actual owner, complete target and earned gain. Missing records
mean unselected, even when an older character enabled the setting or retained feature setup.
Source candidates are separate from actor activity. Current source/owner/level proof is required
for a new adoption; a saved active flag, matching label or raw recovery description cannot supply it.

The Ranger PHB adapter treats Deft Explorer1 and Favored Foe1 as independent exclusive families,
and Spellcasting Focus2 as an addition. Deft Explorer's gain6/10 children require their own earned
level/current source, without another adoption or quota. The combined standard gain6 node retains
its terrain and enemy/language paragraphs independently; Foe Slayer20 stays compatible. Revised
standard Ranger and independently declaring owners keep their own rules.

TCE Fighting Style Options for PHB Fighter/Paladin/Ranger and PHB Warlock's Pact Boon/Invocation
options use real `book-section|tce|<id>` targets. Their current book section, ordinary granting
declaration/progression and explicit adoption extend the existing pool without extra slots. Stable
choice IDs identify these routes; display labels do not authorize them. Missing/duplicate current
members suspend only their own option. Saved unavailable picks retain their occupied slots and
recovery details, while their managed benefits/provenance, Actions, prerequisites and PDF suspend.
Standard options, independent providers and manual rows keep their own authority.

The eight TCE Additional Spells sections for PHB classes use the same Class addition controls and
exact book-section adoptions. Current section descriptors supply their actual owner, root level and
source-qualified members. An active adoption permits only matching current spell-list routes; it never learns,
prepares or grants every listed spell, increases quota or bypasses an owner's spell-level access.
Numeric learning, Wizard spellbook preparation and existing daily preparation keep their own
selection contracts. Independent base, subclass, native and explicit list-bypass paths survive
loss of an optional path. Clear/OFF/source loss retains saved spell setup for current re-evaluation
and recovery; intentional owner loss still performs exact cleanup. New Class adoption rejects
captured source authority after a catalog or source-settings change, while Clear stays source-free.
Ordinary Warlock known slots do not gain access to the section's Arcanum-level spells. Separate
[Arcanum setup](spell-selection.md#mystic-arcanum-setup) enforces each exact gained level; gameplay
replacement events remain separate.

PHB Ranger's adopted TCE Primal Awareness derives fixed known-spell grants from its current
certified level table. A narrow adapter is necessary because this declaration has no structured
`additionalSpells`; its complete source certificate verifies the table and meaning before use.
The shared spell-token parser supplies the upstream PHB default only for omitted printings.
Earned grants join the parent Ranger profile and feature-qualified provenance without ordinary
known-spell quota or a new saved choice. Earlier independent numeric ownership remains active,
including a choice made at the same gain before adoption; new redundant choices at an already
granted gain are rejected. Clear/OFF/source loss retracts only the optional grants, and restoration
derives them again. An unavailable exact earned spell produces a readiness recovery duty rather
than falling back to another printing. Separate free-cast resources and rest tracking are not implemented.

Structured pool prerequisites use a finite projection seeded from independent providers, then
current qualified choice contributions. Saved managed rows cannot satisfy their own requirements
or bootstrap a cycle. New/retargeted command picks must qualify in the complete proposed set;
established unmet intent stays occupied and inactive. The same result supplies derived rows/tags,
details, readiness, Actions, Review and PDF. Exact source/provider restoration rebuilds missing
active contributions without another write, preserving existing same-ID metadata. Pure prerequisite
rules and snapshot construction are separate from the public effective-character wrapper.
This static boundary does not infer acquisition/rest events or authorize historical replacements.

PHB Barbarian's adopted TCE Primal Knowledge uses one root at level 3 and separate skill choices
earned at levels 3 and 10. Each grants one currently nonproficient skill from the source's initial
Barbarian pool; the gains cannot choose the same skill. These are skill proficiencies, with no
historical proficiency question or automatic Expertise. Class links to the shared Proficiencies
controls with the exact gain in focus; multiple independent gains use a source chooser. Equivalent
skill vocabulary printings represent one semantic skill and never create duplicate source actions.
Saved setup survives permission/adoption suspension and missing source rules; intentional loss of
the owner or earned gain removes only its setup. Current source-certified skills enter the shared
foundation before dependent Expertise, whose saved intent remains dormant when its last underlying
proficiency disappears. Independent proficiency providers preserve that qualification.

While permission is ON, an adopted unavailable replacement reserves its original family and
creates one exact root recovery duty. Neither side supplies benefits until restored or cleared.
OFF restores eligible originals while retaining adoption/setup; ON rechecks only explicit prior
adoptions. Clear addresses the latest exact family and retains dormant setup. Intentional class,
subclass or unearned-root removal cleans its intent atomically; source filtering never deletes it.

The shared activity view gates setup and proficiency projection before grants, current commands,
Class/details/readiness, prerequisites, Actions, Review and PDF. Adopted passive declarations and
earned children are derived for Review and full/names-only PDF summaries without saved Feature
mirrors. Detail/highlight identity includes owner, target/choice, option and gain. Independent stored
features/actions retain their own identity; source/name-wide filtering cannot remove them. Generic
unsupported prerequisite conditions remain unsupported. Adoption does not certify unrelated runtime
movement, resources, combat, companion scaling or complete class progression mechanics.

Inspection never adopts a feature: only an explicit adoption action commits it. Focus alone cannot
select a replacement. Details require the exact current offered owner, target and earned level.
Displayed grouping uses complete declared identities; matching names cannot move setup across owners
or families. The subclass parent's setup completeness survives grouping.

Normalized setup uses its actual owner type to decode the declaring feature UID, including legacy
subclass filter rows carrying a class-reference field prefix. Recognized malformed declarations or
explicit name/source/gain conflicts cannot fall back to a generic earned choice. Copied feature
parents remain distinct from the actual selected owner. Moving configuration controls into tabs
preserves the subclass parent's complete setup status.

### Automatic feature actions

Actions and PDF use one pure projection. Class/subclass references retain the complete encoded
feature UID and the actual selected owner, including the full selected subclass name and printing.
UID source defaults, casing and display aliases identify
one feature; subclass UIDs use their separate field order. A positive integer encoded gain level
is authoritative; malformed nonempty UIDs never borrow materialized metadata. Rows without a UID
require valid materialized levels and complete feature ownership. Absent reference fields retain
the materialized target's identity fields; explicit reference values remain authoritative.

Distinct owners, printings and different gain-level rules remain separate. Repeated gains share
one action only when their parsed entries are structurally identical within the same owner/feature
family. Object field order is immaterial; array order, all field values and embedded qualified
targets remain significant even when rendered text matches.
Passive references do not consume an action identity. Standalone saved feature rows permanently
retain their own IDs. Unique catalog enrichment may supply their text, but cannot establish an owner,
replace their ID or suppress an independently earned action.

Action group IDs encode the actual owner, canonical target family/printing and a SHA-256 signature
of canonicalized parsed entries. Only the gain level is excluded from the family. No available
member supplies the group's identity, so an earlier identical gain returning cannot change it.
Its ID remains stable through UID enrichment, canonical spelling refresh and owner competition. Manual overrides
and PDF selections match the exact current ID. Different manual IDs remain independent player rows.
An unavailable or ineligible source leaves its manual action explicit; restoring the same target
reunites it by exact ID, and removing an override reveals the still-earned action.

Class-choice normalization, option views and persistence retain the full feature UID. Choices resolve
only that complete target; a matching label cannot supply another owner, gain or printing. An omitted
or empty duplicate source uses the source encoded or defaulted by the UID; an explicit conflicting
source rejects resolution. Materialized features retain that source so new selections remain saveable.
Feature IDs use actual owner plus exact target, independent of the granting choice's order or ID.
Removing one choice retains the same feature when another choice of that owner still grants it.
Different owners retain separate materialized rows and action groups.
Subclass-owned choices and readiness resolve within the full selected subclass, so a shared short name cannot
supply another owner's rules. Missing-content indicators and retained choice details use the same
complete target identity; a class choice may explicitly target another class's feature.
Composed subclass catalogs retain complete owner indexes. Repeated catalog copies within one
owner do not make a target ambiguous. A class-owned subclass target requires one exact owner;
competing owners leave the option unresolved in the picker, readiness, details and action projection.
Actions and PDF receive the complete target catalog separately from selected classes: an explicit
target may belong to an unselected class, whose unrelated features are not thereby earned.
Production choice targets use the same filtered catalog as picker/readiness; unavailable competing
owners cannot suppress a resolved choice. One explicit feature-choice bundle contains the authoritative
filtered class-feature catalog and complete subclass owner index; missing or empty inputs cannot be
replenished from selected classes, embedded class references or raw dictionaries. Picker, readiness,
availability, retained-details availability, Actions and PDF share its builder and exact resolver.
Standalone custom features use their saved descriptions; a matching catalog name cannot replace
that prose or establish ownership. Raw lookups supply separately labelled source-unavailable
retained details. Filtering uses the encoded or canonical current target printing, including upstream
blank-source defaults, independently of the actual enclosing or granting owner.

Qualified choice actions require the exact target's parsed rules. Missing or incomplete targets
remain saved intents without emitting or enriching an opaque action. Their materialized feature rows
are excluded from standalone action projection. Exact manual overrides remain explicit during
absence, and stored PDF preferences can select the same group when unchanged rules return.
No action/rules snapshot or derived mirror is added to the saved character.

Version 1.0 does not support earlier action-ID forms. No raw-UID/name-source compatibility aliases,
opaque saved-row handoff aliases, historical ownership inference or character conversion are added.
Wholly stale PDF selections follow the usual automatic fallback. Upstream UID defaults and complete
materialized current feature metadata still determine canonical data identity; they are not saved
character compatibility adapters.

Class-page numeric spell choices use addressed pure commands and one atomic Finish. The actual
class/subclass owner, casting declaration, earned level and ordinal determine ownership; profile
order and old tags cannot infer it. `useSpellProvenanceMutations` exposes `finishClassSpellChoices`.
Spells-page learned Prepare/Clear uses that same actor; generic Add/Set/Remove edits Bonus only.
Daily preparation and native racial setup keep their separate validated commands. Every adapter reads
the latest saved character and ledger, preserving unrelated intent; see [spell selection](spell-selection.md).

The bonus picker blocks spell targets already known through any profile. Existing overlapping
owners remain independent when later class or origin changes grant an already selected bonus spell.
Bonus spell selection records manual ownership with the selected spell printing. Replacing the
bonus list retracts only its removed manual targets. Removing a bonus copy preserves racial,
class and feat ownership of the same target, including independently prepared class spells.
Qualified removals never assign an unknown-source grant to the requested printing.
