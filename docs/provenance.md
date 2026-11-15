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

Ordinary and bonus setup require an explicit collection and exact feat printing. A printing can
have one record per collection. Fixed, class and racial/background choice owners remain separate.
Configured choice records require one exact saved printing. A name-only unconfigured choice
may be retained or removed, and must be reselected before setup.

Finish resolves new choices before changing the draft. It replaces the addressed owner's setup
and retracts old benefits from saved state rather than a dialog snapshot. Clear leaves an empty
configured record and can run offline. Removal retracts that owner only. Fixed setup remains until
its last matching grant disappears. Distinct printings and independent grants survive.
[Owner tests](../tests/lib/featSetupOwners.test.ts) · [Lifecycle tests](../tests/unit/featSetupLifecycle.test.ts)

Strict admission checks exact saved options and tags in both directions. Reject duplicate choices,
orphan benefits and invalid spell UIDs. Revised class feat slots use prerequisites at the earned
gain, including total character level there. Incomplete history requires review when it cannot
prove eligibility. Existing exact picks stay recoverable.

Skilled and Skill Expert exclude already proficient or expert new picks where applicable.
An exact owner's prior selection remains editable through overlap. Expertise and proficiency have
separate ownership, and removing proficiency expires the corresponding expertise.

Special spells use the exact target printing and retain the granting feat separately. Special
owners of one target share its current spell kind. Exact metadata can reclassify it atomically
without losing locks, manual intent or independent class/racial profiles. Clear uses saved
ownership even when rules are missing. Bulk writes preserve fixed targets without manufacturing
manual owners. Unqualified manual values remain separate from catalog printings.

## Origin ability scores

2014 racial owners supply origin abilities and racial choices. 2024 backgrounds own origin
abilities and origin feat grants. Allocated base scores stay separate. Exact race/subrace
abilities use bounded choices with source-qualified owner and block ordinal. Current sources
validate new picks. Missing exact metadata preserves saved bonuses and disables new edits.
Refreshing rules reconciles valid selections and replaces only the affected ownership.

Complete versions own their entire mechanics and suppress parent mechanics. Switching to or
from a version rebuilds both owners together. An ordinary child change preserves unrelated
parent choices. Changing only ability distribution preserves nonability setup.

### Racial defenses

`racialDefenses` binds the exact selected context to fixed grants and actual field owners.
Inherited fields belong to the parent. Child replacements and explicit removals apply per
field, and a complete version owns its own fields. Missing either exact record preserves the
snapshot. Exact restoration reconciles it with current rules. Creation and edits save the
selection and snapshot together. Manual, feat and equipment effects retain separate ownership.

2014 PHB Dragonborn requires a current catalog-backed ancestry. The creator requires it to
finish. Builder readiness reports missing ancestry instead of inferring one.

### Native racial spells

Use one profile per granting parent or child, scoped to the complete selected context.
The save retains suite, ability, target choices and the applied snapshot. The current catalog
supplies schedule and eligibility. Complete versions suppress parent blocks. A missing exact
context keeps the snapshot. Restore at current level. Keep compatible exact targets and casting
ability through unambiguous correspondence. A changed alternative suite needs explicit
reselection. Ambiguity keeps setup recoverable.

Clear uses the saved descriptor's membership and never removes another owner or printing.
New targets require current exact metadata and eligibility. Race, level and spell edits
reconcile materialization and provenance atomically. Read-only views do not write inactive
library records. The active store handles durable corrections through its acknowledged queue.
Class/special preparation and shared/Pact usage stay independent.
[Native spell command tests](../tests/unit/raceSpellProfileCommand.test.ts)

## Class ownership

Class benefits belong to the exact class or subclass, earned gain and choice that grants them.
Current source declarations determine requirements, pools and fixed benefits. Keep the actual
selected owner separate from the referenced target, including when a subclass uses another
printing's feature or a caster uses another class's spell list.

### Class features and choices at their earning levels

Each required choice belongs at its earned class level. Incremental gains preserve earlier
allocations. Initial, nonrepeatable subclass choices may share a setup flow. Later or replaceable
gains keep separate slots. Confirming a new subclass can open missing setup. Refresh and
reselecting an already configured subclass do not. Cancel retains the subclass and its
outstanding choices. A change in character, owner, level, variant, or catalog ends the
pending sequence. Source loss suspends only affected benefits and retains recoverable
intent. Clear, owner replacement and level rollback remove only their grants. A retained
description cannot prove eligibility. [Class choice tests](../tests/unit/classChoiceCommands.test.ts)

The supported Rogue subclass passives use each selected class printing's exact earned
declarations. Identical active numeric contributions from the same printed rule count once
per target. Each owner retains its own effect ID for suppression and its own limited-use counters.

[Mystic psionic setup](#mystic-psionic-setup) has its own source and ownership limits.

### Individual optional class features

The Rules toggle permits adoption. An adoption requires an explicit choice and saves the actual
owner, exact target and earned gain. Book-backed pools use `book-section|source|id` targets. They
extend the existing pool without additional slots. Optional spell-list routes give access to exact
printings. They do not learn or prepare spells, raise limits, or replace independent routes.

An unavailable adopted replacement reserves its family while permission is on and offers Restore
or Clear. Turning permission off restores eligible originals and retains adoption and setup.
Clearing an adoption keeps dormant setup. Intentional loss of the owner or earned root removes
its setup. New adoption and new picks require current source authority.

Managed prerequisites start with independent providers and then admit qualifying current
contributions. A choice cannot qualify itself or bootstrap a cycle. An established ineligible
choice stays saved and inactive. Picker, commands, readiness, Actions and PDF use the same activity
projection. [Prerequisite eligibility](data-ingestion.md#prerequisite-eligibility)

### Automatic feature actions

Actions and PDF use one projection. Groups derive their IDs from the actual owner, complete
feature family and a canonical parsed-entry signature. Identical repeated gains within one family
share an action. Different owners, printings or rule bodies stay distinct. Array order and nested
qualified references matter. Exact manual overrides and PDF selections use the same stable IDs.

Qualified choice actions require the authoritative filtered target catalog and full subclass owner
index. An explicitly empty catalog stays empty. An exact target may belong to an unselected class.
Unavailable rules suspend the derived action without erasing its saved intent or manual override.
Standalone player-authored features and actions keep their own IDs. Unique descriptive enrichment
cannot make a standalone row an earned action. [Action lifecycle tests](../tests/lib/classChoiceActionLifecycle.test.ts)

## Mystic psionic setup

### Current source authority

`psionics.json` is an external capability. Revalidate a source to add it to the inventory.
Losing an inventoried file fails refresh. Missing individual rules retain recoverable intent. Use
exact name/source identity and current type/order metadata. Duplicates or changed certified
declarations suspend authority. An empty filtered catalog stays empty. Current class tables
supply counts and earned levels. Base disciplines can come from any order. Bonus disciplines
must match their granting order when first learned. Soul Knife has no bonus pool.

### Saved choices and ownership

Shared Class choices retain actual owner, declaration, pool, exact target and earned slot.
Strict admission checks any materialized Feature and tag together. Rules and activity stay
derived. A missing or conflicting target or slot retains inactive intent, with no automatic
reassignment or winner. Restore recomputes the benefit. Clear and level or owner removal remove
only their allocations. [Psionic setup tests](../tests/lib/psionicSetup.test.ts)

At a later Mystic level gain, the Level Up dialog can replace one previously known
discipline with a different available discipline from any order. This applies to a
discipline from the ordinary or bonus pool. A newly earned choice uses its own slot.
The replacement is saved with the recorded Mystic gain and preserves the original
allocation for rollback. An unavailable replacement withholds the current benefit until
the exact source returns. Dropping the level restores the prior choice. Removing the
granting allocation or changing its order retires dependent replacements.

### Consumers and limits

The effective projection supplies readiness, actions, descriptions and PDF. Intelligence and
the existing Psi Points calculation apply. Learning supplies rules text and setup only. Focus,
psi spending and concentration remain manual.

## Equipment ownership

Starting packages and inventory grants are covered in [Equipment](equipment.md#proficiencies-and-equipment).

## Verification

Test pure commands for initial, replacement/removal and overlapping owners, including manual grants
and exact source collisions. Assert materialization and ledger together. Hook tests protect adapter
or cross-domain boundaries, never unsupported separate ledger writes. Every grant needs an
explainable owner; ambiguous parser input remains diagnostic.
