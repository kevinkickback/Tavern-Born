# Spell selection and casting displays

New class spell choices use exact current targets through the owner's declared lists or exact expanded
routes. Ignoring class restrictions bypasses list membership only. Level, school, quotas and
known-spell locks still apply. Native racial pools remain hard limits. Bonus selection blocks
already-known logical names across all profiles, including unprepared spells. Existing
independent owners remain valid.

## Numeric class choices

`managedClassSpellChoices` addresses each slot by actual owner, domain, exact casting declaration,
earned class level and ordinal. The current certified declaration supplies capacity, school and
list limits. A multiclass pool cannot increase one owner's acquisition limit. Pact slots stay
separate. A sole earned shared caster uses its own slot table. A fixed grant already earned
at that gain blocks a new redundant ordinary pick without consuming its slot. Earlier
independent picks can overlap a later grant.

Finish validates the whole proposed edit against current rules and atomically saves intent and
materialization. Retain exact unavailable picks and their revisions for recovery. A missing
declaration cannot supply new capacity. Class, Spells, readiness and PDF use the same current
casting projection. [Managed spell command tests](../../tests/lib/managedClassSpellCommands.test.ts)

The loader discovers a class copy's eligible casting rules from its declared parent, exact
feature roots and unchanged casting fields. The selected copy supplies its own spell routes.
Other class fields, such as equipment and proficiencies, have separate authority. A renamed
or replaced root has to be verified on its own. A plain class copy can replace its direct
Spellcasting feature at the same gain with an exact feature under its own class identity.
The app verifies the parent's certified progression and compares the replacement's rules.
An equivalent focus-equipment clause may change. The selected class's exact spell routes
still determine the list. Conflicting roots and changed casting mechanics are unsupported
by this equivalence rule. [Pinned 5etools class-route handling](https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js#L7841)

Saved replacement choices retain both the actual declaration and the certified template.
The template bounds what can be reopened offline. Current casting still requires the
class, declaration, template and their sources. Daily preparation uses the existing
loadout editor and does not simulate the act of replacing spells on a rest.

## Mystic Arcanum setup

Arcanum uses an independent `class-arcanum` domain. Each earned slot chooses its exact spell level.
Additional Spells adoption can supply eligible routes for that level. Arcanum has no preparation
toggle or saved usage counter and does not enlarge ordinary Warlock known slots.

## Specialist choices and fixed grants

The current source sets both earned timing and selection semantics. Savant and other spellbook
gains, Magical Secrets, inherited spell schedules, and subclass lists use their source-qualified
declarations. Distinguish a list addition, learned spell, always-prepared grant and cast-only rule.
A cast-only or at-will Invocation does not add a Pact slot or automatically satisfy prerequisites.
An Invocation targeting an existing cantrip checks that independent current target and retains
recoverable intent if it disappears. Full PDF sheets include supported casting terms.
When a copied class inherits the revised Eldritch Invocations progression, its own class level,
learned cantrips, and selected Pact govern eligibility. Its supported options still require the
current source-qualified Invocation declarations. The copy keeps its own saved choices and spell
profile. Earlier untargeted choices can be assigned a target without changing their earned slot.

A declared class-level prerequisite follows that same owner. A qualified Invocation prerequisite
checks the provider in the same pool, including the proposed choices in the editor. One direct
provider with no prerequisite or a class-level requirement can qualify a dependent.

An exact innate spell schedule can supply a fixed Invocation cast when the feature text confirms
its terms. A Magic Action cast may accompany a fixed learned spell. A Long Rest cast remains a
separate casting route, including when the character independently knows the same spell. These
grants leave the ordinary known-spell quota and casting components in place.

A learned familiar spell can use the published ritual schedule when its feature expressly
provides the alternate slot-free Magic Action. Both routes keep their exact owning Invocations.
A declared spellbook can supply a separate cantrip group and a first-level ritual group.
The qualified choice excludes independently prepared spells when choosing, preserves other
providers on removal, and displays the book's possession requirement.

A resource-paid subclass schedule can grant casts independently of a named prepared spell column
when every column declares the same costs and the earned feature text confirms the spell, cost,
and casting terms. An uncounted list of authorized uses does not create a build choice. An
independent prepared grant remains available through its ordinary casting route. Players adjust
the resource counter manually, and a Long Rest restores it when specified by the feature.

A one-use slot-free class grant needs a current direct feature, the revised Long Rest rule
reference, and a matching source-qualified prepared schedule. The exact spell entry supplies
its rank. The grant sits outside ordinary preparation capacity. Spells, Actions and full PDF
sheets identify the class that owns each use. Independent daily preparation remains saved if it
overlaps.

## Selected feature cantrips

`feature-cantrip` keeps the actual choice and declaring feature block/descriptor identity. The
current earned source determines its targets, ability and count. Qualification starts from
independently available spells and abilities so no feature can enable itself or a cycle. Each
entitlement owns its grant separately, even if both pick the same exact spell.

Explicitly linked style feats share the granting feature's filtered choice quota. When the
feat supplies its own cantrip list and the casting ability matches, the selected class owns
those choices. The feat's listed spell pool determines eligibility.

## Existing daily preparation

Daily `preparedSpells` keeps exact intent on the earned owner. The current certified progression
or formula supplies its cap and minimum. Each active spell needs a current target, accessible
level and list route. Optional list access is evaluated per owner. Loss of a target, source or
route suspends only its contribution. Reduced capacity reports over-limit intent without deleting
or reordering it. Exact withdrawal works offline and keeps other owners. Learning, daily
preparation and rest events are separate.

A catalog-discovered copy stores the exact daily declaration alongside prepared intent so a
reopen can retain it while the source is unavailable. Existing daily profiles keep their
previous identity. An address stored on the character only preserves intent. The catalog must
verify it again before a preparation has an effect.

## Shared effective view

One effective character supplies current spell profiles and matching provenance for Actions,
prerequisites, readiness, Review and PDF. Racial casting uses its own active owner and ability.
Generic Bonus and native edits cannot create managed class rows. PDF receives the current
filtered authority separately from retained descriptions. [Consumer tests](../../tests/lib/managedClassSpellConsumers.test.ts)
