import { describe, expect, test } from 'vitest'
import { migrateGameDataPersistedState } from '@/store/gameDataStore'

describe('game data source persistence migration', () => {
  test('preserves legacy local and remote source configurations', () => {
    const localState = {
      dataSourceConfig: { type: 'local', path: 'C:\\5etools\\data', isValid: true },
    }
    const remoteState = {
      dataSourceConfig: { type: 'remote', path: 'https://example.com/5etools', isValid: true },
    }

    expect(migrateGameDataPersistedState(localState)).toBe(localState)
    expect(migrateGameDataPersistedState(remoteState)).toBe(remoteState)
  })

  test('preserves valid external resource inventories', () => {
    const state = {
      dataSourceConfig: {
        type: 'remote',
        path: 'https://example.com/5etools',
        isValid: true,
        availableResources: ['feats.json', 'class/index.json'],
      },
    }

    expect(migrateGameDataPersistedState(state)).toBe(state)
  })

  test('preserves bundled sources only when stable pack identity is present', () => {
    const bundledState = {
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
    }

    expect(migrateGameDataPersistedState(bundledState)).toBe(bundledState)
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: { type: 'bundled', path: 'srd/core', isValid: true },
      }),
    ).toEqual({ dataSourceConfig: null })
  })

  test('drops malformed source configurations without disturbing other persisted fields', () => {
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: { type: 'local', path: 42, isValid: true },
        lastLoadedAt: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      dataSourceConfig: null,
      lastLoadedAt: '2026-09-19T00:00:00.000Z',
    })
  })

  test.each([
    42,
    null,
    ['feats.json', 42],
  ])('drops malformed external resource inventory %j', (availableResources) => {
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: {
          type: 'remote',
          path: 'https://example.com/5etools',
          isValid: true,
          availableResources,
        },
        lastLoadedAt: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      dataSourceConfig: null,
      lastLoadedAt: '2026-09-19T00:00:00.000Z',
    })
  })
})
