import { expect, type Page } from '@playwright/test'
import { GAME_DATA_CACHE_SCHEMA_VERSION } from '@/lib/storage/dataCache'
import type { DataSourceConfig, GameData } from '@/types/5etools'

export const MINIMAL_GAME_DATA: GameData = {
  races: [],
  classes: [],
  backgrounds: [],
  spells: [],
  feats: [],
  items: [],
  itemsBase: [],
  itemProperties: [],
  itemTypes: [],
  classFeatures: [],
  actions: [],
  conditions: [],
  deities: [],
  skills: [],
  senses: [],
  languages: [],
  optionalfeatures: [],
  variantrules: [],
  trapHazards: [],
  rewards: [],
  cultsBoons: [],
  organizations: [],
  sources: [],
}

interface AppStateSeed {
  sourcePath: string
  dataSourceConfig?: DataSourceConfig
  gameData?: GameData
  characters?: unknown[]
  activeCharacterId?: string | null
}

/**
 * Seeds the persisted browser state used by the real app, without mocking its stores.
 * Call this only after the page has visited the app origin, then reload before asserting UI.
 */
export async function seedAppState(
  page: Page,
  {
    sourcePath,
    dataSourceConfig,
    gameData = MINIMAL_GAME_DATA,
    characters,
    activeCharacterId = null,
  }: AppStateSeed,
) {
  // Let the app finish hydrating its persisted stores before replacing them.
  // Otherwise the first render can write its older in-memory state over this seed.
  const loadingOverlay = page.getByTestId('app-loading-overlay')
  if ((await loadingOverlay.count()) > 0) {
    await expect(loadingOverlay).toHaveAttribute('data-phase', /ready|fading/, {
      timeout: 10_000,
    })
  }

  const now = new Date().toISOString()
  const resolvedConfig: DataSourceConfig = dataSourceConfig ?? {
    type: 'remote',
    path: sourcePath,
    isValid: true,
  }
  const bundledManifest =
    resolvedConfig.type === 'bundled'
      ? null
      : await page.evaluate(async () => {
          try {
            return await window.electronAPI?.getBundledManifest()
          } catch {
            return null
          }
        })
  const sourceSnapshot =
    resolvedConfig.type === 'bundled'
      ? {
          type: resolvedConfig.type,
          path: resolvedConfig.path,
          packId: resolvedConfig.packId,
          packVersion: resolvedConfig.packVersion,
        }
      : {
          type: resolvedConfig.type,
          path: resolvedConfig.path,
          ...(resolvedConfig.availableResources
            ? { resources: [...new Set(resolvedConfig.availableResources)].sort() }
            : {}),
          ...(bundledManifest
            ? {
                layers: [
                  {
                    role: 'base',
                    type: 'bundled',
                    path: 'srd/core',
                    packId: bundledManifest.packId,
                    packVersion: bundledManifest.packVersion,
                  },
                  {
                    role: 'additional',
                    type: resolvedConfig.type,
                    path: resolvedConfig.path,
                    ...(resolvedConfig.availableResources
                      ? {
                          resources: [...new Set(resolvedConfig.availableResources)].sort(),
                        }
                      : {}),
                  },
                ],
              }
            : {}),
        }

  await page.evaluate(
    async ({ cacheSeed, configSeed, characterSeed }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onerror = () => reject(request.error)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('keyval')) {
            db.createObjectStore('keyval')
          }
        }
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('keyval', 'readwrite')
          const store = tx.objectStore('keyval')
          store.put(cacheSeed, 'tb:game-data-cache')
          store.put(configSeed, 'game-data-storage')
          if (characterSeed) store.put(characterSeed, 'character-storage')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    {
      cacheSeed: {
        data: gameData,
        cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION,
        cachedAt: now,
        sourceSnapshot,
      },
      configSeed: {
        state: {
          dataSourceConfig: { ...resolvedConfig, lastLoaded: now },
          lastLoadedAt: now,
        },
        version: 0,
      },
      characterSeed: characters
        ? {
            state: { characters, activeCharacterId },
            version: 0,
          }
        : null,
    },
  )
}

/**
 * Resolves the startup data-source modal by seeding a minimal config/cache and reloading.
 */
export async function ensureStartupPromptResolved(
  page: Page,
  sourcePath = 'e2e-startup-seeded',
  gameData: GameData = MINIMAL_GAME_DATA,
) {
  const hasPersistedCache = await page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onerror = () => reject(request.error)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('keyval')) {
            db.createObjectStore('keyval')
          }
        }
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('keyval', 'readonly')
          const read = tx.objectStore('keyval').get('tb:game-data-cache')
          read.onerror = () => reject(read.error)
          read.onsuccess = () => {
            resolve(Boolean(read.result))
            db.close()
          }
        }
      }),
  )

  const startupHeading = page
    .getByRole('heading', {
      name: /Welcome to Tavern Born|Game Data Setup|Choose Game Data/i,
    })
    .first()

  const startupVisible = hasPersistedCache
    ? false
    : await startupHeading
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false)

  if (startupVisible) {
    await seedAppState(page, { sourcePath, gameData })
    await page.reload()
  }

  await startupHeading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
    // Some runs may not render the modal in the first place.
  })
}

export async function selectCharacterFromHome(page: Page, name: string) {
  const cardTitle = page.locator('h3').filter({ hasText: name }).first()
  await expect(cardTitle).toBeVisible()
  await cardTitle.click()

  await expect(page.getByRole('banner').getByText(name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Builder' }).click()
  await expect(page.getByRole('complementary', { name: 'Builder navigation' })).toBeVisible()
}

export function readPersistedCharacters(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('keyval', 'readonly')
          const read = tx.objectStore('keyval').get('character-storage')
          read.onerror = () => reject(read.error)
          read.onsuccess = () => {
            const payload = read.result as { state?: { characters?: unknown[] } } | undefined
            resolve(payload?.state?.characters ?? [])
            db.close()
          }
        }
      }),
  )
}
