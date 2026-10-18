# Spell selection and casting displays

Read this reference only when changing this contract. Start with the [topic index](../README.md).

Builder Review's spellcasting overview consumes both class and active racial casting details from
`useSpellSlots`. Display each actual owner's shared effect-aware ability, save DC and attack bonus,
including explicit unknown values. Class preparation limits and shared/Pact slots retain their
class-only APIs; unselected racial alternatives have no active casting summary.

Class spell selection and replacement apply exact class/subclass membership and source-qualified
expanded references as the default visibility filter. The Ignore class restrictions switch can
bypass that filter; level, school, known-spell locks and quotas still apply. Expanded references
offer only their exact printing and do not grant it automatically. Native racial target pools
remain hard limits independent of that switch. Bonus spells block already-known logical names
across every profile and printing, including known unprepared spells; showing known spells does
not make them selectable.
