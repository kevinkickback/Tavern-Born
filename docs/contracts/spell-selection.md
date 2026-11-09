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

## Selected feature cantrips

`feature-cantrip` keeps the actual choice and declaring feature block/descriptor identity. The
current earned source determines its targets, ability and count. Qualification starts from
independently available spells and abilities so no feature can enable itself or a cycle. Each
entitlement owns its grant separately, even if both pick the same exact spell.

## Existing daily preparation

Daily `preparedSpells` keeps exact intent on the earned owner. The current certified progression
or formula supplies its cap and minimum. Each active spell needs a current target, accessible
level and list route. Optional list access is evaluated per owner. Loss of a target, source or
route suspends only its contribution. Reduced capacity reports over-limit intent without deleting
or reordering it. Exact withdrawal works offline and keeps other owners. Learning, daily
preparation and rest events are separate.

## Shared effective view

One effective character supplies current spell profiles and matching provenance for Actions,
prerequisites, readiness, Review and PDF. Racial casting uses its own active owner and ability.
Generic Bonus and native edits cannot create managed class rows. PDF receives the current
filtered authority separately from retained descriptions. [Consumer tests](../../tests/lib/managedClassSpellConsumers.test.ts)
