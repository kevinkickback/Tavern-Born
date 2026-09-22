import type { ZodTypeAny } from 'zod'
import type { DataSourceConfig } from '@/types/5etools'
import { createJsonResourceReader, type JsonResourceReader } from './resourceReader'
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
  OptionalFeatureDataSchema,
  RaceDataSchema,
} from './schemas'
import { findCorrectBranch, parseRemoteDataSourceUrl } from './urlUtils'

interface ValidationResult {
  isValid: boolean
  error?: string
  foundResources?: string[]
  normalizedPath?: string
}

interface FileValidationConfig {
  name: string
  schema?: ZodTypeAny
  required?: boolean
}

const CANDIDATE_FILES: FileValidationConfig[] = [
  { name: 'books.json', schema: BookDataSchema },
  { name: 'adventures.json', schema: GenericDataSchema },
  { name: 'races.json', schema: RaceDataSchema },
  { name: 'fluff-races.json', schema: GenericDataSchema, required: false },
  { name: 'fluff-backgrounds.json', schema: GenericDataSchema, required: false },
  { name: 'class/index.json', schema: IndexSchema },
  { name: 'backgrounds.json', schema: BackgroundDataSchema },
  { name: 'spells/index.json', schema: IndexSchema },
  { name: 'bestiary/index.json', schema: IndexSchema, required: false },
  { name: 'generated/gendata-spell-source-lookup.json', schema: GenericDataSchema },
  { name: 'feats.json', schema: FeatDataSchema },
  { name: 'items.json', schema: ItemDataSchema },
  { name: 'items-base.json', schema: ItemDataSchema },
  { name: 'actions.json', schema: ActionDataSchema },
  { name: 'conditionsdiseases.json', schema: ConditionDataSchema },
  { name: 'deities.json', schema: GenericDataSchema },
  { name: 'skills.json', schema: GenericDataSchema },
  { name: 'senses.json', schema: GenericDataSchema },
  { name: 'languages.json', schema: LanguageDataSchema },
  { name: 'magicvariants.json', schema: GenericDataSchema },
  { name: 'optionalfeatures.json', schema: OptionalFeatureDataSchema },
  { name: 'variantrules.json', schema: GenericDataSchema },
  { name: 'trapshazards.json', schema: GenericDataSchema },
  { name: 'rewards.json', schema: GenericDataSchema },
  { name: 'cultsboons.json', schema: GenericDataSchema },
]

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
    const results = await Promise.all(
      CANDIDATE_FILES.map(async (file) => {
        const status = await validateFile(reader, file)
        return { name: file.name, status }
      }),
    )

    const foundResources = results.filter((result) => result.status === 'valid').map((r) => r.name)
    const invalidResources = results
      .filter((result) => result.status === 'invalid')
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
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
