import type { ZodTypeAny } from 'zod'
import { mapWithConcurrency } from '@/lib/async'
import type { DataSourceConfig } from '@/types/5etools'
import {
  createJsonResourceReader,
  type JsonResourceReader,
  ResourceHttpError,
} from './resourceReader'
import {
  ActionDataSchema,
  BackgroundDataSchema,
  BookDataSchema,
  ConditionDataSchema,
  FeatDataSchema,
  GenericDataSchema,
  IndexSchema,
  ItemDataSchema,
  LanguageDataSchema,
  OptionalClassBookDataSchema,
  OptionalFeatureDataSchema,
  PsionicDataSchema,
  RaceDataSchema,
  TrapHazardDataSchema,
} from './schemas'
import { findCorrectBranch, parseRemoteDataSourceUrl } from './urlUtils'

interface ValidationResult {
  isValid: boolean
  error?: string
  foundResources?: string[]
  normalizedPath?: string
  optionalSupportDiagnostics?: string[]
}

interface FileValidationConfig {
  name: string
  schema?: ZodTypeAny
  required?: boolean
  optionalSupport?: boolean
  collections?: string[]
}

const CANDIDATE_FILES: FileValidationConfig[] = [
  {
    name: 'book/book-tce.json',
    schema: OptionalClassBookDataSchema,
    required: false,
    optionalSupport: true,
  },
  { name: 'books.json', schema: BookDataSchema },
  { name: 'adventures.json', schema: GenericDataSchema, collections: ['adventure'] },
  { name: 'races.json', schema: RaceDataSchema, collections: ['race', 'subrace'] },
  { name: 'fluff-races.json', schema: GenericDataSchema, required: false },
  { name: 'fluff-backgrounds.json', schema: GenericDataSchema, required: false },
  { name: 'class/index.json', schema: IndexSchema },
  { name: 'backgrounds.json', schema: BackgroundDataSchema },
  { name: 'spells/index.json', schema: IndexSchema },
  { name: 'bestiary/index.json', schema: IndexSchema, required: false },
  { name: 'generated/gendata-spell-source-lookup.json', schema: GenericDataSchema },
  { name: 'feats.json', schema: FeatDataSchema },
  { name: 'items.json', schema: ItemDataSchema, collections: ['item', 'itemGroup'] },
  {
    name: 'items-base.json',
    schema: ItemDataSchema,
    collections: [
      'baseitem',
      'itemProperty',
      'itemType',
      'itemTypeAdditionalEntries',
      'itemEntry',
      'itemMastery',
    ],
  },
  { name: 'actions.json', schema: ActionDataSchema },
  { name: 'conditionsdiseases.json', schema: ConditionDataSchema },
  { name: 'deities.json', schema: GenericDataSchema, collections: ['deity'] },
  { name: 'skills.json', schema: GenericDataSchema, collections: ['skill'] },
  { name: 'senses.json', schema: GenericDataSchema, collections: ['sense'] },
  { name: 'languages.json', schema: LanguageDataSchema },
  {
    name: 'magicvariants.json',
    schema: GenericDataSchema,
    collections: ['magicvariant', 'variant'],
  },
  { name: 'optionalfeatures.json', schema: OptionalFeatureDataSchema },
  { name: 'psionics.json', schema: PsionicDataSchema, required: false },
  { name: 'variantrules.json', schema: GenericDataSchema, collections: ['variantrule'] },
  { name: 'trapshazards.json', schema: TrapHazardDataSchema },
  { name: 'rewards.json', schema: GenericDataSchema, collections: ['reward'] },
  { name: 'cultsboons.json', schema: GenericDataSchema, collections: ['cult', 'boon'] },
]

/** Inventory every attempt; confirmed reads are reused by the parser of the same candidate. */
export async function inspectCatalogResources(
  reader: JsonResourceReader,
  previous: readonly string[],
  signal: AbortSignal,
) {
  const reads = new Map<string, Promise<unknown>>()
  const readJson = (path: string) => {
    const pending = reads.get(path)
    if (pending) return pending
    const read = reader.readJson(path, signal)
    reads.set(path, read)
    return read
  }
  const rows = await mapWithConcurrency(CANDIDATE_FILES, 6, async (file) => {
    signal.throwIfAborted()
    const presentation = file.name.startsWith('fluff-')
    try {
      const data = await readJson(file.name)
      const valid =
        file.schema?.safeParse(data).success &&
        (!file.collections ||
          (() => {
            const rows = data as Record<string, unknown>
            const declared = file.collections.filter((key) => key in rows)
            return declared.length > 0 && declared.every((key) => Array.isArray(rows[key]))
          })())
      return {
        file,
        admitted: valid || file.optionalSupport,
        warning: !valid ? `Incompatible ${file.name}` : undefined,
        blocking: !valid && !presentation && !file.optionalSupport,
      }
    } catch (error) {
      signal.throwIfAborted()
      const detail = error instanceof Error ? error.message : String(error)
      const absent =
        error instanceof ResourceHttpError
          ? error.status === 404 || error.status === 410
          : reader.type === 'local' && /(?:^|Error: )ENOENT(?::|$)/.test(detail)
      if (absent) return { file, admitted: false }
      const optional = presentation || (file.optionalSupport && !previous.includes(file.name))
      return {
        file,
        admitted: false,
        warning: `Could not read ${file.name} — ${detail}`,
        blocking: !optional,
      }
    }
  })
  const errors = rows.flatMap((row) => (row.blocking && row.warning ? [row.warning] : []))
  if (errors.length) throw new Error(errors.join('; '))
  const resources = rows.filter((row) => row.admitted).map((row) => row.file.name)
  if (!resources.length)
    throw new Error('No compatible game data files were found at this location.')
  return {
    resources,
    warnings: rows.flatMap((row) => (row.warning ? [row.warning] : [])),
    reader: { type: reader.type, readJson },
  }
}

async function validateFile(
  reader: JsonResourceReader,
  file: FileValidationConfig,
): Promise<'valid' | 'invalid' | 'unavailable'> {
  try {
    const data = await reader.readJson(file.name)
    if (!data || typeof data !== 'object') return 'invalid'
    if (!file.schema) return 'valid'
    const result = file.schema.safeParse(data)
    if (!result.success) {
      console.warn(`Schema validation failed for ${file.name}:`, result.error)
      return 'invalid'
    }

    return 'valid'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isMalformedJson =
      error instanceof SyntaxError ||
      /(?:Unexpected (?:token|end)|Expected property|JSON\.parse|not valid JSON)/i.test(message)

    if (isMalformedJson) {
      console.warn(`Failed to validate ${file.name}:`, error)
      return 'invalid'
    }

    // Missing files are normal for partial additional-content sources. They
    // simply are not capabilities supplied by this source.
    return 'unavailable'
  }
}

export async function validateDataSource(config: DataSourceConfig): Promise<ValidationResult> {
  try {
    if (config.type !== 'bundled' && (!config.path || config.path.trim() === '')) {
      return {
        isValid: false,
        error: 'Path cannot be empty',
      }
    }

    let normalizedPath = config.path
    let persistedPath = config.path
    if (config.type === 'remote') {
      const parsedUrl = parseRemoteDataSourceUrl(config.path)
      if (parsedUrl.kind === 'invalid') {
        return { isValid: false, error: parsedUrl.error }
      }
      normalizedPath = parsedUrl.normalizedUrl
      if (parsedUrl.kind === 'github-repository' && parsedUrl.branch?.includes('/')) {
        persistedPath = config.path.trim()
      } else {
        persistedPath = normalizedPath
      }
      if (parsedUrl.kind === 'github-repository' && !parsedUrl.branch) {
        const correctBranch = await findCorrectBranch(parsedUrl.owner, parsedUrl.repo)
        normalizedPath = `https://raw.githubusercontent.com/${parsedUrl.owner}/${parsedUrl.repo}/${correctBranch}`
        persistedPath = normalizedPath
      }
    }

    const reader = createJsonResourceReader({ ...config, path: normalizedPath })
    const candidates = CANDIDATE_FILES.filter(
      (file) =>
        config.type !== 'bundled' || (!file.optionalSupport && file.name !== 'psionics.json'),
    )
    const results = await mapWithConcurrency(candidates, 6, async (file) => {
      const status = await validateFile(reader, file)
      return { name: file.name, status, optionalSupport: file.optionalSupport }
    })

    const foundResources = results.filter((result) => result.status === 'valid').map((r) => r.name)
    const invalidResources = results
      .filter((result) => result.status === 'invalid' && !result.optionalSupport)
      .map((result) => result.name)

    if (invalidResources.length > 0) {
      return {
        isValid: false,
        error: `Invalid ${invalidResources.length === 1 ? 'file' : 'files'}: ${invalidResources.join(', ')}`,
        foundResources,
        normalizedPath: persistedPath,
      }
    }

    if (foundResources.length === 0) {
      return {
        isValid: false,
        error: 'No valid 5etools data files found at this location',
        normalizedPath: persistedPath,
      }
    }

    const requiredFileNames = CANDIDATE_FILES.filter((file) => file.required !== false).map(
      (file) => file.name,
    )
    const missingRequired = requiredFileNames.filter((file) => !foundResources.includes(file))

    if (config.type === 'bundled' && missingRequired.length > 0) {
      return {
        isValid: false,
        error: `Missing required ${missingRequired.length === 1 ? 'file' : 'files'}: ${missingRequired.join(', ')}`,
        normalizedPath: persistedPath,
      }
    }

    return {
      isValid: true,
      foundResources,
      normalizedPath: persistedPath,
      optionalSupportDiagnostics: results
        .filter((result) => result.optionalSupport && result.status === 'invalid')
        .map((result) => `Optional class feature support is unavailable in ${result.name}.`),
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
