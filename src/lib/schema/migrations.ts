/**
 * Character schema versioning and migration system.
 *
 * Handles character data format changes across versions to ensure
 * backwards compatibility and smooth upgrades.
 */

import type { Character } from '@/types/character'

/**
 * Current character schema version.
 * Increment when making breaking changes to the character format.
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * Migration handler: transform character from version N to N+1.
 */
export interface Migration {
  fromVersion: number
  toVersion: number
  up: (character: unknown) => Character
  down: (character: Character) => unknown
  description: string
}

/**
 * Migration registry: maps version pairs to migration functions.
 */
const migrationMap = new Map<string, Migration>()

/**
 * Register a new migration handler.
 */
export function registerMigration(migration: Migration): void {
  const key = `${migration.fromVersion}->${migration.toVersion}`
  if (migrationMap.has(key)) {
    console.warn(`Migration ${key} already registered, overwriting`)
  }
  migrationMap.set(key, migration)
}

/**
 * Apply migrations to bring character data from any version to current version.
 * Throws if migration chain is broken or character is corrupted.
 *
 * @param character Character data at unknown version
 * @param currentVersion Current version embedded in character (if any)
 * @returns Character at CURRENT_SCHEMA_VERSION
 */
export function migrateCharacter(character: unknown, currentVersion?: number): Character {
  const startVersion = currentVersion ?? 0
  let current = character

  // Chain migrations from startVersion to CURRENT_SCHEMA_VERSION
  for (let v = startVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const key = `${v}->${v + 1}`
    const migration = migrationMap.get(key)

    if (!migration) {
      throw new Error(
        `Missing migration path: ${key}. Cannot migrate from version ${v} to ${v + 1}.`,
      )
    }

    try {
      current = migration.up(current)
    } catch (error) {
      throw new Error(
        `Migration ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Validate result is a valid Character
  if (!isValidCharacter(current)) {
    throw new Error(
      'Migration result failed character schema validation. Character data is corrupted.',
    )
  }

  return current as Character
}

/**
 * Downgrade character to a previous schema version (for rollback/export).
 * Throws if downgrade path is broken.
 *
 * @param character Character at CURRENT_SCHEMA_VERSION
 * @param targetVersion Historic version to downgrade to
 * @returns Character data at targetVersion
 */
export function downgradeCharacter(character: Character, targetVersion: number): unknown {
  if (targetVersion < 0 || targetVersion >= CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Invalid target version ${targetVersion}. Must be between 0 and ${CURRENT_SCHEMA_VERSION - 1}.`,
    )
  }

  let current: unknown = character

  // Chain migrations backwards
  for (let v = CURRENT_SCHEMA_VERSION - 1; v >= targetVersion; v--) {
    const key = `${v}->${v + 1}`
    const migration = migrationMap.get(key)

    if (!migration) {
      throw new Error(`Missing migration path for downgrade: ${key}`)
    }

    try {
      current = migration.down(current as Character)
    } catch (error) {
      throw new Error(
        `Downgrade migration ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return current
}

/**
 * Convert a semver string (e.g. '1.0.0') or a legacy numeric version to the
 * integer major version used by the migration chain. Returns 0 for anything
 * unrecognised so that the migration chain always runs at least once on old data.
 */
export function semverToMigrationVersion(version: unknown): number {
  if (typeof version === 'number') return Math.floor(version)
  if (typeof version === 'string') {
    const major = parseInt(version.split('.')[0], 10)
    return Number.isFinite(major) && major > 0 ? major : 0
  }
  return 0
}

/**
 * Check if object is a valid Character (minimal validation).
 * Use this for quick sanity checks; use characterPersistenceSchema for full validation.
 */
function isValidCharacter(obj: unknown): obj is Character {
  if (typeof obj !== 'object' || obj === null) return false
  const c = obj as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    // Accept both semver strings ('1.0.0') and legacy numeric versions (1)
    (typeof c.version === 'string' || typeof c.version === 'number')
  )
}

/**
 * Get migration history as human-readable description.
 */
export function getMigrationSummary(): string {
  const migrations = Array.from(migrationMap.values())
    .sort((a, b) => a.fromVersion - b.fromVersion)
    .map((m) => `  v${m.fromVersion} -> v${m.toVersion}: ${m.description}`)
    .join('\n')

  return migrations || 'No migrations registered.'
}

// ---------------------------------------------------------------------------
// Registered migrations
// ---------------------------------------------------------------------------

/**
 * v0 → v1: Initial schema version.
 * Characters created before versioning was introduced (version undefined / 0)
 * are valid as-is — just stamp them with the current schema version.
 */
registerMigration({
  fromVersion: 0,
  toVersion: 1,
  description: 'Initial schema version — stamp legacy characters without structural changes.',
  up: (character) => {
    const c = character as unknown as Record<string, unknown>
    return { ...c, version: '1.0.0' } as Character
  },
  down: (character) => {
    const c = character as unknown as Record<string, unknown>
    const { version: _v, ...rest } = c
    return rest
  },
})
