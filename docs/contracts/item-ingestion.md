# Item ingestion and concrete generation

Read this reference only when changing this contract. Start with the [topic index](../README.md).

Item classification uses parsed `itemType` labels first; catalog codes are compatibility fallback.
Unfamiliar items remain available in an Other group instead of being dropped.

Saved equipment resolution trims requested name/source fields and compares the parsed fields
literally, including case. Catalog enrichment requires both fields and never substitutes another
printing. Source-less manual equipment keeps its saved physical facts and prose without borrowing
catalog mechanics. Duplicate matching
tuples keep the first value in lookup iteration order, independent of map keys. Calculations,
weapon Actions, Review details and PDF item descriptions resolve their references in synchronous
batches, scanning each supplied lookup at most once per batch. These transient results are
discarded after the projection, so later map edits, cache-restored maps and catalog replacements
are observed without a persistent index. Primary results still precede raw fallback;
PDF descriptions retain their source requirement and prefer saved prose when present.

Generic starting-equipment tokens become choice descriptors whose candidates come from parsed
items. The character stores the selected concrete `name|source` separately from the package choice.
`items-base.json` supplies base items and mastery definitions; mastery records are not ordinary
inventory entries.

It also supplies `itemEntry` definitions, retained separately as source-qualified `itemEntries`
support metadata. They never become equipment choices or selectable books. After item copies and
content layers resolve, `{#itemEntry Name|Source}` and typed `refItemEntry` array slots expand into
ordinary structured entries in the consuming item's context. An omitted/blank fragment source
defaults to DMG, independently of the item's source; an explicit printing never borrows another.
Nested/repeated includes preserve their entries and tags. The bounded adapter supports own scalar
fields/scalar arrays such as `item.resist`, `item.detail1`, `item.detail2`, and simple string arrays
with `getFullImmRes`; arbitrary expressions and complex resistance objects are unsupported.
Missing/ambiguous references, unsupported templates, malformed embedded includes and expansion
cycles/limits produce visible missing-text information and item-local capability diagnostics.
They do not become resource transport failures or invent mechanics. Shared renderers and PDF text
projections consume the expanded entries with their existing saved-description precedence.
Expanded text is derived catalog data and never writes a character's inventory or player prose.
Older parsed caches rebuild incomplete descriptions. Concrete magic-template materialization
remains a separate support boundary.

Primary `itemType.entries` supply intrinsic rules of the exact declared type. Definitions use
normalized abbreviation/source tuples, independently of display names and the concrete item's
printing. Omitted/blank type sources default to PHB. Explicit source conflicts never borrow another
printing, even when only one other definition remains. The supported legacy exception is omitted or
blank-source `SHP`: it selects exact SHP|DMG only when no identifiable SHP|PHB winner exists. Explicit
`SHP|PHB` does not use that alias; absent or ambiguous DMG cannot select XPHB. The original item type
and saved references remain unchanged, and supplemental matching does not inherit this exception.

Later layers replace primary definitions by abbreviation/source and retain winning duplicates as
ambiguous. Empty/absent entries provide no prose; malformed identifiable winners suppress earlier
text with bounded optional diagnostics. AIR|DMG and AIR|XPHB copies use the existing copy engine with
exact abbreviation/source parents. Live layers retain raw definitions so a parent replacement,
removal or restoration re-resolves inherited text. Unresolved copies and unsupported primary templates
degrade optional prose without invalidating item mechanics. Supported shared item-entry includes
expand in the concrete item's context. Source reload obtains fresh raw inputs; finalized caches
preserve display-ready definitions and per-item metadata, not original copy directives.

Primary sections retain their actual definition-source attribution whenever an exact item is shown,
including retained items whose books are disabled or incompatible. This follows existing own-entry
and equipment-fact display and preserves admitted DMG/XDMG SRD rules without enabling full books.
It does not change new-item eligibility, choose revised printings or add source-book choices.

`itemTypeAdditionalEntries` supplies optional rules for an equipment category. Records retain their
owning book and declared `appliesTo` type UID separately from individual items. Layer identity is the
normalized tuple of owning source, target abbreviation and target type-source; display names and
incidental metadata do not change it. A missing/blank type-source defaults to PHB, independently of
the concrete item's printing. Thus `INS` on a DMG item can receive `INS|PHB` guidance, while an explicit
`INS|XPHB` type cannot. Matching does not require a separately loaded type-label definition.

Later layers replace an exact owner/target identity; winning-layer duplicates remain ambiguous.
Empty entries suppress earlier prose. Malformed identifiable overlays remain unavailable winners;
unidentifiable rows and malformed optional containers produce bounded capability diagnostics.
Optional prose does not invalidate unrelated item mechanics or become a resource transport failure.
Canonical rows and fresh source-qualified per-item support metadata remain separate from own entries.
The shared display projection combines own `entries`, own `additionalEntries`, exact primary rules,
then eligible supplemental category
sections with visible owning-book attribution. Supported item-entry includes reuse the bounded adapter.
Compendium list summaries consume that projection lazily and retain their four-candidate limit;
full detail and PDF-description projections retain the complete supported text.

Supplemental owning books enter the existing source catalog so category-only books can be selected;
target type-sources do not create source-book choices. Existing compatibility and bundled selectable-
source restrictions still apply. Character and wizard views use their respective source settings;
explicit empty settings enable only the implicit core book. Unspecified settings retain the existing
unfiltered meaning, with any supplied ruleset still enforcing compatibility. Global Compendium views
remain unrestricted. Retained exact items can show eligible text without becoming new item choices.
Already-open previews keep their spawning lookup snapshot; closing and reopening uses current settings.
Spell-page preview descendants receive the same character book context and item-property catalog.

Item previews share available value, weight, damage, range and property formatting with Equipment,
including items without prose; inventory quantity stays specific to inventory. Rules projections
preserve each consumer's existing saved-description precedence. PDF text uses the exported character's
book settings and retains its existing magic-item description scope. Category prose never grants
proficiencies/bonuses or writes player descriptions, equipment instances or provenance. Parsed-cache invalidation rebuilds catalogs missing this metadata; character format is independent.

5etools `_copy` records for items and creatures are resolved by source-qualified parent identity
after their respective catalogs have loaded. Bestiary copies can also apply `bestiary/template.json`
ancestry templates. The resolver reports missing parents, cycles, and unsupported transformations
instead of inventing missing mechanics; layered composition retries copies against the completed
base-plus-additional catalog before rebuilding lookups.

`magicVariants` retains the complete raw template collection separately from concrete equipment,
including `_copy`, `requires`, `excludes`, and `inherits`, through cache restoration. Its canonical
identity is the complete name (including `(*)`) and declared root source, otherwise the inherited
source. Source selection precedes trim/case normalization: only an absent or exact-empty root source
may use the inherited source. A whitespace-only root is unusable, stays diagnosed without a canonical
tuple and cannot replace an earlier inherited-owner definition. There is no implicit source default
for a template or its copy parent. Raw layers replace
exact normalized name/source tuples; winning duplicates remain ambiguous and identifiable malformed
winners suppress earlier definitions. Supported copies resolve only against unique valid templates
after raw composition, using the existing bounded copy adapter and item-style protected fields.
Missing parents, cycles, unsupported operations and malformed/ambiguous definitions produce bounded
optional capability diagnostics, leaving unrelated concrete equipment available.

Reference-only Item5e projections are appended after concrete item copies resolve. They preserve
canonical names and root GV classification, even when inherited equipment type differs (Barding).
The marker `magicVariantReference` retains the canonical template target separately from the
projected source, which may follow a different explicitly inherited source. An explicit unusable
inherited source cannot fall back to the raw owner. Duplicate projected tuples are unavailable;
an exact concrete equipment tuple always wins a collision. No stripped-name alias is introduced.
Raw item retention excludes these projections, including after cache restoration, so references
cannot become equipment copy parents. Compendium and recursive previews consume surviving references
through existing shared/primary/supplemental description enrichment and source filtering. Their own
reference prose still precedes inherited template prose. Explicit class-choice item references retain
their existing reference semantics; they do not create inventory.

Inventory choices and both generic/exact starting-equipment creation exclude generic variants and
item groups through the shared selectable-item policy. An exact non-equipment starting reference
uses the existing unresolved placeholder, preserving its requested identity. This foundation
does not rewrite saved equipment/provenance or add a template/base saved relation. The bounded
shield generator below is the first concrete materialization support. Existing concrete weapons use the separately bounded
[fixed weapon bonus projection](../state-management.md#fixed-weapon-bonuses).
Template/generation changes invalidate older parsed catalogs without changing character format.
For example, the managed Artificer|EFA item-choice tables request `+1 Shield|XDMG` and `+2 Shield|XDMG`.
Their canonical `(*)` templates are different records. The shield generator supplies these exact
concrete targets when their supported inputs are loaded; reference choices do not grant inventory.

### Fixed-bonus shields

Only canonical `+1`, `+2` and `+3 Shield (*)|DMG` with direct public `Shield|PHB`, and their
`XDMG`/`XPHB` counterparts, generate concrete `+N Shield|DMG`/`|XDMG` equipment. Bundled-only data
contains no templates and generates none. General weapon, body-armor and other template generation,
copied Shield bases, charges, attached spells and conditional mechanics remain unsupported.

Serializable `fixedShieldBases` retains winning raw Shield inputs before normalized base-item
merging collapses duplicates. Identifiable invalid or duplicate winners suppress earlier inputs
for generation, including after cache restoration/recomposition. Supported canonical template copies
use their existing resolver. Generation accepts the audited fixed-bonus shape and explicit inherited
source equal to its canonical owner; unknown canonical-root or inherited mechanics, changed bonuses
and unsupported injectors are diagnosed instead of guessed. Requirements are OR-of-AND; exclusions
match any key, including upstream array/recursive semantics. Ordinary non-VTT edition matching prevents cross-edition bases.
Recursive predicates inspect own data properties, including array/string indices and length;
missing or null targets never match. Inherited prototype properties are not rules data.

Generation runs after raw layers and ordinary copy handling, before shared text/type enrichment and
lookups. It retains physical base AC/type/weight, removes mundane value and base-only source/public/
reprint/fluff metadata, applies inherited metadata and prepends injected shield rules to base entries.
Generic reference prose and template-namespace reprint edges do not become concrete rules/reprint
declarations. Raw templates keep their metadata. No concrete reprint mapping is inferred.

Explicit concrete tuples in either equipment collection win collisions. Ambiguous generated tuples
are unavailable. Bounded `fixedShieldDiagnostics` join optional template capability diagnostics,
separately from resource transport failures. Derived `magicVariantGenerated` lineage is catalog-only;
raw-item retention excludes generated/reference projections even after cache restore, so they cannot
become concrete copy parents or regenerate from stale derived outputs. Fresh raw inputs drive
replacement, removal and exact restoration. No character inventory or provenance is rewritten.
New choices use existing source/ruleset/public-core filtering; exact retained equipment still resolves
against raw data. See [equipment state](../state-management.md#proficiencies-and-equipment) for AC ownership
and missing-rule recommendations.

Public SRD items housed in DMG/XDMG are admitted by the shared player-item policy without enabling
the full source. The Included SRD remains the base catalog when additional content is configured,
so these items stay available in both the bundled-only and layered views without presenting DMG,
MM, XDMG, or XMM as selectable books. Their original source-qualified identities remain intact for
references and lookups. This is a filtering and source-catalog policy, not duplicated or relabeled
item data.
