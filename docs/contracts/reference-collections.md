# Compound reference collections

Compound reference resources retain all declared rule collections: `conditionsdiseases.json`
combines conditions, diseases and statuses, while `trapshazards.json` combines traps and hazards.
Parser-owned `_sourceType` metadata preserves the collection kind without mutating source records.
Layer overlays and recursive references distinguish kind as well as name/source; an explicit
reference cannot substitute a different kind or printing. Disease tags use the upstream DMG default;
condition/status tags use PHB, and trap/hazard tags use DMG. Existing untagged low-level helper inputs
retain their condition/status/trap/hazard preview behavior; disease previews require a disease tag.
Array helper inputs do not change the object-document validation contract for external sources.

The Compendium exposes Condition, Disease and Status categories, with Trap/Hazard context in its
combined group. Character condition controls and immunity-name lists exclude diseases and statuses;
these reference records do not introduce automatic character mechanics. These families retain their
existing global reference availability, including through character-filtered data hooks. Parsed cache
normalization invalidates older incomplete catalogs independently of the saved-character format.
Language-script metadata support is not established by this contract. Item text/templates have a separate [bounded contract](item-ingestion.md).


Entry point: [basic parser](../../src/lib/5etools/parsers/basic.ts), [layer composition](../../src/lib/5etools/contentLayers.ts) and [recursive lookup](../../src/lib/renderer/recursiveTooltip.ts).
