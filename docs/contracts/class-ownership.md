# Class ownership and automatic feature actions

Read this reference only when changing this contract. Start with the [topic index](../README.md).

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

Revised Cleric Divine Order and revised Druid Primal Order use existing
level-1 class-feature choices. The current direct XPHB declaration and its
exact selected option establish benefit authority. A shared source adapter
verifies the tagged prose in the bundled and configured sources before
applying grants. Protector and Warden supply martial weapon proficiency and
heavy or medium armor training, respectively, through the shared fixed
proficiency projection. Thaumaturge and Magician add the current Wisdom
modifier (minimum +1) to Intelligence checks for Arcana and for Religion
or Nature, respectively. Removing a choice or losing its source removes
that provider's effects. Independent providers survive.

Classic PHB Life Domain grants heavy armor training at level 1 through
the same fixed proficiency projection. The selected PHB Cleric and PHB
Life Domain must supply a current, certified path from the domain intro
to Bonus Proficiency. Bundled and configured data have separate complete
certificates. Training is suspended when that path is unavailable and
restored with the source. Independent armor training keeps its own owner.

Both Druid editions derive Druidic at class level 1 from the current certified
direct feature and its exact language printing. Revised Druidic also grants
always-prepared Speak with Animals when the feature, the level-1 spell schedule,
and the current spell printing agree. It uses the existing class spell projection
outside the daily preparation quota. The schedule's later Find Familiar entry
belongs to Wild Companion's conditional casting. Losing a provider retracts
its benefit while independent language and spell owners survive.

Revised Cleric Blessed Strikes is one required Class choice at level 7.
The exact XPHB declaration uses qualified feature references with a
choose-one clause in prose. The chosen branch is active only while its
source is available, and Improved Blessed Strikes adds only the matching
branch at the verified level-14 gain. Character details and PDF include
the rules for player adjudication. Classic subclass features retain their
own authority.

Revised Druid Elemental Fury uses the structured level-7 class-feature choice.
The selected option supplies its current rules to Class details, the character
sheet and PDF. The separate level-15 declaration adds only the named improvement
matching that selection. Losing the improvement source or dropping below level
15 preserves the base choice. If the base source is unavailable, the saved choice
is retained for restoration or removal.

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

### Fighter subclass gains

Arcane Shot and Rune Carver take their earned slot counts from the current progression.
Revised Arcane Shot and Battle Master use their source filters. Rune Carver reads the qualified option references
in its producer. Additional slots are editable from their earning accordions, and saved choices
keep their original levels. The source records replacement opportunities for reference during play.

Cavalier and Samurai share one quota between the listed skills and an eligible language.
Saved picks and grants carry the chosen domain. Samurai's later saving throw and revised Arcane
Archer's individual skill alternatives record the proficiency present at acquisition. Current
Fighter starting skills determine revised Arcane Archer's replacement pool. Banneret derives its
language pool from both named books and its skills from the separate Well Spoken clause.

Current, earned source rules supply Fighter subclass resource counts, recovery, and passive
effects. The sheet prints actual earned archetype rules and keeps their source printing separate
from an inheriting class. Initiative triggers, combat exchanges, and rest events remain descriptive.

### Class features and choices at their earning levels

Later Class accordions show the selected subclass's active, source-qualified features. They
replace a generic subclass gain note when every declared feature at that level is available.
Feature choices keep their picker and link to the named rules in Details. The original subclass
selection and overview remain at the subclass selection level.

Additional Fighter Weapon Mastery and Warlock Invocation slots appear in the accordions that
grant them. Each row summarizes the picks saved to that level. Opening it uses the same full pool
editor as the original feature, with current prerequisites and quota. The existing confirmation
path preserves retained choices in their original slots and assigns new picks to open slots.

When qualifying a level 1–20 journey, compare each gain with the exact source printing and open
its Details from the earning accordion. At each choice gain, including increases in an existing
feature's quota, open the picker from that level, save the earned picks, and confirm that earlier
picks still appear in their original slots after reopening the character.

Use the shared parser when the external JSON declares a gain level, quota, pool, or
feature relationship. Qualify a new source entry with the same supported structure through
the applicable picker, save and reopen, and sheet export without adding its name to a registry.
An adapter for ambiguous or prose-only rules should identify the exact producer and supply
only the semantics the structured declaration leaves open.

When a progression declares both automatic and elective options, show the automatic feature at
its earned level and subtract it from the elective quota. Check level prerequisites against the
saved gain. A later class level cannot make a pick retroactively eligible in an earlier slot.
Classic Four Elements uses the source's required discipline and cumulative schedule this way.
When its option record and the parent declaration both specify a prerequisite, they must agree.

Ranger's Fey Wanderer skill and Drakewarden language use the existing proficiency workflow at
the current subclass gain. Iron Mind uses the same historical setup as other fixed proficiencies
with a fallback choice. A Drakewarden's current source supplies its fixed stat block and
later size and movement changes. Damage type is chosen when the drake is summoned. The
creator and sheet describe that rule and leave the choice to play.

Rogue can earn several independent fixed proficiency grants from the same class printing.
Each grant is checked against its own current feature and declaration. Mastermind uses the
gaming-set category for live item eligibility. Its quotas appear only in the prose, so the
source certificate checks the exact Master of Intrigue clause. Scion's deity choice reads
the current spell and resistance from the same source table row. The revised Rogue's
Cunning Strike and Devious Strikes use the same exact referenced rules in Class Details
and sheet output. Strike options are chosen when attacking.

Artificer item-plan gains read their quotas and eligible item tiers from the current progression
and item tables. Classic infusions use the structured class-level prerequisite at the original
selection slot. A Replicate Magic Item plan records the specific item it replicates. The same
infusion can grant distinct plans for distinct items. Armorer reads the first-gain Armor Model
options and Details from its printing. The sheet associates later Perfected Armor rules with the
saved model. Details also describe the rules for changing the armor in play and replacing an
existing infusion or plan on level-up. The creator records initial choices at their earning
levels. Artificer attunement limits and capstone effects use the earned, current class rules.

Reviewed Druid Circles print their current subclass rules at the levels that grant them.
The source proof keeps the selected Circle and its class edition separate from the printing
of a copied rule. Classic Circle of the Moon's forms print separately from base Wild Shape.

### Wizard traditions

Reviewed Wizard traditions print their exact earned subclass rules alongside Arcane Recovery.
Revised Enchanter earns one skill choice from Enchanting Conversationalist at level 3. Its
Intelligence bonus, with a minimum of +1, applies to checks for the chosen skill. The choice
and its effect use the exact current subclass declaration and earning level.

### Sorcerer origins

Divine Soul chooses its affinity at the classic level-1 or revised level-3 subclass gain. The
choice saves one exact origin and grants the affinity's bonus spell. Losing the gain retires the
choice. Losing the source suspends the spell and preserves the choice for recovery. Lunar phase is
chosen during play under Lunar Embodiment and Waxing and Waning, so Lunar Sorcery has no permanent
phase setup. Reviewed Sorcerer origin rules print at their earned levels, using the current
selected class edition and the rule's own printing.

Wind Speaker grants Primordial at the classic level-1 or revised level-3 Storm Sorcery gain.
The revised copy uses the exact revised Primordial reprint. Losing the source removes only this
language ownership. The four dialects are part of the Primordial rule.

### Paladin oath setup

Oath of the Noble Genies offers one of its four authored skills from Genie's Splendor at Paladin
level 3. The same current feature independently supplies an unarmored AC formula of 10 plus the
effective Dexterity and Charisma modifiers. An equipped shield still contributes normally. The
shared AC resolver chooses among applicable base formulas, then applies equipment bonuses and
manual adjustments. Worn body armor suspends the Genie's Splendor formula.

Classic Oathbreaker requires at least three Paladin levels and an evil alignment when selected.
The character's alignment is set in Characteristics.

### Warlock patron setup and resources

The Genie chooses its patron type at the classic level-1 or revised level-3 subclass gain. Vestige
Patron chooses its companion type and spell domain at revised level 3. These choices use the shared
subclass picker and preserve their exact owner, feature and gain in the saved character. If the
source becomes unavailable, the saved choices are available for recovery while their benefits
are suspended. Reviewed configured patron rules print at the levels they are earned, including
classic rules referenced by a revised subclass.

Revised Celestial Patron's Healing Light uses the manual Class Resources controls from Warlock
level 3. The pool is one plus Warlock level in d6s, the per-use cap is the effective Charisma
modifier with a minimum of one die, and a Long Rest restores the pool. Current dice and the cap
appear in the revised sheets. Source or gain loss hides the resource and keeps its saved count
for exact restoration.

### Revised Epic Boon advancement

The verified XPHB level-19 declaration grants one advancement. The configured
Epic Boon filter and the bundled prose use the same Class slot. The current
declaration and shared feat prerequisites govern the pick. The exact Ability
Score Improvement feat uses the capped ability increase picker in that slot.
The cap is applied to intrinsic scores before temporary effects.

A matching saved Epic Boon selection and its feat record count as one choice.
The Builder can configure it in place or replace it through the same slot.
Missing authority and conflicting selections preserve the saved records for
recovery and suspend their effects. Replacing, clearing, or losing the slot
retracts its own effects while preserving other sources.

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

Native PHB and XPHB Thirsting Blade require Warlock 5 and the exact Pact of the Blade selected
for that owner. Native XPHB Lifedrinker requires Warlock 9 and the same Pact. Eligibility uses
the current Warlock level and the earned slots for the entire selection. A revised draft may
select the Pact and its dependent together. Replacing an active revised Pact requires removing
its active dependents in the same edit. An unavailable source or unmet prerequisite suspends
the dependent rule while preserving the saved pick for recovery. Full sheets print the active
source rules and names-only sheets print their labels.

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

## Bard starting and college benefits

A starting Bard chooses three skills from the skill list and three instruments in both editions.
The Bard multiclass entry uses its own authored choices. Existing starting Bard saves recover the
missing skill choice from the current class data without changing existing skill ownership.

Both Lore printings offer three distinct additional skill proficiencies at level 3. Moon offers a
skill from its six named options, the fixed Druidic language and a separate Druid cantrip at level 3.
Valor and Swords grant their earned armor and weapon training. Revised Spirits grants Playing Cards
proficiency. Revised Dance uses Dexterity and Charisma for unarmored AC while wearing neither armor
nor a shield. Jack of All Trades contributes half proficiency to untrained skill checks from
Bard level 2. Classic non-skill checks use the rule text in Class Details and full sheets.

## Barbarian setup and passive benefits

Revised Primal Knowledge offers one of the six starting Barbarian skills at level 3.
Classic Zealot records its level-3 Divine Fury damage type. Revised Zealot chooses damage
when the effect occurs and displays its earned Warrior of the Gods healing dice and recovery.
Wild Heart records its level-6 Aspect. Owl extends darkvision, and Panther or Salmon uses
the current walking speed for the chosen movement type. The classic Bear Aspect doubles
carrying capacity. Giant Power grants Giant or offers an alternate language when an independent
source already supplies Giant. Removing or restoring either source recomputes the owned result.

Unarmored Defense uses Dexterity and Constitution and permits a shield. Fast Movement applies
while the character is free of heavy armor. Primal Champion increases intrinsic Strength and
Constitution by four, subject to the printing's cap, before equipment effects.

## Cleric domain gains

Classic domains start at level 1 and revised domains start at level 3. Retained classic domains
keep their exact authored dependencies, including the Plane Shift Knowledge features. Show separate
features at the gain level even when an introduction and a Channel Divinity option share a level.
Use the active optional replacement in Class Details and sheet exports.

Domain skill choices and fixed training use the earned source and the selected subclass.
At level 6, revised Knowledge's Unfettered Mind grants Intelligence saving throw proficiency
or one saving throw the character lacked. The acquisition choice preserves which branch applied,
and source withdrawal suspends the resulting benefit.
