import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  downgradeCharacter,
  getMigrationSummary,
  migrateCharacter,
  semverToMigrationVersion,
} from '@/lib/schema/migrations'

// The baseline 0→1 migration is registered by importing the module.
// No additional setup needed — the module side-effect registers it.

describe('semverToMigrationVersion', () => {
  it('converts semver string "1.0.0" to 1', () => {
    expect(semverToMigrationVersion('1.0.0')).toBe(1)
  })

  it('converts "2.3.1" to its major version 2', () => {
    expect(semverToMigrationVersion('2.3.1')).toBe(2)
  })

  it('passes through a numeric version unchanged', () => {
    expect(semverToMigrationVersion(1)).toBe(1)
    expect(semverToMigrationVersion(0)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(semverToMigrationVersion(undefined)).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(semverToMigrationVersion(null)).toBe(0)
  })

  it('returns 0 for a non-numeric string', () => {
    expect(semverToMigrationVersion('bad')).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    expect(semverToMigrationVersion('')).toBe(0)
  })
})

describe('CURRENT_SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(typeof CURRENT_SCHEMA_VERSION).toBe('number')
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0)
  })
})

describe('migrateCharacter', () => {
  const baseCharacter = {
    id: 'test-id',
    name: 'Test Hero',
    version: 0,
  }

  it('migrates a version-0 character to current schema version', () => {
    const result = migrateCharacter(baseCharacter, 0)
    expect(result).toBeDefined()
    expect(result.id).toBe('test-id')
    expect(result.name).toBe('Test Hero')
    // The 0→1 migration chain stamps the version as '1.0.0'
    expect(result.version).toBe('2.0.0')
    expect(result.originSystem).toBe('2014')
  })

  it('is a no-op when character is already at current version', () => {
    const current = { ...baseCharacter, version: CURRENT_SCHEMA_VERSION }
    // migrateCharacter(character, CURRENT_SCHEMA_VERSION) should return
    // without running any migrations (loop condition is startVersion < CURRENT).
    // Result must still be a valid Character with an id.
    const result = migrateCharacter(current, CURRENT_SCHEMA_VERSION)
    expect(result.id).toBe('test-id')
  })

  it('preserves extra character fields through migration', () => {
    const withExtras = { ...baseCharacter, race: 'Elf', level: 5, version: 0 }
    const result = migrateCharacter(withExtras, 0)
    expect((result as unknown as Record<string, unknown>).race).toBe('Elf')
    expect((result as unknown as Record<string, unknown>).level).toBe(5)
  })

  it('infers 2024 origin system from background-origin provenance', () => {
    const result = migrateCharacter(
      {
        ...baseCharacter,
        version: 1,
        backgroundAsiBlockIndex: 0,
      },
      1,
    )

    expect(result.originSystem).toBe('2024')
    expect(result.version).toBe('2.0.0')
  })

  it('throws when migration result is missing required fields (id/name)', () => {
    // An empty object gets version stamped via the 0→1 migration,
    // but lacks id and name — isValidCharacter rejects it
    expect(() => migrateCharacter({}, 0)).toThrow(/schema validation|corrupted/i)
  })
})

describe('getMigrationSummary', () => {
  it('returns a non-empty string when migrations are registered', () => {
    const summary = getMigrationSummary()
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(0)
    expect(summary).toContain('v0 -> v1')
  })
})

describe('downgradeCharacter', () => {
  it('downgrades current schema character to version 0 shape', () => {
    const migrated = migrateCharacter(
      {
        id: 'downgrade-id',
        name: 'Downgrade Hero',
        version: 0,
        race: 'Elf',
      },
      0,
    )

    const downgraded = downgradeCharacter(migrated, 0) as Record<string, unknown>

    expect(downgraded.id).toBe('downgrade-id')
    expect(downgraded.name).toBe('Downgrade Hero')
    expect(downgraded.version).toBeUndefined()
  })

  it('throws for invalid downgrade target versions', () => {
    const migrated = migrateCharacter(
      {
        id: 'downgrade-id',
        name: 'Downgrade Hero',
        version: 0,
      },
      0,
    )

    expect(() => downgradeCharacter(migrated, -1)).toThrow(/invalid target/i)
    expect(() => downgradeCharacter(migrated, CURRENT_SCHEMA_VERSION)).toThrow(/invalid target/i)
  })
})
