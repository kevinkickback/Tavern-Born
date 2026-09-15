# Data Ingestion (5etools)

This document covers the ingestion pipeline from source configuration to parsed game data.

## Scope

Core modules:
- src/lib/5etools/dataLoader.ts
- src/lib/5etools/parsers/index.ts
- src/lib/5etools/parsers/*
- src/lib/5etools/classData.ts
- src/lib/5etools/validator.ts
- src/lib/5etools/schemas.ts
- src/lib/5etools/lookups.ts
- src/lib/5etools/entityResolvers.ts
- src/lib/5etools/filters.ts
- src/lib/5etools/urlUtils.ts
- src/lib/5etools/sourceFallbacks.ts
- src/lib/5etools/rulesetMetadata.ts
- src/lib/5etools/classRuleNormalization.ts
- src/lib/5etools/backgroundRuleNormalization.ts
- src/lib/5etools/index.ts
- src/lib/storage/dataCache.ts

## Source Types

- Local folder: loaded through Electron IPC (`window.electronAPI.readLocalJson`). The main process
  authorizes only a directory chosen with the native folder picker, persists that authorization in
  the Electron user-data directory, resolves symlinks before containment checks, and accepts only
  JSON files up to 50 MB below that canonical root.
- Remote repository: production accepts HTTPS only, matching the renderer content-security policy.
  GitHub repository, tree, blob, and raw URLs are normalized to their repository data root. Because
  a slash-containing branch cannot be distinguished from a folder by URL shape alone, those URLs
  require an explicit `?ref=feature%2Fbranch`; ambiguous inputs fail validation instead of silently
  truncating the ref.
- Remote source: loaded through fetch from normalized URL path.

Full rulebook body files under `data/book/` are not part of the required source contract. UI help
must therefore use clearly attributed Tavern-Born summaries unless the relevant structured content
is already present on an ingested entity; it must not copy a book passage and present it as loaded
source content.

## Pipeline Stages

1. Configuration and validation
- User chooses data source in Settings.
- Validation confirms required resources and expected shape.

2. Resource loading
- dataLoader reads the known resource list through a bounded worker pool. No more than six requests
  are active at once, including when class and spell indexes expand into many files.
- Every remote request has a 15-second timeout. Caller cancellation propagates through top-level,
  class, fluff, and spell requests and aborts the load instead of returning a partial cancellation.
- Individual missing indexed files still use the existing partial-file recovery behavior.

3. Parsing and normalization
- parsers extract arrays and normalize structure differences.
- Condition ingestion reads both `.condition[]` and `.disease[]` from `conditionsdiseases.json`, preserves their structured `entries`, and tags each record with its source type. `useConditions()` exposes valid condition records while excluding diseases; this lets the Conditions page render names, descriptions, inline tags, and PHB/XPHB exhaustion rules from data instead of local constants.
- Class and subclass feature references are normalized for downstream consumption. Class ingestion
  also produces `normalizedRules` for spendable resources, recovery amount and cadence, ritual
  casting, source-qualified ASI levels, and class-owned choices. Choice normalization consumes
  explicit class-feature option blocks, optional-feature progressions, tagged entity filters, and
  matching class-table capacities. Each descriptor has stable source-qualified ownership,
  per-level selection counts, replacement rules, and input-field provenance; unsafe option blocks
  remain visible in `choiceDiagnostics`. Choice kinds come from the referenced entity collection,
  and table-backed choices are joined by source-provided feature and column labels; runtime code
  contains no class names, feature names, option catalogs, or assumed selection/replacement values.
  Narrow replacement and singular-choice phrases are parsed only when an entity filter provides
  the choice boundary. A bounded number-word parser also accepts plural counts only when a tagged
  entity filter and nearby "of your choice" phrase define the boundary. Optional-feature
  progressions remain the single count owner when their feature body also contains an option block,
  avoiding duplicate fighting-style, Metamagic, pact, and invocation choices. Item choices that
  explicitly require proficiency retain that constraint for catalog resolution. Ambiguous prose
  produces a diagnostic instead of an invented rule. Only
  known spendable resource columns are accepted from class tables, so numeric choice capacities do
  not become counters. Source-qualified adapters cover rules that upstream exposes only through
  prose. Encoded reference levels take precedence when repeated feature names occur at more than
  one level.
- Copied subclasses can retain feature references from their original class printing. Resolution
  first uses the full encoded identity, then permits progressively broader matching only when the
  remaining source-qualified identity selects exactly one feature. Ambiguous copies remain
  unresolved; the parser never chooses the first name match.
- Background ingestion produces `normalizedOriginRules`. Structured ability and feat fields win;
  a ruleset-qualified, versioned 2024 adapter fills only the upstream prose-only gap and records its
  provenance.
- Class spell-slot progression is read from `classTableGroups[].rowsSpellProgression` and retained on parsed class records. Shared multiclass slots resolve against the loaded PHB or XPHB full-caster table; static slot tables are not used as a fallback.
- Class loading also reads matching `fluff-class-*.json` resources and attaches both a short class summary and full fluff content to parsed class records.
- The summary is taken from the last direct paragraph in the first class fluff section and is used by compact UI surfaces such as the character-creation wizard.
- Full fluff sections are attached on `classFluffSections` and image metadata on `classFluffImages`, enabling richer class-details rendering without reparsing raw fluff payloads.
- Race loading also reads `fluff-races.json` and attaches a short race summary to parsed races. The summary is taken from the first available paragraph in the corresponding race fluff entry and is used by compact UI surfaces such as the character-creation wizard.
- Organization loading reads `fluff-backgrounds.json` and extracts faction records from the Faction Agent "Factions of the Sword Coast" section. Parsed records expose `name`, `source`, a short `description`, and optional `imagePath` for selector-driven UI surfaces.
- When source image metadata is missing or not suitable, parser-level fallback image paths are applied for known factions (Harpers, Order of the Gauntlet, Emerald Enclave, Lords' Alliance, Zhentarim). These WebP assets are bundled under `public/assets/images/factions/` and referenced via `/assets/images/factions/...` paths. This fallback is intentionally isolated in parser code and can be removed once canonical image metadata is reliably available.
- Race parsing also expands `_versions` arrays embedded in race records into synthetic subraces. Two formats are supported:
  - **Simple versions** (e.g., XPHB Elf's Drow/High Elf/Wood Elf lineages): direct objects with `name`, `_mod`, and properties like `additionalSpells`, `darkvision`, `speed`.
  - **Template versions** (e.g., XPHB Dragonborn colors): an `_abstract` template with `{{variable}}` placeholders expanded per `_implementations` entry.
- Version entries apply `_mod` operations (`replaceArr`, `removeArr`) to parent entries at parse time, producing fully resolved `entries` on each synthetic subrace. These subraces carry an `_isVersion: true` flag so that `mergeRaceWithSubrace` uses the resolved entries directly instead of concatenating.
- Race ingestion also produces `presentationEntries`. Sections already represented by structured
  fields such as size, speed, and languages are removed there, while prose-only sections are
  retained. Views consume that normalized collection rather than suppressing English headings.
- Item consumers resolve raw type codes through the parsed `itemType` catalog. The manual item picker
  keeps records with unfamiliar or uncategorized codes in a data-derived Other group and displays the
  parsed type label when available, rather than using recognized categories as an inclusion gate.
- Fixed feat references may encode a grant parameter after a semicolon, such as
  `magic initiate; cleric|xphb`. Provenance parsing stores `Magic Initiate` as the canonical entity
  identity and retains `cleric` as grant metadata; consumers must not treat the full reference as a
  feat name.

4. Lookup construction
- lookups creates composite-key maps (name|source) for fast, collision-safe class, race, background, spell, feature, subclass, and item access.
- Source metadata is sorted by a total, deterministic order so parallel resource completion cannot cause cache fingerprint churn.

5. Entity resolution
- `entityResolvers.ts` is the canonical class, background, and race/subrace reference API.
- Callers may supply a filtered primary lookup and a raw fallback lookup. Resolution prefers an exact `name|source` primary match, then the exact raw match so an existing selection remains resolvable after filters change.
- Name-only fallback is allowed only when the persisted reference has no source. It prefers primary data and uses source/name ordering for deterministic collision handling.

6. Caching and freshness
- Parsed data plus source snapshot are cached in IndexedDB.
- Cache entries carry a normalization-schema version (currently 3). Changes to ingestion-owned normalized rules
  invalidate older parsed caches so corrected adapters apply immediately after an app update.
- Cache freshness is evaluated on startup; stale cache triggers background refresh.

## Non-Negotiable Rules

- Never patch canonical values by editing data/.
- Prefer parser improvements over new hardcoded constants.
- Treat fallback values as emergency behavior only. Source-specific content substitutions belong in
  `sourceFallbacks.ts`; rules catalogs missing structured upstream data belong in the explicitly
  versioned `rulesetMetadata.ts`. Parsed fields always take precedence.
- Keep persisted-data compatibility aliases separate from current upstream catalogs. Classifiers may
  consume both, but development validation must check only codes expected in the current parsed
  catalog.

## Known Nuances

- data/class/index.json keys are class slugs, not source identifiers.
- data/spells/index.json still behaves as source-grouped index data.
- Downstream UI should prefer lookups over repeated array scans when exact entity references are required.
- Shared lookup consumers should use named hooks from `src/hooks/data/useGameData.ts`; direct nested lookup selectors are not a UI API.

### Grouped Tool Choice Nuance

- 5etools proficiency blocks can include grouped tool tokens (for example: `gaming set`, `anyMusicalInstrument`, `anyTool`) in addition to concrete tool names.
- Parsing keeps these entries as source data, while provenance normalization maps grouped aliases to canonical labels.
- Proficiencies UI expands grouped labels into concrete tool options from item data (`itemsBase` + `items`) and then records the concrete selected tool as the final proficiency grant.

### Generic Starting Equipment

- Generic class/background equipment tokens are normalized into choice descriptors rather than
  persisted as invented `G` items.
- Candidate weapons, armor, tools, focuses, and other gear are resolved from the loaded item and
  item-type records.
- The character stores the chosen concrete item reference separately from the package option, so a
  later source/filter change can preserve and re-resolve the exact selection.

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
  - `enrichSpellFromLookup()` in `src/lib/5etools/parsers/spells.ts` retrieves the lookup entry
  - `mergeSpellClassList()` in `src/lib/5etools/parsers/spells.ts` extracts class associations and builds `spell.classes.fromClassList[]`
  - `mergeSpellSubclassList()` in `src/lib/5etools/parsers/spells.ts` extracts subclass associations and builds `spell.classes.fromSubclass[]`

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
2. Class spell selection happens on the Class page per-level; prepared casters use inline toggles on the Spells page
3. Filtering uses `isSpellOnClassList(spell, className, classSource)` — checks if that class appears in the spell's enriched list
4. User can only select spells available to that specific class

**This prevents:** adding Wizard-exclusive spells to a Sorcerer multiclass, for example.

### Why Single Pipeline

- **One enrichment pass** during parsing (not repeated at runtime)
- **One canonical source** (`spell.classes.fromClassList[]`)
- **Clear separation:** enrichment (parsing) vs. validation (UI filtering)
- **No precedence conflicts:** lookup is consumed once and data is immutable thereafter

## Extending Ingestion for a New Data Type

1. Add schema(s) in src/lib/5etools/schemas.ts.
2. Add parser module/function under src/lib/5etools/parsers/ and re-export via src/lib/5etools/parsers/index.ts.
3. Wire resource loading in src/lib/5etools/dataLoader.ts.
4. Add lookup support in src/lib/5etools/lookups.ts if entities are referenced by key.
5. Expose consumption via hook(s) in src/hooks/data.
6. Add tests in tests/lib/5etools.

## Failure Modes and Debugging

- Missing resource file: loader warning, empty collection, degraded feature surface.
- Schema mismatch: validator should surface explicit shape errors.
- Missing PHB/XPHB full-caster or pact progression rows: development validation reports the source-qualified class data gap; spell calculations return no invented slots.
- Source URL issues: inspect the shared HTTPS parser and normalized remote base path. Host matching
  is exact; GitHub-like hostname substrings are not accepted.
- Local path issues: verify absolute folder and IPC file read behavior.

## Performance Notes

- Lookup map usage should be preferred for exact entity fetches.
- Keep parser output serializable and stable to reduce cache churn.
- Background refresh is designed to reduce startup latency while keeping data fresh.
- Background refresh reports dropped resources to the store so partial ingestion results are never committed over a complete cache.
- Progress callbacks are completion-based during ingestion: each completed resource increments progress, regardless of completion order.
- Remote request count is bounded across both top-level resources and expanded index files; do not
  replace the worker pool with an unbounded `Promise.all()`.

## Corpus Capability Report

Run `npm run report:capabilities` with a configured local `data/` checkout to inventory parsed
classes, races, backgrounds, feats, items, and optional features. The report lists normalized class
choice kinds and diagnostics, every movement representation, all observed top-level field shapes,
and source-qualified reference failures. It is intentionally observational: unfamiliar fields and
ambiguous references are reported rather than converted into guessed rules. The corpus itself is
read-only and is never changed by the report.
