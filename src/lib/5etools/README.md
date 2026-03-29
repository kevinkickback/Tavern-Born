# 5etools Data Loader

This directory contains the complete data loading and parsing system for 5etools JSON data.

## ⚠️ Recent Refactor

**The data loading system has been refactored into focused, single-responsibility modules for better maintainability and proper validation.**

### What Changed

The original 663-line `dataLoader.ts` file has been split into 5 focused modules:

1. **`dataLoader.ts`** (150 lines) - Fetching and orchestrating data loading
2. **`parsers.ts`** (175 lines) - Extracting data arrays from JSON structures
3. **`validator.ts`** (200 lines) - **Now actually validates file structure using schemas**
4. **`schemas.ts`** (145 lines) - Zod schema definitions for validation
5. **`urlUtils.ts`** (70 lines) - GitHub URL normalization

### Key Improvement: Actual Validation

**Before**: Validation only checked `if (data && typeof data === 'object')` - this passed for ANY object, not validating actual file structure.

**After**: Validation now uses Zod schemas to verify each file has the correct structure (e.g., `{ race: [...] }` with proper fields), providing detailed error messages when files are malformed.

---

## Overview

The 5etools data loader provides a modular, extensible system for fetching, parsing, and filtering D&D 5e game data from the 5etools JSON dataset. **All data is loaded dynamically from the 5etools JSON files with no hardcoded information.**

## Features

- ✅ **Fetch from multiple sources**: Remote URLs (GitHub) or local directories
- ✅ **Parse all data types**: Races, classes, spells, backgrounds, feats, items, class features, and books
- ✅ **Dynamic book information**: Book metadata loaded from books.json, no hardcoded data
- ✅ **Advanced filtering**: Filter by source, level, school, components, and more
- ✅ **Search functionality**: Full-text search across all data types
- ✅ **Progress tracking**: Monitor loading progress with callbacks
- ✅ **Validation**: Verify data sources before loading **with actual schema validation**
- ✅ **React hooks**: Easy integration with React components
- ✅ **TypeScript support**: Full type safety throughout

## Module Architecture

```
lib/5etools/
├── dataLoader.ts      # Core data loading and orchestration
├── parsers.ts         # Data parsing and array extraction
├── validator.ts       # Data source and structure validation
├── schemas.ts         # Zod schemas for validation
├── urlUtils.ts        # GitHub URL normalization
├── parser.ts          # Legacy renderer/parser (existing)
├── filters.ts         # Advanced filtering utilities (existing)
└── index.ts           # Public API exports

hooks/
└── useGameData.ts     # React hooks for data access

store/
└── gameDataStore.ts   # Zustand store for global state

components/settings/
└── DataSourceConfigurator.tsx  # UI component for configuration
```

### Module Responsibilities

#### `dataLoader.ts`
- Fetches JSON files from remote URLs or local paths
- Orchestrates loading of all data types
- Reports progress via callbacks
- **Does NOT** parse, validate, or normalize URLs

#### `parsers.ts`
- Extracts data arrays from 5etools JSON structures
- Handles various formats (e.g., `{ race: [...] }` vs `[...]`)
- Builds source book metadata
- **Does NOT** validate or fetch data

#### `validator.ts`
- Validates data sources before loading
- **Uses Zod schemas to verify file structure**
- Tests each required file against its schema
- Returns detailed error messages
- **Does NOT** load full datasets

#### `schemas.ts`
- Zod schema definitions for all data types
- Individual item schemas (RaceSchema, ClassSchema, etc.)
- Full file schemas (RaceDataSchema, ClassDataSchema, etc.)
- Reusable across the application

#### `urlUtils.ts`
- Normalizes GitHub URLs to raw.githubusercontent.com
- Auto-detects main/master branch
- **Does NOT** fetch or validate data

## Usage

### 1. Configure Data Source

Use the Settings page or programmatically configure the data source:

```typescript
import { useGameDataStore } from '@/store/gameDataStore'

const { loadGameData } = useGameDataStore()

await loadGameData({
  type: 'remote',
  path: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
  isValid: true,
})
```

### 2. Access Data with React Hooks

```typescript
import { useRaces, useClasses, useSpells } from '@/hooks/data/useGameData'

function MyComponent() {
  // Get all races
  const races = useRaces()

  // Get races with filters
  const dwarves = useRaces({ sizes: ['M'] }, 'dwarf')

  // Get all classes
  const classes = useClasses()

  // Get spellcaster classes only
  const spellcasters = useClasses({ spellcaster: true })

  // Get spells with filters
  const fireSpells = useSpells(
    {
      levels: [0, 1, 2],
      schools: ['EVO'],
    },
    'fire'
  )

  return (
    <div>
      {races.map(race => (
        <div key={race.name}>{race.name}</div>
      ))}
    </div>
  )
}
```

### 3. Get Specific Items

```typescript
import { useRace, useClass, useSpell } from '@/hooks/data/useGameData'

function CharacterBuilder() {
  const humanRace = useRace('Human')
  const fighterClass = useClass('Fighter')
  const fireball = useSpell('Fireball')

  return (
    <div>
      <h2>{humanRace?.name}</h2>
      <h2>{fighterClass?.name}</h2>
      <h2>{fireball?.name}</h2>
    </div>
  )
}
```

### 4. Filter Data

```typescript
import { useSpells } from '@/hooks/data/useGameData'

function SpellList() {
  const spells = useSpells({
    levels: [1, 2, 3],
    schools: ['ABJ', 'EVO'],
    classes: ['Wizard', 'Sorcerer'],
    concentration: false,
    components: {
      material: false, // Only spells without material components
    },
  })

  return (
    <div>
      {spells.map(spell => (
        <div key={spell.name}>
          {spell.name} - Level {spell.level}
        </div>
      ))}
    </div>
  )
}
```

### 5. Monitor Loading Status

```typescript
import { useGameDataStatus } from '@/hooks/data/useGameData'

function LoadingIndicator() {
  const { isLoading, loadProgress, error, hasData } = useGameDataStatus()

  if (isLoading && loadProgress) {
    return (
      <div>
        Loading {loadProgress.resource}...
        {loadProgress.current} / {loadProgress.total}
      </div>
    )
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  if (!hasData) {
    return <div>No data loaded. Go to Settings to configure.</div>
  }

  return null
}
```

## Filter Options

### Race Filters

```typescript
interface RaceFilters {
  sources?: string[]          // e.g., ['PHB', 'XGTE']
  sizes?: string[]           // e.g., ['M', 'S']
  hasAbilityScore?: string[] // e.g., ['str', 'dex']
  hasDarkvision?: boolean
}
```

### Class Filters

```typescript
interface ClassFilters {
  sources?: string[]         // e.g., ['PHB', 'XGTE']
  hasProficiency?: string[]  // e.g., ['strength', 'constitution']
  spellcaster?: boolean
  hitDice?: number[]         // e.g., [6, 8, 10, 12]
}
```

### Spell Filters

```typescript
interface SpellFilters {
  sources?: string[]    // e.g., ['PHB', 'XGTE']
  levels?: number[]     // e.g., [0, 1, 2, 3]
  schools?: string[]    // e.g., ['EVO', 'ABJ', 'CON']
  classes?: string[]    // e.g., ['Wizard', 'Cleric']
  concentration?: boolean
  ritual?: boolean
  components?: {
    verbal?: boolean
    somatic?: boolean
    material?: boolean
  }
}
```

## Data Validation

Before loading data, validate the source:

```typescript
import { validateDataSource } from '@/lib/5etools'

const result = await validateDataSource({
  type: 'remote',
  path: 'https://example.com/5etools',
  isValid: false,
})

if (result.isValid) {
  console.log('Valid! Found:', result.foundResources)
} else {
  console.error('Invalid:', result.error)
}
```

## Direct API Usage

For more control, use the low-level API directly:

```typescript
import { FiveEToolsDataLoader, FiveEToolsParser } from '@/lib/5etools'

const loader = new FiveEToolsDataLoader({
  type: 'remote',
  path: 'https://example.com/5etools',
  isValid: true,
})

const data = await loader.loadAllData({
  onProgress: (current, total, resource) => {
    console.log(`Loading ${resource}: ${current}/${total}`)
  },
})

// Parse specific data
const races = FiveEToolsParser.parseRaces(rawRaceData)
const classes = FiveEToolsParser.parseClasses(rawClassData)
const spells = FiveEToolsParser.parseSpells(rawSpellData)
```

## Advanced Filtering

Use the DataFilter class for complex filtering:

```typescript
import { DataFilter } from '@/lib/5etools'

// Filter races
const mediumRaces = DataFilter.filterRaces(allRaces, {
  sizes: ['M'],
  hasDarkvision: true,
})

// Filter classes
const martialClasses = DataFilter.filterClasses(allClasses, {
  spellcaster: false,
  hitDice: [10, 12],
})

// Filter spells
const combatSpells = DataFilter.filterSpells(allSpells, {
  levels: [1, 2, 3],
  schools: ['EVO', 'ABJ'],
  concentration: false,
})
```

## Utility Functions

```typescript
import {
  extractUniqueSources,
  extractUniqueSizes,
  extractUniqueSchools,
  extractUniqueSpellLevels,
  extractUniqueClasses,
  searchByName,
  sortByName,
} from '@/lib/5etools'

// Get all unique sources from data
const sources = extractUniqueSources(races)

// Get all unique sizes
const sizes = extractUniqueSizes(races)

// Get all unique spell schools
const schools = extractUniqueSchools(spells)

// Search by name
const searchResults = searchByName(races, 'elf')

// Sort alphabetically
const sortedRaces = sortByName(races)
```

## Data Source URLs

### Official 5etools Mirror

```
https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master
```

### Local Development

If you have the 5etools repository cloned locally, you can serve it with a simple HTTP server:

```bash
cd 5etools-src
python -m http.server 8080
```

Then configure the data source as:
```
type: 'remote'
path: 'http://localhost:8080'
```

## 5etools Data Structure

The 5etools dataset follows this structure:

### Core Files (in `/data` directory)
- `books.json` - Book metadata with `id` (abbreviation), `name` (full title), `published` (year), and `group`
- `races.json` - Race definitions
- `classes.json` - Class definitions (index/summary)
- `backgrounds.json` - Background definitions
- `spells.json` - Spell definitions
- `feats.json` - Feat definitions
- `items.json` - Item definitions
- `class-features.json` - Class feature definitions

### Extended Data Folders

#### `/data/class/` - Detailed Class Information
- `index.json` - Class index with references to individual class files
- `class-[classname].json` - Full class data for each class (e.g., `class-fighter.json`)
- Contains detailed subclass information, progression tables, and class-specific features

#### `/data/spells/` - Spell Information
- `index.json` - Spell index with references to individual spell files
- `spells-[source].json` - Spell data for each source book (e.g., `spells-phb.json`, `spells-xge.json`)
- Contains spell descriptions, components, and casting information

#### `/data/book/` - Full Book Contents
- `book-[abbreviation].json` - Complete book content for each source (e.g., `book-phb.json`)
- Contains all text, tables, and content from the source book
- Useful for displaying full descriptions and lore

These extended folders provide more detailed information than the core JSON files and are loaded dynamically based on their index files for better performance.

## TypeScript Types

All data structures are fully typed. Import types from:

```typescript
import type {
  Race5e,
  Class5e,
  Spell5e,
  Background5e,
  Feat5e,
  Item5e,
  ClassFeature,
  GameData,
  DataSourceConfig,
} from '@/types/5etools'
```

## Error Handling

All async operations can throw errors. Always wrap in try-catch:

```typescript
try {
  await loadGameData(config)
} catch (error) {
  console.error('Failed to load data:', error)
  toast.error('Failed to load game data')
}
```

## Performance Tips

1. **Use filters**: Don't filter in render - use the hook filters
2. **Memoize results**: The hooks already use useMemo internally
3. **Load once**: Data is persisted in Zustand and localStorage
4. **Validate first**: Always validate before loading large datasets

## Troubleshooting

### "No data loaded"
- Go to Settings and configure a data source
- Click "Validate Source" to test the connection
- Click "Load Data" to fetch the data

### "Failed to fetch"
- Check your internet connection
- Verify the URL is accessible
- Try a different mirror or local source

### "Invalid data source"
- Ensure the path points to the correct 5etools structure
- Check that the data files exist at the expected paths
- Look at the console for detailed error messages

## Contributing

To add support for new data types:

1. Add type definition to `types/5etools.ts`
2. Add parser method to `parser.ts`
3. Add filter interface and method to `filters.ts`
4. Add loader support to `dataLoader.ts`
5. Add React hook to `useGameData.ts`
6. Update this documentation

## License

This loader system is part of the D&D Character Creator project. The 5etools data is separate and has its own license.
