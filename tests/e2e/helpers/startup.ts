import { expect, type Page } from '@playwright/test'
import type { GameData } from '@/types/5etools'

const MINIMAL_GAME_DATA: GameData = {
  races: [],
  classes: [],
  backgrounds: [],
  spells: [],
  feats: [],
  items: [],
  itemsBase: [],
  classFeatures: [],
  actions: [],
  conditions: [],
  deities: [],
  skills: [],
  senses: [],
  languages: [],
  magicvariants: [],
  optionalfeatures: [],
  variantrules: [],
  sources: [],
}

async function seedStartupDataSource(
  page: Page,
  sourcePath: string,
  gameData: GameData = MINIMAL_GAME_DATA,
) {
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ cacheSeed, configSeed }) => {
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
        cachedAt: now,
        sourceSnapshot: { type: 'remote', path: sourcePath },
      },
      configSeed: {
        state: {
          dataSourceConfig: {
            type: 'remote',
            path: sourcePath,
            isValid: true,
            lastLoaded: now,
          },
          lastLoadedAt: now,
        },
        version: 0,
      },
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
  const startupHeading = page
    .getByRole('heading', { name: /Welcome to Tavern Born|Data Source Setup/i })
    .first()

  if (await startupHeading.isVisible().catch(() => false)) {
    await seedStartupDataSource(page, sourcePath, gameData)
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

  // App header reflects active character when load has completed.
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}
