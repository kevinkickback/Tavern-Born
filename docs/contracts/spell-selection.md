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

Format12 owns ordinary cantrips, known spells and Wizard spellbook entries through
`managedClassSpellChoices`. A slot is `[actualOwner, domain, exactDeclaration, earnedClassLevel, ordinal]`.
The finite casting registry and current source certificates determine supported gains, quantities,
levels, declared lists and school limits. An ability field or an unqualified class label supplies no
casting authority. Actual subclass ownership remains separate from its declared Wizard/Sorcerer list.
PHB Arcane Trickster gains two chosen cantrips in addition to its independent Mage Hand grant.

Subclass-owned slot tables determine that owner's gain-level access and a sole earned caster's
available slots. Non-casting classes and classes before their first Spellcasting gain do not force
the combined multiclass table. Multiple earned shared casters retain their combined slot calculation;
their larger pool never raises an individual owner's acquisition limit. Pact slots stay separate.

Fixed spells already granted by the selected class/subclass at a gain cannot consume an ordinary slot.
An earlier valid choice may later overlap an independent fixed grant without losing either owner.
Fixed subclass tokens use the upstream PHB default only when their printing is omitted; explicit
printings stay exact. Current fixed profiles and provenance derive from the same earned provider.

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
Changed choices allocate a new global revision; Clear and intentional owner/gain removal preserve the
watermark even when no choices remain. No-op, failure, source refresh and reads allocate nothing.
An empty slot cannot be reused by an older dialog after Add/Clear. Unrelated edits remain intact.
Exact source-free Clear removes only the addressed owner and retains other class, fixed, racial,
feat and Bonus contributions. Learned Prepare edits the same admitted choice; an unlearned Wizard
spell cannot use daily preparation or a generic profile API to bypass learning.

Current projection strips saved numeric/fixed benefits before deriving current independent grants
and managed choices. Missing declaration, target, route or provider suspends benefit while retaining
the occupied intent, list policy, preparation request, revision and allocator. Exact restoration
reactivates it. Class/Spells recovery and readiness show dormant choices; they do not satisfy active
completion counts. No saved activity snapshot or old-file ownership inference is used.

## Existing daily preparation

The finite daily owners retain exact `preparedSpells` intent in their parent profiles. Effective
preparation requires a current certified casting declaration, earned class level, exact enabled
leveled target within that owner's access, and a current list path with optional-only routes denied.
Current independent fixed and native expanded paths may also qualify a target. Another multiclass
owner's higher slots do not raise this limit. Context-free readers expose no saved daily benefit.

New preparation uses the latest current effective ability and preparation limit. A desired no-op
writes nothing; exact withdrawal remains source-free and preserves independent ownership. Source loss,
Bonus/native edits, numeric edits and synchronization retain raw daily intent. Reduced capacity flags
an over-limit list without silently deleting or reordering it. Daily intent has no numeric revision,
ordinal or inferred acquisition history. Full daily selection history, rest/acquisition events,
Arcanum and other specialist spell grants remain separate; the eight optional spell roots remain
disabled until their complete consumer behavior is supported.

## Shared effective view

One calculation character owns current profiles and matching provenance. Known numeric and qualified
daily spells seed guarded feature closure before effective ability/preparation calculation. Actions,
prerequisites, readiness, Review and both PDF editions consume that same effective union. PDF receives
current filtered authority as a required argument separately from retained text lookups; an unavailable ordinary class spell
does not become an active export row. Generic Bonus and native APIs cannot create numeric class rows.
