# Data Loading Architecture

## Overview

This document explains how the D&D Character Creator loads all game data from the 5etools JSON dataset. **No information is hardcoded** - everything is retrieved dynamically from the 5etools data files through a service layer.

## Architecture Flow

```
User Configures Data Source
         ↓
Settings Page / Auto-load at App Start
         ↓
DataSourceConfig stored in gameDataStore
         ↓
FiveEToolsDataLoader fetches JSON files
         ↓
Parsers extract data from JSON
         ↓
GameData stored in Zustand store
         ↓
React components access via hooks
```

## Key Components

### 1. Data Source Configuration

**File**: `src/store/gameDataStore.ts`

The data source configuration defines where to load the 5etools data from:

```typescript
interface DataSourceConfig {
  type: 'local' | 'remote'
  path: string
  isValid: boolean
  lastLoaded?: string
}
```

**Example configurations**:
- Remote: `https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master`
- Local: `http://localhost:8080` (when serving locally)

**GitHub URL Support**:
The system automatically normalizes various GitHub URL formats to raw content URLs:
- `https://github.com/5etools-mirror-3/5etools-src` → auto-detects branch (main/master)
- `https://github.com/5etools-mirror-3/5etools-src/releases` → auto-detects branch
- `https://github.com/5etools-mirror-3/5etools-src/tree/main` → uses specified branch
- `https://github.com/5etools-mirror-3/5etools-src/tree/main/data` → extracts branch
- `https://raw.githubusercontent.com/...` → uses as-is

All these formats are automatically converted to the correct raw content URL for data access.

### 2. Data Loader Service Layer

**File**: `src/lib/5etools/dataLoader.ts`

The `FiveEToolsDataLoader` class is responsible for:
- Fetching JSON files from configured source
- Parsing JSON into typed TypeScript objects
- Building source book metadata from books.json
- Progress tracking during load
- Error handling for missing files

**Loaded Resources**:
1. `books.json` - Book metadata (names, abbreviations, groups, years)
2. `races.json` - All race and subrace data
3. `classes.json` - All class data
4. `backgrounds.json` - All background data
5. `spells.json` - All spell data
6. `feats.json` - All feat data
7. `items.json` - All equipment and item data
8. `class-features.json` - All class feature data

### 3. Book Metadata (Previously Hardcoded)

**IMPORTANT CHANGE**: Book information is now loaded from `books.json` instead of being hardcoded.

The `buildSourcesList` method:
1. Loads book data from books.json
2. Creates a map of book abbreviations to book metadata
3. Matches source abbreviations found in game data to books
4. Determines if books have character-relevant options
5. Groups and sorts books appropriately

**Book Structure from books.json**:
```json
{
  "book": [
    {
      "name": "Player's Handbook",
      "id": "PHB",
      "source": "PHB",
      "group": "core",
      "published": "2014-08-19",
      ...
    }
  ]
}
```

**Mapped to**:
```typescript
{
  abbreviation: "PHB",
  name: "Player's Handbook",
  group: "core",
  year: 2014,
  hasCharacterOptions: true
}
```

### 4. Character-Relevant Filtering

Not all books contain character creation options. The loader filters sources based on:

**Character-relevant groups**:
- `core` - Core rulebooks (PHB, DMG, etc.)
- `expansion` - Expansion books (Xanathar's, Tasha's, etc.)
- `setting` - Setting books (Eberron, Ravnica, etc.)
- `adventure` - Adventure modules with character options

**Filtered out**:
- Monster-only books
- Adventures without character options
- DM-only resources

### 5. Data Storage

**File**: `src/store/gameDataStore.ts`

All loaded data is stored in a Zustand store with persistence:

```typescript
interface GameDataState {
  gameData: GameData | null           // All loaded game data
  dataSourceConfig: DataSourceConfig | null  // Where data came from
  isLoading: boolean                  // Loading state
  loadProgress: LoadProgress | null   // Progress tracking
  error: string | null                // Error messages
  lastLoadedAt: string | null         // Timestamp of last load
}
```

The store is persisted to localStorage so:
- Data source configuration survives page refresh
- Data doesn't need to be re-fetched every time
- Users can work offline after initial load

### 6. React Hooks for Data Access

**File**: `src/hooks/useGameData.ts`

Components access game data through typed hooks:

```typescript
// Get all races
const races = useRaces()

// Get filtered races
const mediumRaces = useRaces({ sizes: ['M'] })

// Get races with source filtering
const phbRaces = useRaces({ sources: ['PHB'] })

// Similar hooks exist for:
useClasses()
useBackgrounds()
useSpells()
useFeats()
useItems()
```

### 7. Source Filtering in Character Creation

**File**: `src/components/character/CharacterCreationWizard.tsx`

During character creation, the Rules step allows users to select which source books they want to use. This selection:

1. Stored in character's `allowedSources` property
2. Filters all available options (races, classes, backgrounds, etc.)
3. Ensures only content from selected sources is shown
4. Persists with the character for future sessions

**Source Selection UI**:
- Grouped by type (Core, Expansions, Settings, Adventures)
- Shows full book names loaded from books.json
- Displays abbreviations and years
- Quick actions: Select All, Recommended, None
- Group-level selection toggle

## Data Flow Example: Loading Races

1. **User loads data** (Settings page or app start)
   ```typescript
   await loadGameData({
     type: 'remote',
     path: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
     isValid: true
   })
   ```

2. **Loader fetches races.json**
   ```typescript
   const data = await fetch(`${baseUrl}/data/races.json`)
   const json = await data.json()
   ```

3. **Parser extracts race data**
   ```typescript
   gameData.races = parseRaces(json)
   // Collects source abbreviations: ['PHB', 'XPHB', 'VGTM', ...]
   ```

4. **Loader fetches books.json**
   ```typescript
   const booksData = await fetch(`${baseUrl}/data/books.json`)
   const booksJson = await booksData.json()
   ```

5. **Builder creates source list**
   ```typescript
   gameData.sources = buildSourcesList(sourceAbbrs, booksJson)
   // Maps 'PHB' → "Player's Handbook (2014)"
   // Maps 'XPHB' → "Player's Handbook (2024)"
   ```

6. **Component uses the data**
   ```typescript
   const races = useRaces({ sources: character.allowedSources })
   // Only shows races from selected source books
   ```

## Benefits of This Architecture

### ✅ No Hardcoded Data
- All information comes from 5etools JSON files
- Book names, abbreviations, and metadata from books.json
- Easy to update when new books are released

### ✅ Source Flexibility
- Users can configure any valid 5etools data source
- Supports official mirrors, custom datasets, or local files
- Switching sources doesn't require code changes

### ✅ Modular Design
- Clear separation between loading, parsing, and presentation
- Easy to add new data types (just add to loader and parser)
- Service layer can be reused across components

### ✅ Type Safety
- Full TypeScript types for all game data
- Compile-time checks prevent errors
- IDE autocomplete for all data structures

### ✅ Performance
- Data loaded once and cached in store
- Persisted to localStorage
- No unnecessary re-fetching

### ✅ User Control
- Users select which source books to use
- Character-specific source restrictions
- Supports homebrew or custom content

## How to Add New Data Types

To add support for a new data type (e.g., monsters, vehicles):

1. **Add to types** (`src/types/5etools.ts`)
   ```typescript
   export interface Monster5e {
     name: string
     source: string
     // ... other properties
   }
   ```

2. **Add to GameData interface**
   ```typescript
   export interface GameData {
     // ... existing types
     monsters: Monster5e[]
   }
   ```

3. **Add parser to dataLoader.ts**
   ```typescript
   private parseMonsters(data: any): Monster5e[] {
     if (data.monster) return data.monster
     if (Array.isArray(data)) return data
     return []
   }
   ```

4. **Add to resources list**
   ```typescript
   const resources = [
     // ... existing resources
     { key: 'monsters', file: 'bestiary.json' },
   ]
   ```

5. **Add to switch statement**
   ```typescript
   case 'monsters':
     gameData.monsters = this.parseMonsters(data)
     gameData.monsters.forEach(item => item.source && sourcesSet.add(item.source))
     break
   ```

6. **Add React hook** (`src/hooks/useGameData.ts`)
   ```typescript
   export function useMonsters() {
     const gameData = useGameDataStore(state => state.gameData)
     return useMemo(() => gameData?.monsters || [], [gameData])
   }
   ```

## Validation and Error Handling

The system includes comprehensive validation:

**Before Loading**:
- `validateDataSource()` checks if source is reachable
- Tests for presence of key files
- Returns specific error messages

**During Loading**:
- Individual file failures don't crash entire load
- Warnings logged for missing files
- Progress callbacks for user feedback

**After Loading**:
- Components check for null/empty data
- User-friendly messages for missing data
- Guidance to configure data source

## Testing Different Data Sources

You can test with different sources:

**Official Mirror**:
```typescript
{
  type: 'remote',
  path: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master'
}
```

**Local Development**:
```bash
cd 5etools-src
python -m http.server 8080
```
```typescript
{
  type: 'remote',
  path: 'http://localhost:8080'
}
```

**Custom Dataset**:
```typescript
{
  type: 'remote',
  path: 'https://my-custom-5etools-fork.com'
}
```

## Summary

The D&D Character Creator uses a robust, flexible data loading architecture:

- **Nothing is hardcoded** - all data comes from 5etools JSON files
- **Books.json** provides book metadata (names, groups, years)
- **Service layer** handles fetching and parsing
- **Zustand store** manages state and persistence
- **React hooks** provide typed access to data
- **Source filtering** respects user's book selections
- **Modular design** makes it easy to extend

This architecture ensures the app stays up-to-date with the 5etools dataset and gives users complete control over which source books to use for their characters.
