import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, selectCharacterFromHome } from './helpers/startup'

async function closeStartupModalIfOpen(page: import('@playwright/test').Page) {
  const closeButton = page.getByRole('button', { name: 'Close' })
  if ((await closeButton.count()) > 0) {
    try {
      await closeButton.first().click({ timeout: 1500 })
    } catch {
      // Modal may self-close during hydration; safe to ignore transient close races.
    }
  }
}

test('equipment page supports equip/attune/quantity and weight updates', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.dndchar')
  const character = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
    id: string
  }

  await page.goto('/')
  await closeStartupModalIfOpen(page)

  await page.evaluate(
    async ({ characterSeed, cacheSeed }) => {
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
          store.put(characterSeed, 'character-storage')
          store.put(cacheSeed, 'tb:game-data-cache')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    {
      characterSeed: {
        state: {
          characters: [character],
          activeCharacterId: character.id,
        },
        version: 0,
      },
      cacheSeed: {
        data: {
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
          magicvariants: [],
          optionalfeatures: [],
          variantrules: [],
          sources: [],
        },
        cachedAt: new Date().toISOString(),
        sourceSnapshot: { type: 'remote', path: 'e2e-seeded' },
      },
    },
  )

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-seeded')

  await selectCharacterFromHome(page, 'Equipment E2E Hero')

  await page.getByRole('link', { name: 'Equipment' }).click()
  await expect(page).toHaveURL(/\/equipment$/)

  await expect(page.getByText('Inventory', { exact: true })).toBeVisible()
  await expect(page.getByText('5.0 / 150 lb')).toBeVisible()
  await expect(page.getByText('0 / 3')).toBeVisible()

  const row = page.locator('div.rounded-lg.border').filter({ hasText: 'Ring of Testing' }).first()

  // Increase quantity and verify derived weight updates.
  // Use JS click to bypass card overlay intercepting pointer events.
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('div.rounded-lg.border'))
    const targetRow = rows.find((r) => r.textContent?.includes('Ring of Testing'))
    const btn = targetRow
      ? Array.from(targetRow.querySelectorAll('button')).find((b) => b.textContent?.trim() === '+')
      : null
    if (btn) (btn as HTMLButtonElement).click()
  })
  await expect(page.getByText('10.0 / 150 lb')).toBeVisible()

  // Toggle equip and attune switches, then verify attunement counter increments.
  const switches = row.getByRole('switch')
  await switches.nth(0).dispatchEvent('click')
  await switches.nth(1).dispatchEvent('click')
  await expect(page.getByText('1 / 3')).toBeVisible()
})
