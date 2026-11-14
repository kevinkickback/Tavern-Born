# Equipment

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
[Grant ownership tests](../tests/unit/startingEquipmentOwnership.test.ts)

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

## Subclass weapon inscriptions

An inscription records the exact earned feature and rune on one inventory row for each subclass owner.
The current subclass must declare both the inscription and its spell schedule. Only a currently
resolved melee weapon is eligible. A marked stack retains one inscribed copy while its quantity
is positive. Moving the inscription transfers it between inventory IDs. Unequipping keeps it.
Removing the row or losing the earned owner clears it. Missing source rules suspend the affected
spells while preserving the mark, and the unconditioned spell column remains independent.
Builder edits the current inscription manually. Rest and level-up timing remain in the feature text.

## Catalog and templates

The raw layers compose exact base, item, entry, type and template identities before concrete
copy resolution and text projection. Mastery definitions and shared `itemEntry` records are
separate from inventory. Exact primary type rules and optional supplemental type prose keep
their own attribution and target. A missing or ambiguous reference yields a bounded diagnostic.
An empty winning optional entry suppresses earlier text. Unsupported text cannot supply
mechanics. Known primary type defaults remain in the parser.

The shared display projection combines item entries, applicable type text and available
equipment facts. Resolve only supported scalar template fields and render the established
fallback for unknown values. Existing pinned previews keep their lookup snapshots.
Raw magic templates and their reference-only projections are distinct from concrete equipment.
Reference projections cannot enter inventory or starting-equipment choices.

Class training previews can open authored item filters with a simple or martial weapon type
and a positive property list. Property names separated by semicolons are alternatives. The
preview uses available base equipment and each item's exact property definition. A bare
property reference defaults to PHB. Other filter shapes display the source label as text.

Canonical +1, +2 and +3 DMG or XDMG shields, weapons, body armor and ammunition use an
eligible direct PHB or XPHB public base of the corresponding edition. Explicit concrete
printings win. Ambiguous or unsupported inputs produce no substitute. Generated equipment
is Other for starting equipment. Actions and PDF use the exact generated base for
proficiency and Weapon Mastery. Mundane ammunition packs do not generate variants.
Individual magic ammunition uses manual per-shot bonuses and loss after a hit. Carrying
it does not change standing weapon attack or damage.

For additional armor, the edition and authored requirements select eligible public bases. An editionless template uses the upstream revised default. The template’s inherited source identifies the concrete printing. Its base edition does not classify the entire sourcebook. Armor of Resistance applies only with the exact item equipped and attuned. Mithral removes the declared Strength and Stealth penalties. Adamantine’s critical-hit rule remains manual. Mariner’s and Ruidium Armor can raise swim speed to current walking speed while worn and where required attuned, preserving a higher independent speed or an explicit override. Enspelled charges and creation-time spell selection remain manual. Elven Chain grants
training for its own exact item. Editionless Molten Bronze Skin has no eligible revised
base because the authored requirements explicitly name classic PHB printings.

Generation changes invalidate the parsed cache. Saved inventory retains its facts and prose, and live effects resume when the exact source returns.
