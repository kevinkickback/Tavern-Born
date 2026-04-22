import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, selectCharacterFromHome } from './helpers/startup'

test('import -> edit portrait -> save -> reload persists character changes', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.dndchar')
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
    id: string
    name: string
  }

  const baseCharacter = {
    id: 'lifecycle-seed-1',
    version: '2.0.0',
    name: 'Seed Character',
    originSystem: '2014',
    race: 'Human',
    class: 'Fighter',
    background: 'Soldier',
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    level: 1,
    experiencePoints: 0,
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      skills: [],
      languages: ['Common'],
      savingThrows: [],
    },
    features: [],
    feats: [],
    spells: {
      spellProfiles: [
        {
          id: 'special:unrestricted',
          type: 'special',
          label: 'Special (Unrestricted)',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ],
      spellSlots: {
        1: { max: 0, used: 0 },
        2: { max: 0, used: 0 },
        3: { max: 0, used: 0 },
        4: { max: 0, used: 0 },
        5: { max: 0, used: 0 },
        6: { max: 0, used: 0 },
        7: { max: 0, used: 0 },
        8: { max: 0, used: 0 },
        9: { max: 0, used: 0 },
      },
    },
    equipment: [],
    hitPoints: { max: 10, current: 10, temporary: 0 },
    armorClass: 10,
    initiative: 0,
    speed: 30,
    savingThrows: {
      strength: { proficient: false, bonus: 0 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: false, bonus: 0 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 0 },
      charisma: { proficient: false, bonus: 0 },
    },
    skills: {},
    details: {},
    provenance: {
      proficiencies: {
        armor: {},
        weapons: {},
        tools: {},
        languages: {},
        skills: {},
        savingThrows: {},
      },
      abilityBonuses: [],
      features: {},
      feats: {},
      spells: {},
      equipment: {},
      choices: [],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-01T00:00:00.000Z',
  }

  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-lifecycle-seed')

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
          characters: [baseCharacter],
          activeCharacterId: null,
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
        sourceSnapshot: { type: 'remote', path: 'e2e-lifecycle-seed' },
      },
    },
  )

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-lifecycle-seed')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(fixturePath)

  await expect(page.getByText(fixture.name).first()).toBeVisible()
  await selectCharacterFromHome(page, fixture.name)
  await page.getByRole('button', { name: 'Details' }).click()
  await page.getByRole('link', { name: 'Portrait' }).click()
  await expect(page).toHaveURL(/\/details\/portrait$/)

  const placeholderButton = page
    .locator('button', {
      has: page.locator('img[alt="Placeholder 1"]'),
    })
    .first()
  await placeholderButton.click()

  const saveButton = page.getByRole('button', { name: 'Save' })
  await expect(saveButton).toBeEnabled()
  await saveButton.click()

  // Ensure persisted storage has the updated portrait before a full reload.
  await page.waitForFunction(
    async ({ characterId }) => {
      return await new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('keyval', 'readonly')
          const store = tx.objectStore('keyval')
          const read = store.get('character-storage')
          read.onerror = () => reject(read.error)
          read.onsuccess = () => {
            const payload = read.result as
              | {
                  state?: {
                    characters?: Array<{ id?: string; portrait?: string }>
                  }
                }
              | undefined
            const persisted = payload?.state?.characters?.find(
              (character) => character.id === characterId,
            )
            resolve(
              typeof persisted?.portrait === 'string' &&
                persisted.portrait.includes('placeholder_char_card'),
            )
            db.close()
          }
        }
      })
    },
    { characterId: fixture.id },
    { timeout: 10000 },
  )

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-lifecycle-seed')

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await selectCharacterFromHome(page, fixture.name)
  await page.getByRole('button', { name: 'Details' }).click()
  await page.getByRole('link', { name: 'Portrait' }).click()
  await expect(page).toHaveURL(/\/details\/portrait$/)

  await expect(page.getByRole('button', { name: 'Clear' })).toBeEnabled()
})
