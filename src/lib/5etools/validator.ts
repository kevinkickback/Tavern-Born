import type { ZodTypeAny } from 'zod'
import type { DataSourceConfig } from '@/types/5etools'
import {
  ActionDataSchema,
  BackgroundDataSchema,
  BookDataSchema,
  ClassIndexSchema,
  ConditionDataSchema,
  FeatDataSchema,
  GenericDataSchema,
  ItemDataSchema,
  LanguageDataSchema,
  OptionalFeatureDataSchema,
  RaceDataSchema,
} from './schemas'
import { findCorrectBranch, normalizeGitHubUrl } from './urlUtils'

interface ValidationResult {
  isValid: boolean
  error?: string
  foundResources?: string[]
  normalizedPath?: string
}

interface FileValidationConfig {
  name: string
  path: string
  schema?: ZodTypeAny
}

const REQUIRED_FILES: FileValidationConfig[] = [
  { name: 'books.json', path: 'data/books.json', schema: BookDataSchema },
  { name: 'races.json', path: 'data/races.json', schema: RaceDataSchema },
  {
    name: 'class/index.json',
    path: 'data/class/index.json',
    schema: ClassIndexSchema,
  },
  {
    name: 'backgrounds.json',
    path: 'data/backgrounds.json',
    schema: BackgroundDataSchema,
  },
  {
    name: 'spells/index.json',
    path: 'data/spells/index.json',
    schema: ClassIndexSchema,
  },
  { name: 'feats.json', path: 'data/feats.json', schema: FeatDataSchema },
  { name: 'items.json', path: 'data/items.json', schema: ItemDataSchema },
  {
    name: 'items-base.json',
    path: 'data/items-base.json',
    schema: ItemDataSchema,
  },
  { name: 'actions.json', path: 'data/actions.json', schema: ActionDataSchema },
  {
    name: 'conditionsdiseases.json',
    path: 'data/conditionsdiseases.json',
    schema: ConditionDataSchema,
  },
  {
    name: 'deities.json',
    path: 'data/deities.json',
    schema: GenericDataSchema,
  },
  { name: 'skills.json', path: 'data/skills.json', schema: GenericDataSchema },
  { name: 'senses.json', path: 'data/senses.json', schema: GenericDataSchema },
  {
    name: 'languages.json',
    path: 'data/languages.json',
    schema: LanguageDataSchema,
  },
  {
    name: 'magicvariants.json',
    path: 'data/magicvariants.json',
    schema: GenericDataSchema,
  },
  {
    name: 'optionalfeatures.json',
    path: 'data/optionalfeatures.json',
    schema: OptionalFeatureDataSchema,
  },
  {
    name: 'variantrules.json',
    path: 'data/variantrules.json',
    schema: GenericDataSchema,
  },
]

async function validateLocalFile(basePath: string, file: FileValidationConfig): Promise<boolean> {
  try {
    // file.name is relative to the data folder (e.g. 'books.json', 'class/index.json')
    const sep = basePath.includes('\\') ? '\\' : '/'
    const fullPath = `${basePath}${sep}${file.name.replace(/\//g, sep)}`
    const readLocalJson = window.electronAPI?.readLocalJson
    if (!readLocalJson) return false
    const data = await readLocalJson(fullPath)
    if (!data || typeof data !== 'object') return false
    if (file.schema) {
      try {
        file.schema.parse(data)
      } catch {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

async function validateFileStructure(url: string, file: FileValidationConfig): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return false
    }

    const contentType = response.headers.get('content-type')
    if (
      contentType &&
      !contentType.includes('application/json') &&
      !contentType.includes('text/plain')
    ) {
      return false
    }

    const data = await response.json()

    if (!data || typeof data !== 'object') {
      return false
    }

    if (file.schema) {
      try {
        file.schema.parse(data)
        return true
      } catch (error) {
        console.warn(`Schema validation failed for ${file.name}:`, error)
        return false
      }
    }

    return true
  } catch (error) {
    console.warn(`Failed to validate ${file.name}:`, error)
    return false
  }
}

function buildFileUrl(basePath: string, filePath: string): string {
  return `${basePath}${basePath.endsWith('/') ? '' : '/'}${filePath}`
}

export async function validateDataSource(config: DataSourceConfig): Promise<ValidationResult> {
  try {
    if (!config.path || config.path.trim() === '') {
      return {
        isValid: false,
        error: 'Path cannot be empty',
      }
    }

    if (config.type === 'remote') {
      try {
        const url = new URL(config.path)
        if (!['http:', 'https:'].includes(url.protocol)) {
          return {
            isValid: false,
            error: 'URL must use HTTP or HTTPS protocol',
          }
        }
      } catch {
        return {
          isValid: false,
          error: 'Invalid URL format',
        }
      }
    }

    let normalizedPath = config.path
    if (config.type === 'remote') {
      const initialNormalized = normalizeGitHubUrl(config.path)

      const url = new URL(config.path)
      if (
        url.hostname.includes('github.com') &&
        !url.pathname.includes('/tree/') &&
        !url.pathname.includes('/blob/')
      ) {
        const pathParts = url.pathname.split('/').filter(Boolean)
        if (pathParts.length >= 2) {
          const owner = pathParts[0]
          const repo = pathParts[1]
          const correctBranch = await findCorrectBranch(owner, repo)
          normalizedPath = `https://raw.githubusercontent.com/${owner}/${repo}/${correctBranch}`
        } else {
          normalizedPath = initialNormalized
        }
      } else {
        normalizedPath = initialNormalized
      }
    }

    const foundResources: string[] = []
    const validationPromises = REQUIRED_FILES.map(async (file) => {
      let isValid: boolean
      if (config.type === 'local') {
        isValid = await validateLocalFile(normalizedPath, file)
      } else {
        const url = buildFileUrl(normalizedPath, file.path)
        isValid = await validateFileStructure(url, file)
      }
      if (isValid) foundResources.push(file.name)
      return { file: file.name, isValid }
    })

    await Promise.all(validationPromises)

    if (foundResources.length === 0) {
      return {
        isValid: false,
        error: 'No valid 5etools data files found at this location',
        normalizedPath,
      }
    }

    const requiredFileNames = REQUIRED_FILES.map((f) => f.name)
    const foundRequired = requiredFileNames.filter((f) => foundResources.includes(f))
    const missingRequired = requiredFileNames.filter((f) => !foundResources.includes(f))

    if (foundRequired.length < requiredFileNames.length) {
      return {
        isValid: false,
        error: `Missing required ${missingRequired.length === 1 ? 'file' : 'files'}: ${missingRequired.join(', ')}`,
        normalizedPath,
      }
    }

    return {
      isValid: true,
      foundResources,
      normalizedPath,
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
