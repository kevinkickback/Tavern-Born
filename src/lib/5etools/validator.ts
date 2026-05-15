import type { ZodTypeAny } from 'zod'
import type { DataSourceConfig } from '@/types/5etools'
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
import { findCorrectBranch, normalizeGitHubUrl } from './urlUtils'

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
      const result = file.schema.safeParse(data)
      if (!result.success) {
        console.warn(`Schema validation failed for ${file.name}:`, result.error)
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

async function validateRemoteFile(basePath: string, file: FileValidationConfig): Promise<boolean> {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`
  const url = `${base}data/${file.name}`
  try {
    // HEAD first: fast existence + content-type check with no body download
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    })
    if (!headResponse.ok) return false

    const contentType = headResponse.headers.get('content-type')
    if (
      contentType &&
      !contentType.includes('application/json') &&
      !contentType.includes('text/plain')
    ) {
      return false
    }

    if (!file.schema) return true

    // GET only when a schema must be validated
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return false

    const data = await response.json()
    if (!data || typeof data !== 'object') return false

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

    const results = await Promise.all(
      REQUIRED_FILES.map(async (file) => {
        const isValid =
          config.type === 'local'
            ? await validateLocalFile(normalizedPath, file)
            : await validateRemoteFile(normalizedPath, file)
        return { name: file.name, isValid }
      }),
    )

    const foundResources = results.filter((r) => r.isValid).map((r) => r.name)

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
