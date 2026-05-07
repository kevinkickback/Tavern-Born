import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, selectCharacterFromHome } from './helpers/startup'

const MULTICLASS_CHARACTER = {
  id: 'multiclass-e2e-1',
  version: '2.0.0',
  name: 'Multiclass E2E Hero',
  originSystem: '2014' as const,
  race: 'Human',
  raceSource: 'PHB',
  class: 'Fighter',
  classSource: 'PHB',
  background: 'Soldier',
  backgroundSource: 'PHB',
  level: 8,
  experiencePoints: 0,
  classProgression: [
    { name: 'Fighter', source: 'PHB', levels: 5 },
    { name: 'Wizard', source: 'PHB', levels: 3 },
  ],
  subclass: undefined,
  subclassSource: undefined,
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 14,
    wisdom: 10,
    charisma: 8,
  },
  proficiencies: {
    armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
    weapons: ['simple weapons', 'martial weapons', 'daggers', 'darts'],
    tools: [],
    skills: ['athletics', 'perception'],
    languages: ['Common'],
    savingThrows: ['strength', 'constitution', 'intelligence', 'wisdom'],
  },
  features: [],
  feats: [],
  spells: {
    spellProfiles: [
      {
        id: 'class:Wizard|PHB',
        type: 'class',
        label: 'Wizard (Lv 3)',
        className: 'Wizard',
        classSource: 'PHB',
        cantrips: [],
        spellsKnown: [],
        preparedSpells: [],
        alwaysPrepared: false,
      },
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
      1: { max: 4, used: 0 },
      2: { max: 2, used: 0 },
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
  hitPoints: { max: 52, current: 52, temporary: 0 },
  initiative: 1,
  speed: 30,
  savingThrows: {
    strength: { proficient: true, bonus: 0 },
    dexterity: { proficient: false, bonus: 0 },
    constitution: { proficient: true, bonus: 0 },
    intelligence: { proficient: true, bonus: 0 },
    wisdom: { proficient: true, bonus: 0 },
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

async function seedCharacter(page: import('@playwright/test').Page) {
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
        state: { characters: [MULTICLASS_CHARACTER], activeCharacterId: null },
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
          trapHazards: [],
          rewards: [],
          cultsBoons: [],
          organizations: [],
          sources: [],
        },
        cachedAt: new Date().toISOString(),
        sourceSnapshot: { type: 'remote', path: 'e2e-multiclass-seed' },
      },
    },
  )
}

test('multiclass character shows both class tabs on class page', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')

  await page.getByRole('link', { name: 'Class' }).click()
  await expect(page).toHaveURL(/\/build\/class$/)

  // Both classes should appear as tab triggers
  await expect(page.getByRole('tab', { name: /Fighter/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Wizard/ })).toBeVisible()
})

test('multiclass class tabs show correct level badges', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await page.getByRole('link', { name: 'Class' }).click()
  await expect(page).toHaveURL(/\/build\/class$/)

  // Fighter tab should display level 5 badge, Wizard level 3
  const fighterTab = page.getByRole('tab', { name: /Fighter/ })
  const wizardTab = page.getByRole('tab', { name: /Wizard/ })

  await expect(fighterTab).toContainText('5')
  await expect(wizardTab).toContainText('3')
})

test('multiclass tab switch updates the visible class panel', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await page.getByRole('link', { name: 'Class' }).click()
  await expect(page).toHaveURL(/\/build\/class$/)

  // Fighter tab is default (first entry) — activate it explicitly
  await page.getByRole('tab', { name: /Fighter/ }).click()

  // Switch to Wizard
  await page.getByRole('tab', { name: /Wizard/ }).click()
  const wizardTab = page.getByRole('tab', { name: /Wizard/ })
  await expect(wizardTab).toHaveAttribute('data-state', 'active')
})

test('multiclass character persists both classes after reload', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await page.getByRole('link', { name: 'Class' }).click()
  await expect(page).toHaveURL(/\/build\/class$/)

  // Verify both tabs exist before reload
  await expect(page.getByRole('tab', { name: /Fighter/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Wizard/ })).toBeVisible()

  // Reload and re-navigate
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await page.getByRole('link', { name: 'Home' }).click()
  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await page.getByRole('link', { name: 'Class' }).click()
  await expect(page).toHaveURL(/\/build\/class$/)

  // Both classes should still be present after reload
  await expect(page.getByRole('tab', { name: /Fighter/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Wizard/ })).toBeVisible()
})

test('multiclass character total level shows in character header', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')

  // The header or character summary should reflect total level 8 (5+3)
  await expect(page.getByText('Level 8')).toBeVisible()
})
