# Data Ingestion (5etools)

This document covers the ingestion pipeline from source configuration to parsed game data.

## Scope

Core modules:
- src/lib/5etools/dataLoader.ts
- src/lib/5etools/parsers.ts
- src/lib/5etools/classData.ts
- src/lib/5etools/validator.ts
- src/lib/5etools/schemas.ts
- src/lib/5etools/lookups.ts
- src/lib/5etools/filters.ts
- src/lib/5etools/urlUtils.ts
- src/lib/5etools/sourceFallbacks.ts
- src/lib/5etools/index.ts
- src/lib/storage/dataCache.ts

## Source Types

- Local folder: loaded through Electron IPC (window.electronAPI.readLocalJson).
- Remote source: loaded through fetch from normalized URL path.

## Pipeline Stages

1. Configuration and validation
- User chooses data source in Settings.
- Validation confirms required resources and expected shape.

2. Resource loading
- dataLoader reads the known resource list in parallel.
- Class and spell data are expanded via index files and loaded in parallel per indexed file.

3. Parsing and normalization
- parsers extract arrays and normalize structure differences.
- Class and subclass feature references are normalized for downstream consumption.
- Class loading also reads matching `fluff-class-*.json` resources and attaches a short class summary to the parsed class record. The summary is taken from the last direct paragraph in the first class fluff section and is used by compact UI surfaces such as the character-creation wizard.
- Race loading also reads `fluff-races.json` and attaches a short race summary to parsed races. The summary is taken from the first available paragraph in the corresponding race fluff entry and is used by compact UI surfaces such as the character-creation wizard.

4. Lookup construction
- lookups creates composite-key maps (name|source) for fast, collision-safe access.

5. Caching and freshness
- Parsed data plus source snapshot are cached in IndexedDB.
- Cache freshness is evaluated on startup; stale cache triggers background refresh.

## Non-Negotiable Rules

- Never patch canonical values by editing data/.
- Prefer parser improvements over new hardcoded constants.
- Treat fallback values as emergency behavior only and isolate them in sourceFallbacks.

## Known Nuances

- data/class/index.json keys are class slugs, not source identifiers.
- data/spells/index.json still behaves as source-grouped index data.
- Downstream UI should prefer lookups over repeated array scans when exact entity references are required.

### Grouped Tool Choice Nuance

- 5etools proficiency blocks can include grouped tool tokens (for example: `gaming set`, `anyMusicalInstrument`, `anyTool`) in addition to concrete tool names.
- Parsing keeps these entries as source data, while provenance normalization maps grouped aliases to canonical labels.
- Proficiencies UI expands grouped labels into concrete tool options from item data (`itemsBase` + `items`) and then records the concrete selected tool as the final proficiency grant.

## Spell-Class Association Enrichment

Spells in 5etools carry metadata about which classes can use them. This system is implemented as a **single enrichment pipeline** with no competing sources of truth.

### Data Source

5etools provides spell-class mappings in `generated/gendata-spell-source-lookup.json`:

```json
{
  "phb": {
    "magic missile": {
      "class": {
        "PHB": { "Wizard": true, "Sorcerer": true }
      },
      "subclass": {
        "PHB": {
          "Wizard": { "PHB": { "Evoker": { "name": "School of Evocation" } } }
        }
      }
    }
  }
}
```

### Enrichment Pipeline

1. **Loading** — `gendata-spell-source-lookup.json` is loaded as part of spell resource ingestion.

2. **Parsing** — For each spell during `parseSpells()`:
   - `enrichSpellFromLookup()` (line 156 in parsers.ts) retrieves the lookup entry
   - `mergeSpellClassList()` (line 63) extracts class associations and builds `spell.classes.fromClassList[]`
   - `mergeSpellSubclassList()` (line 104) extracts subclass associations and builds `spell.classes.fromSubclass[]`

3. **Canonical Storage** — Each `Spell5e` object carries its enriched class list:
   ```ts
   spell.classes.fromClassList = [
     { name: 'Wizard', source: 'PHB' },
     { name: 'Sorcerer', source: 'PHB' }
   ]
   ```

4. **Validation** — All downstream spell-class checks use `isSpellOnClassList()` (src/lib/calculations/spellProfiles.ts:242), which reads directly from `spell.classes.fromClassList[]`.

### Multiclass Integration

When a user selects spells for a multiclass character:

1. Each class gets its own `SpellProfile` (separate cantrips/spellsKnown/preparedSpells lists)
2. When opening the spell selection modal: `buildSpellModalConfig()` passes `className` and `classSource`
3. Modal filters via `isSpellOnClassList(spell, className, classSource)` — checks if that class appears in the spell's enriched list
4. User can only select spells available to that specific class

**This prevents:** adding Wizard-exclusive spells to a Sorcerer multiclass, for example.

### Why Single Pipeline

- **One enrichment pass** during parsing (not repeated at runtime)
- **One canonical source** (`spell.classes.fromClassList[]`)
- **Clear separation:** enrichment (parsing) vs. validation (UI filtering)
- **No precedence conflicts:** lookup is consumed once and data is immutable thereafter

## Extending Ingestion for a New Data Type

1. Add schema(s) in src/lib/5etools/schemas.ts.
2. Add parser in src/lib/5etools/parsers.ts.
3. Wire resource loading in src/lib/5etools/dataLoader.ts.
4. Add lookup support in src/lib/5etools/lookups.ts if entities are referenced by key.
5. Expose consumption via hook(s) in src/hooks/data.
6. Add tests in tests/lib/5etools.

## Failure Modes and Debugging

- Missing resource file: loader warning, empty collection, degraded feature surface.
- Schema mismatch: validator should surface explicit shape errors.
- Source URL issues: inspect URL normalization and remote base path.
- Local path issues: verify absolute folder and IPC file read behavior.

## Performance Notes

- Lookup map usage should be preferred for exact entity fetches.
- Keep parser output serializable and stable to reduce cache churn.
- Background refresh is designed to reduce startup latency while keeping data fresh.
- Progress callbacks are completion-based during ingestion: each completed resource increments progress, regardless of completion order.
