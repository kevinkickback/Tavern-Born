# Data Validation and Required Files Update

## Summary
Updated the 5etools data loader to include all previously optional files as required files, added new required files, and implemented comprehensive Zod schema validation for data integrity.

## Changes Made

### 1. New Required Files Added
All files are now required (no optional files remain):

**Previously Optional (Now Required)**:
- `books.json` - Book/source metadata
- `items.json` - Equipment and magic items
- `actions.json` - Combat and general actions
- `conditionsdiseases.json` - Conditions and diseases
- `deities.json` - Deity information
- `skills.json` - Skill definitions
- `senses.json` - Sense types (darkvision, etc.)

**Newly Added Required Files**:
- `items-base.json` - Base item definitions
- `languages.json` - Language definitions
- `magicvariants.json` - Magic item variants
- `optionalfeatures.json` - Optional class features
- `variantrules.json` - Variant rule definitions

**Total Required Files**: 17 files

### 2. Schema Validation Implementation
Implemented Zod schemas for validating data structure and integrity:

**Schemas Added**:
- `RaceSchema` - Validates race data structure
- `ClassSchema` - Validates class data structure
- `BackgroundSchema` - Validates background data structure
- `SpellSchema` - Validates spell data structure
- `FeatSchema` - Validates feat data structure
- `ItemSchema` - Validates item data structure
- `BookSchema` - Validates book metadata structure
- `ActionSchema` - Validates action data structure
- `ConditionSchema` - Validates condition data structure
- `LanguageSchema` - Validates language data structure
- `OptionalFeatureSchema` - Validates optional feature data structure
- `GenericSchema` - Fallback schema for basic validation

**Validation Function**:
```typescript
function validateData<T>(data: any, schema: z.ZodType<T>, resourceName: string): T[]
```
- Validates each item in data arrays
- Logs validation errors without breaking the load process
- Allows graceful degradation if individual items fail validation

### 3. Type System Updates
Updated `GameData` interface in `/src/types/5etools.ts`:

```typescript
export interface GameData {
  races: Race5e[]
  classes: Class5e[]
  backgrounds: Background5e[]
  spells: Spell5e[]
  feats: Feat5e[]
  items: Item5e[]
  itemsBase: Item5e[]              // NEW
  classFeatures: ClassFeature[]
  actions: any[]
  conditions: any[]
  deities: any[]
  skills: any[]
  senses: any[]
  languages: any[]                 // NEW
  magicvariants: any[]             // NEW
  optionalfeatures: any[]          // NEW
  variantrules: any[]              // NEW
  sources: SourceBook[]
}
```

### 4. Data Loader Updates
**File**: `/src/lib/5etools/dataLoader.ts`

**New Parser Methods**:
- `parseLanguages()` - Extracts language data
- `parseMagicVariants()` - Extracts magic variant data
- `parseOptionalFeatures()` - Extracts optional feature data
- `parseVariantRules()` - Extracts variant rule data

**Resource Loading**:
All 17 files are now loaded in the `loadAllData()` method with proper validation.

### 5. Validation Updates
**File**: `/src/lib/5etools/dataLoader.ts` - `validateDataSource()` function

Updated to validate all 17 required files:
```typescript
const requiredFiles = [
  { name: 'books.json', path: 'data/books.json' },
  { name: 'races.json', path: 'data/races.json' },
  { name: 'classes.json', path: 'data/class/index.json' },
  { name: 'backgrounds.json', path: 'data/backgrounds.json' },
  { name: 'spells.json', path: 'data/spells/spells-phb.json' },
  { name: 'feats.json', path: 'data/feats.json' },
  { name: 'items.json', path: 'data/items.json' },
  { name: 'items-base.json', path: 'data/items-base.json' },
  { name: 'actions.json', path: 'data/actions.json' },
  { name: 'conditionsdiseases.json', path: 'data/conditionsdiseases.json' },
  { name: 'deities.json', path: 'data/deities.json' },
  { name: 'skills.json', path: 'data/skills.json' },
  { name: 'senses.json', path: 'data/senses.json' },
  { name: 'languages.json', path: 'data/languages.json' },
  { name: 'magicvariants.json', path: 'data/magicvariants.json' },
  { name: 'optionalfeatures.json', path: 'data/optionalfeatures.json' },
  { name: 'variantrules.json', path: 'data/variantrules.json' },
]
```

### 6. Error Handling
**Validation Errors**:
- Individual validation errors are logged to console with item index
- Failed validations don't break the entire load process
- Allows partial data loading if some items are malformed

**Missing Files**:
- Clear error messages indicate which required files are missing
- Validation shows count of found vs required files
- Helpful error messages guide user to fix data source issues

## Benefits

1. **Data Integrity**: Zod schemas ensure data conforms to expected structure
2. **Better Error Messages**: Specific validation errors help identify data issues
3. **Comprehensive Coverage**: All relevant 5etools data files are now loaded
4. **Graceful Degradation**: Partial failures don't crash the entire system
5. **Type Safety**: TypeScript types are enforced through Zod schemas
6. **Future-Proof**: Easy to add more schemas and validations as needed

## Testing Recommendations

1. **Valid Data Source**: Test with complete 5etools repository
2. **Missing Files**: Test with incomplete data sources to verify error messages
3. **Malformed Data**: Test with invalid JSON to verify validation catches issues
4. **Partial Failures**: Test with some valid and some invalid items in arrays
5. **Remote vs Local**: Test both remote URLs and local directories

## Migration Notes

- Existing data sources must now include all 17 required files
- Validation will fail if any required file is missing
- Users will need to update their data sources to include new files
- The Settings page will clearly show which files are missing

## Future Improvements

1. Add more specific type definitions for `any[]` types (deities, skills, etc.)
2. Implement caching to avoid re-fetching unchanged files
3. Add progress indicators for individual file validations
4. Implement retry logic for failed file fetches
5. Add data versioning to handle schema changes over time
