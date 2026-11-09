# Equipment state and fixed bonuses

## Proficiencies and equipment

Expertise requires its underlying skill proficiency. Use the shared command path so inventory,
wallet and provenance change together. Derived AC and capacity read equipped state.

Only the explicit initial Class owns the Class starting package. Adding or reordering classes
never issues another package. Background and Class choices save exact item arrays. Repeated
references can fill multiple units. Validate the exact count, group, mundane or Basic rules
and proficiency clauses against the current declaration. Unknown or ambiguous rules leave
setup pending. Groups are choice pools and cannot become inventory rows.

Each grant lot retains its original role, entry address, exact target and physical inventory ID.
Remaining owned quantity is issued minus cumulative consumption, floored at zero. Refresh
cannot reissue consumed copies. Replace or remove only the remaining owned copies, preserving
manual surplus and other providers. Unavailable rules preserve the snapshot. A never-issued
grant requires explicit Apply when its exact rules return.

Class and Background own their unspent starting coins separately. Spend starting coins first
in the edited denomination, Class before Background. Carry each role's cumulative copper debit
through removal, re-add and budget changes. Structured `value` and `containsValue` credit the
wallet. `worthValue` describes an item. The legacy gold roll stays manual.
[Grant ownership tests](../../tests/unit/startingEquipmentOwnership.test.ts)

AC chooses the first saved equipped body armor and shield. Ignored restrictions or unavailable
rules do not promote another intrinsic owner. Re-enabling restrictions unequips invalid armor
in one patch. Missing exact rules suspend live effects while preserving the physical snapshot.
An authoritative raw item lookup is required for a missing-data recommendation. An explicit
empty lookup proves absence, and a loading lookup does not.

## Fixed weapon bonuses

Only an existing equipped physical weapon with exact rules can receive its own attack/damage
bonus. Honor attunement and apply bonuses to the inventory ID, once regardless of quantity.
Accept safe signed integer fields. A malformed field or combined-plus-split conflict gives a
manual review note with no intrinsic bonus. Exact primary rules take precedence over raw
fallback, including explicit absence of a bonus.

The audited source exception registry separates fixed baselines from conditional or alternate-form
rules. Special bearer, charge, target, ability or weapon-form mechanics stay manual unless
explicitly supported. Actions, Review and PDF share one effect projection and preserve player
prose and manual adjustments.
