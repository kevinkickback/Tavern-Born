# Item ingestion and concrete generation

Classify items using parsed type labels, then catalog codes. Unfamiliar items remain in Other.
Resolve saved equipment by exact name/source in the filtered lookup and then the exact raw
catalog. Source-less items keep their saved facts. Catalog refresh never overwrites saved
physical fields or player descriptions.

The raw layers compose exact base, item, entry, type and template identities before concrete
copy resolution and text projection. Mastery definitions and shared `itemEntry` records are
separate from inventory. Exact primary type rules and optional supplemental type prose keep
their own attribution and target. A missing or ambiguous reference yields a bounded diagnostic.
An empty winning optional entry suppresses earlier text. Unsupported text cannot supply
mechanics. Known primary type defaults remain in the parser.
[Ingestion pipeline](../data-ingestion.md#pipeline)

The shared display projection combines item entries, applicable type text and available
equipment facts. Resolve only supported scalar template fields and render the established
fallback for unknown values. Existing pinned previews keep their lookup snapshots.
Raw magic templates and their reference-only projections are distinct from concrete equipment.
Reference projections cannot enter inventory or starting-equipment choices.

### Fixed-bonus shields

Only the canonical +1, +2 and +3 DMG shield templates with the exact PHB base, and their
XDMG/XPHB counterparts, can generate concrete shields. Generation checks winning raw bases,
template eligibility and safe fixed numeric bonuses after ordinary copies resolve. Explicit
concrete tuples win. Ambiguous or malformed inputs do not generate a substitute. Generated
rules keep exact printing and legal source identity. Changing generation invalidates the
parsed cache without rewriting saved inventory. [Equipment state](equipment-state.md)

### Fixed-bonus weapons

The canonical +1, +2 and +3 weapon templates generate concrete weapons from direct
public PHB and XPHB bases of the corresponding edition. The generator applies each
template's declared requirements and exclusions and reads its fixed attack and damage
bonus. It retains the base weapon's physical fields and preserves any explicit item
with the same concrete identity. Ambiguous or unsupported source rows do not generate
equipment. Generic templates remain reference entries, and generated weapons are
classified as Other for starting equipment.

Inventory saves the concrete weapon printing and instance. Actions and PDFs use
the current catalog's exact generated base identity for named proficiency and acquired
Weapon Mastery. The weapon's own attack and damage bonuses belong to the equipped
instance. An unavailable variant keeps its saved inventory fields and suspends
rules that require the exact catalog printing.

### Fixed-bonus body armor

The canonical +1, +2 and +3 armor templates use direct public PHB and XPHB
bases of the corresponding edition. Classic templates declare the armor flag.
Revised templates declare eligible armor types. Generated pieces retain base AC,
armor category, weight, Strength requirement and Stealth disadvantage metadata. Explicit concrete
items keep priority. A missing, ambiguous or unsupported exact base cannot
produce a substitute.

The first equipped body armor owns both its saved base AC and its live magic bonus.
The first equipped shield may contribute independently. Losing the exact catalog
printing suspends the live bonus while preserving the saved armor and its base AC.

### Fixed-bonus ammunition

The canonical +1, +2 and +3 ammunition templates generate individual pieces from
exact public PHB and XPHB bases. Declared type and edition predicates determine
eligibility. Packs of mundane ammunition do not generate magic variants. Inventory
retains the exact printing, quantity, and weight per piece.

The rules text records the attack and damage bonus for a shot made with that piece
and the loss of magic after a hit. Players apply that rule per shot and manage
quantity manually. Carrying magic ammunition leaves the weapon's standing attack
and damage values unchanged.
