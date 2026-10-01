import { describe, expect, test } from 'vitest'
import {
  duplicateCharacter,
  getDuplicateCharacterName,
  getImportedCharacterName,
  prepareCharacterDownload,
  prepareCharacterImport,
  prepareLibraryDownload,
  prepareUnsupportedCharacterDownloads,
} from '@/lib/character/characterTransfer'
import { validateCharacterData } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function makeUsedCharacter() {
  return makeCharacterFixture({
    id: 'source-character',
    name: 'Source Hero',
    race: 'Test Lineage',
    raceSource: 'TEST',
    portrait: 'data:image/png;base64,example',
    hitPoints: { current: 7, temporary: 3 },
    hitPointsInitialized: true,
    inspiration: true,
    deathSaves: { successes: 2, failures: 1 },
    conditions: ['test condition'],
    exhaustion: 2,
    hitDiceUsed: { 'fighter|phb': 1 },
    classResources: { 'test-resource': 2 },
    spells: {
      ...makeCharacterFixture().spells,
      spellSlots: { 1: { max: 3, used: 2 } },
      pactSpellSlots: { 1: { max: 1, used: 1 } },
    },
  })
}

describe('character transfer', () => {
  test('creates an independent exact copy with fresh identity metadata', () => {
    const source = makeUsedCharacter()
    const copy = duplicateCharacter(source, {
      id: 'exact-copy',
      name: 'Source Hero (Copy)',
      now: '2026-09-15T00:00:00.000Z',
    })

    expect(copy).toMatchObject({
      id: 'exact-copy',
      name: 'Source Hero (Copy)',
      hitPoints: source.hitPoints,
      conditions: source.conditions,
      createdAt: '2026-09-15T00:00:00.000Z',
      lastModified: '2026-09-15T00:00:00.000Z',
    })
    copy.hitPoints.current = 1
    expect(source.hitPoints.current).toBe(7)
  })

  test('generates collision-free copy names', () => {
    expect(getDuplicateCharacterName('Hero', ['Hero (Copy)'])).toBe('Hero (Copy 2)')
    expect(getDuplicateCharacterName('Hero', ['Hero (Copy)', 'Hero (Copy 2)'])).toBe(
      'Hero (Copy 3)',
    )
  })

  test('exports complete character records and round-trips a versioned library backup', () => {
    const first = makeUsedCharacter()
    const second = makeCharacterFixture({ id: 'second', name: 'Second/Hero' })
    const single = prepareCharacterDownload(second)
    expect(single.filename).toBe('Second_Hero.tbc')
    expect(JSON.parse(single.text)).toEqual(second)
    expect(JSON.parse(prepareCharacterDownload(first).text).portrait).toBe(first.portrait)

    const backup = prepareLibraryDownload([first, second], '2026-09-28T10:00:00.000Z')
    expect(backup.filename).toBe('tavern-born-library-2026-09-28.tbclib')
    const parsed = prepareCharacterImport(backup.text, backup.filename, validateCharacterData)
    expect(parsed.isLibraryBackup).toBe(true)
    expect(parsed.failures).toEqual([])
    expect(parsed.characters.map((entry) => entry.character)).toEqual([first, second])
    expect(parsed.characters[0]?.character.portrait).toBe(first.portrait)
    expect(parsed.characters[0]?.character.raceSource).toBe('TEST')
  })

  test('keeps valid backup entries when another entry fails validation', () => {
    const valid = makeUsedCharacter()
    const backup = JSON.stringify({
      kind: 'tavern-born-library',
      version: 1,
      exportedAt: '2026-09-28T10:00:00.000Z',
      characters: [valid, { ...valid, name: 'Broken', proficiencies: { weapons: [{}] } }],
    })
    const prepared = prepareCharacterImport(backup, 'party.tbclib', validateCharacterData)

    expect(prepared.characters.map((entry) => entry.character.name)).toEqual(['Source Hero'])
    expect(prepared.failures).toEqual([
      expect.objectContaining({
        label: 'party.tbclib · Broken',
        kind: 'validation',
      }),
    ])
    expect(prepareCharacterImport('{broken', 'broken.tbc', validateCharacterData).failures).toEqual(
      [expect.objectContaining({ kind: 'parse' })],
    )
    expect(
      prepareCharacterImport(
        JSON.stringify({ kind: 'tavern-born-library', version: 99, characters: [valid] }),
        'future.tbclib',
        validateCharacterData,
      ).failures,
    ).toEqual([expect.objectContaining({ kind: 'format' })])
  })

  test('prepares collision-free imported names and unsupported backups', () => {
    expect(getImportedCharacterName('Hero', ['hero'])).toBe('Hero (Imported)')
    expect(getImportedCharacterName('Hero', ['hero', 'HERO (IMPORTED)'])).toBe('Hero (Imported 2)')
    expect(getImportedCharacterName('Other', ['Hero'])).toBe('Other')
    const longName = 'H'.repeat(100)
    const firstCollision = getImportedCharacterName(longName, [longName])
    const secondCollision = getImportedCharacterName(longName, [longName, firstCollision])
    expect(firstCollision).toHaveLength(100)
    expect(secondCollision).toHaveLength(100)
    expect(firstCollision).toMatch(/ \(Imported\)$/)
    expect(secondCollision).toMatch(/ \(Imported 2\)$/)
    expect(
      prepareUnsupportedCharacterDownloads([
        { name: 'Old/Hero', schemaVersion: 0 },
        { name: 'Another', schemaVersion: 0 },
      ]).map((file) => file.filename),
    ).toEqual(['Old_Hero-legacy-backup-1.tbc', 'Another-legacy-backup-2.tbc'])
  })
})
