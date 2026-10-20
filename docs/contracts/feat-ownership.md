# Feat setup and special-spell ownership

Read this reference only when changing this contract. Start with the [topic index](../README.md).

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
The [current schema cutoff](../state-management.md#schema-compatibility) rejects ambiguous earlier
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

Skilled PHB/XPHB skill selection excludes skills already proficient in the current effective state.
The picker and confirmation share current source and exact owner eligibility. Only that live owner's
saved skill choices remain available on Edit, including later independent overlap. Missing, changed
or ambiguous current rules permit retaining/removing those saved choices, and do not authorize new
ones. The bounded source audit includes the three-pick mixed declaration and ordered rules; other
feat families retain their behavior. Skilled's broader mixed skill/tool wizard remains a separate
parser limitation. Skill Expert's Expertise picker and confirmation exclude new picks already
benefiting from Expertise, while retaining the exact owner's established saved intent. Race,
Background, Class and Feats setup provide the same exact target to that shared eligibility check.

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

All owners of one exact special-profile spell share its current cantrip/leveled classification.
Exact live metadata reclassifies that target atomically without changing its manual or feat owners,
fixed status, other printings or independent class/racial profiles. Clear retains the current kind
while a special owner remains; it never restores an inferred predecessor kind. Pure projections and
acknowledged active-character catalog corrections use the same rule, including durable reopen and
later metadata absence. No per-owner kind history is stored.

An explicit manual add creates its independent ownership, retaining an established target's kind
when metadata is unavailable. Bulk replacement preserves fixed targets in their established kind
without inventing a manual owner, and rejects contradictory input grouping atomically. Omitting or
removing a manual contribution retains the exact feat-owned target and lock. Manual-only kind edits
remain supported; exact available metadata takes precedence. Bare-name manual API values remain
unresolved, distinct from qualified targets, and excluded from exact-metadata reclassification.
The [format 10 cutoff](../state-management.md#schema-compatibility) rejects ambiguous special kinds
and inconsistent fixed membership while preserving original-file recovery.

New feat expertise and manual expertise selections use optional `proficiencies.expertise` ledger
ownership, separate from skill proficiency. Retraction preserves expertise from another owner.
Untracked expertise is retained while its proficiency remains, and a pre-existing untracked selection
is preserved as manual when a new feat grants the same expertise. Removing proficiency still prunes expertise. This ownership
rule does not reconstruct the origin of untracked expertise. Complete proficiency
removal commands also expire expertise ownership when its materialized selection is pruned, so
later proficiency grants cannot revive a historical expertise owner.
