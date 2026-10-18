# Equipment state and fixed bonuses

Read this reference only when changing this contract. Start with the [topic index](../README.md).

## Proficiencies and equipment

`character.proficiencies` is the canonical list model. Expertise must be a subset of skill
proficiency; `reconcileSkillExpertise()` removes invalid expertise.

Starting-equipment option keys and concrete generic-item choices are stored separately. Inventory
and equipment provenance change through the same equipment command. Derived AC and capacity read
equipped state; they are not copied into equipment records.
Armor proficiency and body-armor/shield slot checks share one pure policy. Re-enabling equipment
restrictions from either page applies the rule and unequips invalid armor in one character patch.
Base AC and intrinsic armor/shield `bonusAc` effects share the first equipped body-armor and shield
owners, selected from saved equipment classification/order. Other equipped armor/shields contribute
no intrinsic AC bonus, including when equipment restrictions are ignored. Missing catalog rules,
suppression or attunement failure do not promote another equipped owner. Unequipping, removing or
reordering the selected owner changes the slot. Nonarmor AC items, manual effects/adjustments and
explicit overrides retain their existing behavior; quantity does not multiply bonuses.

Source-qualified equipment without an exact current rules record gets a nonblocking readiness
recommendation after primary-then-raw resolution. An authoritative raw lookup must be supplied:
undefined/loading data is unknown, while an explicit empty map establishes absence. A filtered primary
lookup supplied alone retains calculation fallback but cannot establish raw-rule absence; callers
must explicitly supply the authoritative raw item map for this recommendation. A filtered primary
view with an exact raw match produces no warning; another printing cannot substitute. Source-less
custom entries remain outside this check, and existing unresolved starting placeholders keep their
separate blocking issue. Review and PDF preflight consume the same readiness result. Missing rules
remove only live catalog contributions; exact restoration recomputes them and clears the recommendation.
Saved physical fields, player prose, inventory IDs/runtime state and provenance remain intact.
Catalog physical-field refresh changes catalog records and future adds without silently overwriting
existing inventory snapshots. Concrete generated shields need no saved template/base relation.

Inventory weapon properties preserve 5etools references as abbreviations or source-qualified
`{ uid, note }` records. Display surfaces resolve full names from the parsed item-property lookup;
the structured form retains item-specific notes without changing existing saved abbreviations.

## Fixed weapon bonuses

`deriveStructuredItemEffects` projects supported fixed `bonusWeapon` (attack and damage),
`bonusWeaponAttack` and `bonusWeaponDamage` tags through `weaponBonuses.ts`. Each additive
effect targets the inventory instance ID used by its existing weapon attack. Quantity does
not multiply a bonus. Equipped state and the saved-or-current attunement requirement gate
numeric benefits; other feature/manual effects, suppression and manual-action precedence remain
independent. `deriveWeaponActions` consumes an explicit calculation context; calling it without
effects does not implicitly project catalog bonuses. Actions, Review and PDF use the shared context.

Only finite safe signed integers (numbers or trimmed signed digit strings, including zero) are
supported. A malformed present field or combined-plus-split coexistence yields no intrinsic
weapon bonus and a manual-review note. Separate attack/damage fields remain separate channels.
Exact primary item resolution wins over raw fallback, even when its bonus fields are absent or
unsupported. Missing exact data removes only the derived contribution; restoration recomputes it.
No saved equipment, prose, provenance or manual values change; character format11/cache37 remain.

Eligibility requires an existing physical weapon in both inventory and selected item data.
Shared classification excludes ammunition, armor, consumables, groups and generic/reference
templates. Physical staff/rod/wand weapons with damage or weapon-category fields remain eligible.
Source-qualified ranged types such as `R|XPHB` use Dexterity under the existing ability policy.
No attack is synthesized from a template, base-item reference, transformation or prose.

Tags are prose-converter output, not unconditional mechanics. The audited producer boundary is
5etools `b9061583536101068b3a59d27e886d1fa664e366`, `BonusTag` in
`js/converter/converterutils-item.js` and item filter/render consumers. These exact special
weapons retain manual notes instead of automatic weapon bonuses: Blood Spear|CoS,
Bloodrage Greataxe|BMT, Duskcrusher|EGW, Hammer of Runic Focus|BMT, Hazirawn|HotDQ,
Niko's Mace|UtHftLH, Needle of Mending|EGW, True-Ice Shards (Rapier)|CoA, Dawnbringer|OotA,
Sun Blade|DMG/XDMG, Sunsword|CoS and Baba Yaga's Pestle|TCE. Their bearer, HP, charges, attunement exception,
spell attack, defensive transfer or deployed/form state is not modeled by these numeric tags.
Mace of Smiting|DMG/XDMG, Dragontooth Dagger|RoT and Moonblade|DMG retain their fixed +1
baseline with notes for target/rune increases. Hammer of Thunderbolts|DMG has no root attunement
requirement for its +1 baseline; its optional Giant's Bane remains manual.

Notes use the existing source-effects/Review displays and active PDF preflight warnings; they
do not overwrite player descriptions or add an attack-row note channel. Notes require equipped
state so exceptions such as Hazirawn remain explained even when unattuned. Review can also list
inactive declarations. Details retain the exact item's complete available prose. This does not
automate every item rule: extra dice, critical/charge effects, ammunition stacking, unarmed grants,
temporary/area effects, ability substitution and form controls remain outside this projection.
Later concrete generation must reassess its producers, especially Bloodshed Blade's Constitution
modifier minimum and Repeating Shot's ranged-only condition, rather than blindly copying tags.
