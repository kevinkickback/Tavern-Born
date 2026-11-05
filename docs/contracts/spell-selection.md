# Spell selection and casting displays

Read this reference only when changing this contract. Start with the [topic index](../README.md).

Builder Review's spellcasting overview consumes both class and active racial casting details from
`useSpellSlots`. Display each actual owner's shared effect-aware ability, save DC and attack bonus,
including explicit unknown values. Class preparation limits and shared/Pact slots retain their
class-only APIs; unselected racial alternatives have no active casting summary.

Class spell selection and editing apply exact class/subclass membership and source-qualified
expanded references as the default visibility filter. The Ignore class restrictions switch can
bypass that filter; level, school, known-spell locks and quotas still apply. Expanded references
offer only their exact printing and do not grant it automatically. Native racial target pools
remain hard limits independent of that switch. Bonus spells block already-known logical names
across every profile and printing, including known unprepared spells; showing known spells does
not make them selectable.

## Numeric class choices

Format13 owns ordinary cantrips, known spells and Wizard spellbook entries through
`managedClassSpellChoices`. A slot is `[actualOwner, domain, exactDeclaration, earnedClassLevel, ordinal]`.
The finite casting registry and current source certificates determine supported gains, quantities,
levels, declared lists and school limits. An ability field or an unqualified class label supplies no
casting authority. Actual subclass ownership remains separate from its declared Wizard/Sorcerer list.
PHB Arcane Trickster gains two chosen cantrips in addition to its independent Mage Hand grant.

Subclass-owned slot tables determine that owner's gain-level access and a sole earned caster's
available slots. Non-casting classes and classes before their first Spellcasting gain do not force
the combined multiclass table. Multiple earned shared casters retain their combined slot calculation;
their larger pool never raises an individual owner's acquisition limit. Pact slots stay separate.

Spells, readiness and PDF casting numbers and slots share the current certified declaration and
table state. Retained raw class descriptions cannot restore missing casting authority.
Class name/source casing and surrounding spaces follow the shared
[reference identity contract](reference-resolution.md#identity-and-entity-resolution); verification
preserves current labels and saved owners while retaining every other source and table check.
An empty profile before its verified first casting gain does not add a spell page automatically; unavailable
sources or retained choices still keep recovery available, and an explicit blank-page choice wins.

Fixed spells already granted by the selected class/subclass at a gain cannot consume an ordinary slot.
An earlier valid choice may later overlap an independent fixed grant without losing either owner.
Fixed subclass tokens use the upstream PHB default only when their printing is omitted; explicit
printings stay exact. Current fixed profiles and provenance derive from the same earned provider.
Primal Awareness's fixed knowledge grants follow the same current-source projection; their
[optional feature ownership](class-ownership.md#individual-optional-class-features) preserves
established numeric choices while excluding new redundant selections. Fixed spell labels use
their actual class-feature or subclass provenance.

Revised Ranger Favored Enemy grants Hunter's Mark from the current level-1 class schedule
and exact feature declaration. It appears as always prepared and uses no ordinary
preparation slot. An independently saved daily choice remains available if the grant
disappears and the ordinary spell list still permits it.

Each record saves its exact target, revision, `default` or `ignore-class-list` policy, and optional
`prepare:true` for a learned spellbook entry. The explicit bypass changes only list eligibility;
current target/source, earned ownership, level, schools, fixed-at-gain exclusion and quota still apply.
Source-qualified class routes, exact selected subclass routes and current native race expansion are
independent paths. Native expansion requires the selected full parent/child context and suite, and
never learns the spell automatically. Raw retained dictionaries cannot restore missing current data.
Every supplied subclass identity field must agree with its current provider. Full-name metadata may
use that provider's exact short label where the upstream parser defaults it; a matching alias cannot
erase another conflicting field.

The Class dialog drafts all rows until Finish. Cancel writes nothing. Finish checks every original
occupied target/revision or empty-slot allocator watermark against one latest base, then commits once.
Changed choices allocate a new global revision. An earned slot requires one exact owner. Intentional
progression loss of any complete earned slot advances the watermark once, including empty slots;
restoring the owner/gain does not restore the old lifetime. Clear retains the watermark even when
no choices remain. No-op, failure, source refresh, reads and progression changes that lose no earned
slot allocate nothing. At the safe-integer
limit the watermark saturates: new allocations reject, while Clear and progression removal remain available.
An empty slot cannot be reused by an older dialog after Add/Clear. Unrelated edits remain intact.
Exact source-free Clear removes only the addressed owner and retains other class, fixed, racial,
feat and Bonus contributions. Learned Prepare edits the same admitted choice; an unlearned Wizard
spell cannot use daily preparation or a generic profile API to bypass learning.

Current projection strips saved numeric/fixed benefits before deriving current independent grants
and managed choices. Missing declaration, target, route or provider suspends benefit while retaining
the occupied intent, list policy, preparation request, revision and allocator. Exact restoration
reactivates it. Class/Spells recovery and readiness show dormant choices; they do not satisfy active
completion counts. No saved activity snapshot or old-file ownership inference is used.

## Mystic Arcanum setup

Certified Arcanum gains reuse the managed editor and saved relation in the separate `class-arcanum`
domain. The source-qualified parent's fixed-by-level map supplies each gain's count and exact spell
level. These choices add neither ordinary known/prepared quota nor high-level Pact slots. The picker
and command require the exact gained spell level even with Ignore class restrictions; that existing
numeric policy bypasses only list membership. Current optional spell-list routes retain their adoption
and exact source requirements.

The finite source registry still certifies the declaration's meaning. PHB gain declarations repeat
their casting clause; XPHB higher gains inherit it from their same-owner level-11 introduction. Those
higher choices require both current declarations. Missing or changed parent, declaration, introduction,
target or permitted route suspends benefits while retaining saved intent. Exact restoration rechecks
without allocating revisions. Clear and intentional gain/owner loss follow the existing exact inverse
and editor-lifetime protocol; old profile membership never becomes an Arcanum choice by inference.

Current active grants supply shared Spells, Actions and PDF annotations for once-per-long-rest casting
without expending a spell slot. Uses are not tracked. Independent casting paths retain their own rules.
This supports initial selection/correction; spent-use/reset accounting and level-up replacement events
remain separate. New source producers and unknown prose meanings still require reviewed certification.

## Wizard spellbook specialties

Spell Mastery and Signature Spells reuse the managed Class editor and revision allocator. A
specialty saves an exact reference to a currently learned spell in the same Wizard spellbook.
It supplies no learned membership or saved spell grant. The picker previews draft book edits
and Finish validates the complete proposed book against the latest catalog. Losing a learned
spell or the exact current feature suspends the specialty while keeping its selection. Removing
the class or earned level retires its slots, including empty ones.

Spell Mastery uses one level-1 and one level-2 spell. Classic requires current Wizard-list
eligibility and ordinary preparation before the free base-level cast. Revised requires a
one-action casting time and prepares the choices automatically. Signature Spells use two
distinct level-3 spells, with current Wizard-list eligibility for classic. Both printings prepare
these automatically and allow each base-level cast without a slot once per short or long rest.

Automatic specialty preparation is derived for Spells, Actions and PDF and uses no ordinary
preparation capacity. An independent preparation request stays saved and is reevaluated when
the specialty suspends or clears. A classic Spell Mastery note alone supplies no preparation.
The narrow feature authority validates the current linked prose-only declarations, while
spellbook membership, spell levels and casting times come from the active data. Rest simulation,
spent-use accounting and rules for replacing spells during play are outside this setup.

## Circle of the Land

The Class page saves one terrain for the exact Circle of the Land subclass on its
matching Druid printing. The named spell blocks supply the options and the
earned spell schedule. A missing choice leaves the terrain grants empty.
An unavailable source retains the saved choice for recovery. Removing the
subclass or its earned level removes the choice. Ordinary Druid spells and
independent preparations retain their own ownership.

The PHB Bonus Cantrip is a separate level-2 managed choice from the Druid list.
XPHB terrain choices are editable as part of the saved character loadout.
The rules preview and full PDF include the Long Rest rule. The sheet summary
also identifies the current Nature's Ward resistance and its Sanctuary
relationship at the appropriate levels.

The configured PHB Circle copy attached to an XPHB Druid has a different
ownership and gain path. The standard revised source filter hides it. If a
source configuration exposes that copy, the creator reports its terrain setup
as unsupported.

## Selected feature cantrips

Supported selected Class optional-feature and feat cantrips use the same atomic editor, revision
allocator and strict ownership relation in a separate `feature-cantrip` domain. Counts, filters and
ability come from the current shared additional-spell normalizer. They add no ordinary cantrip quota.
The first actor supports one fixed-ability block containing one direct `known._` cantrip choice;
mixed grants, suites and unknown syntax remain explicitly unsupported. Declared pools have no
class-list bypass. Current exact spell routes/printings and source permission remain mandatory.

Plain class filters follow the pinned upstream joined-filter policy: class sources must be standard,
and variant routes also require a present, standard defining source. Static SourceUtil/Parser source
metadata is adapted separately from feature semantics. Dynamic Brew/Prerelease plugin registries and
decorated requested class labels remain unsupported; route names retain upstream parenthesis handling.

TCE Blessed Warrior/Druidic Warrior and their XPHB Class feat alternatives attribute choices to the
actual Paladin/Ranger profile. Their source expresses that attribution and replacement timing only
in prose, so narrow source-qualified semantics attest the complete current prose and supported root
shape independently of structured count/filter/ability. A changed ability must agree with current
class casting; the feature cannot override the rest of its class profile. Unknown conditions, such
as Book of Shadows requirements, are not inferred from similar-looking spell-choice syntax.

The XPHB Fighting Style source explicitly offers a nested feat reference instead of its filtered
feat pick. A strict versioned source/shape adapter adds that exact current reference to the existing
single-choice pool. It neither broadens feat categories nor adds another quota. Changed or ambiguous
alternative relationships remain diagnostic; commands recheck the latest union before new selections.
The exact XPHB prose-only acquisition prerequisite is interpreted only in that current declared
Class context, with its complete prerequisite payload checked. The generic prerequisite reader
continues to reject unsupported conditions elsewhere. TCE options keep the existing guarded pool
checks, so supported structured prerequisites can change without an absence fingerprint.

Revised Cleric Thaumaturge and revised Druid Magician use the feature-cantrip
editor for the extra cantrip expressed by their respective order's prose.
Each uses the current revised list for its own class and shares cantrip
uniqueness with that owner's ordinary selections. Each slot belongs to the
exact selected class-feature reference and has its own saved address and
revision.

Choice addresses remain stable while supported count/filter/ability values change. Current target
eligibility is reevaluated; a reduced count suspends excess intent and exact regrowth can restore it.
Intentional granting selection/owner/earned-level removal retires its choices and editor lifetime,
including an empty selection, while source suspension preserves intent without allocating revisions.
Shared Class, Spells, readiness, Actions, Review and PDF projections consume the same active union
and feature-qualified provenance. Unselected styles create no setup obligation.

This is initial setup/correction, not a gameplay replacement-event ledger. Reopening an editor or
gaining another class level grants no swap event. Enforcing the one-replacement-per-class-level
allowance and other acquisition/rest events remains separate work.

## Existing daily preparation

The finite daily owners retain exact `preparedSpells` intent in their parent profiles. Effective
preparation requires a current certified casting declaration, earned class level, exact enabled
leveled target within that owner's access, and a current list path. An optional-only PHB/TCE route
requires that owner's explicitly adopted, current Additional Spells section and exact member printing.
Current independent fixed and native expanded paths may also qualify a target. Another multiclass
owner's higher slots do not raise this limit. Context-free readers expose no saved daily benefit.

Daily setup, learned-spellbook preparation and level-only selection are classified from the certified
effective casting fields, rather than a second list of class names. Generated descriptors retain
the source formula or complete progression and finite bounds derived over the supported levels and
legal effective ability scores. Formula preparation uses the exact casting declaration's certified
minimum after arithmetic flooring. The structured formula omits that minimum; generation recognizes
one unambiguous preparation-capacity clause in that declaration's entries and rejects unsupported
or conflicting meaning. Commands, learned preparation and current casting details share the same
descriptor evaluator. Missing current certification supplies no preparation limit.

New exact spell printings with supported audited routes enter the current pool through the shared
parser and eligibility checks. Missing targets/routes/declarations suspend their benefit while
preserving recoverable intent. The finite casting registry still requires reviewed registration for
a new casting producer or changed source semantics; setup capacity does not authorize rest replacement
quantity or create past gameplay events.

New preparation uses the latest current effective ability and preparation limit. The first
validated preparation creates the missing profile for its exact earned class and saves only the
requested intent. A desired no-op writes nothing. Exact withdrawal remains source-free and
preserves independent ownership. Source loss,
Bonus/native edits, numeric edits and synchronization retain raw daily intent. Reduced capacity flags
an over-limit list without silently deleting or reordering it. Daily intent has no numeric revision,
ordinal or inferred acquisition history. Full daily selection history, rest/acquisition events,
other specialist spell grants remain separate. Additional Spells adoption changes only
list eligibility; it neither prepares/learns spells automatically nor adds selection or casting quota.
OFF, adoption Clear and unavailable sources retain existing setup while suspending only paths with
no remaining authority. Exact restoration rechecks that setup. The existing Spells list, preparation
toggles and unavailable-choice recovery handle these states without a separate preparation editor.

## Shared effective view

One calculation character owns current profiles and matching provenance. Current ordinary numeric,
fixed, native, Bonus, feat and qualified daily spells form an independent prerequisite seed. Effective
ability scores come from the existing race/background/ASI/feat/item/manual calculation. Selected
feature spells qualify against that seed, then join the effective union; their own or mutually
dependent choices cannot bootstrap qualification. Class routes and their current consumers share
the explicit independent score/profile context. Missing qualification context remains unsupported. Actions,
prerequisites, readiness, Review and both PDF editions consume that same effective union. PDF receives
current filtered authority as a required argument separately from retained text lookups; an unavailable ordinary class spell
does not become an active export row. Generic Bonus and native APIs cannot create numeric class rows.
