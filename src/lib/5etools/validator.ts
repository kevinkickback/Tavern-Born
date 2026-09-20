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
}

const REQUIRED_FILES: FileValidationConfig[] = [
  { name: 'books.json', schema: BookDataSchema },
  { name: 'races.json', schema: RaceDataSchema },
  { name: 'class/index.json', schema: IndexSchema },
  { name: 'backgrounds.json', schema: BackgroundDataSchema },
  { name: 'spells/index.json', schema: IndexSchema },
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
]

async function validateFile(
  reader: JsonResourceReader,
  file: FileValidationConfig,
): Promise<boolean> {
  try {
    const data = await reader.readJson(file.name)
    if (!data || typeof data !== 'object') return false
    if (!file.schema) return true
    const result = file.schema.safeParse(data)
    if (!result.success) {
      console.warn(`Schema validation failed for ${file.name}:`, result.error)
      return false
    }

    return true
  } catch (error) {
    console.warn(`Failed to validate ${file.name}:`, error)
    return false
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
      REQUIRED_FILES.map(async (file) => {
        const isValid = await validateFile(reader, file)
        return { name: file.name, isValid }
      }),
    )

    const foundResources = results.filter((r) => r.isValid).map((r) => r.name)

    if (foundResources.length === 0) {
      return {
        isValid: false,
        error: 'No valid 5etools data files found at this location',
        normalizedPath: persistedPath,
      }
    }

    const requiredFileNames = REQUIRED_FILES.map((f) => f.name)
    const foundRequired = requiredFileNames.filter((f) => foundResources.includes(f))
    const missingRequired = requiredFileNames.filter((f) => !foundResources.includes(f))

    if (foundRequired.length < requiredFileNames.length) {
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
