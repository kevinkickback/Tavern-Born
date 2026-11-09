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
