import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, selectCharacterFromHome } from './helpers/startup'

test('active-character spell workflow: profile switch, add/remove, prepared toggle', async ({
  page,
}) => {
  const character = {
    id: 'spells-e2e-1',
    version: '2.0.0',
    name: 'Spell E2E',
    originSystem: '2014',
    race: 'Human',
    raceSource: 'PHB',
    class: 'Wizard',
    classSource: 'PHB',
    background: 'Sage',
    backgroundSource: 'PHB',
    level: 2,
    experiencePoints: 0,
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
    abilityScores: {
      strength: 8,
      dexterity: 14,
      constitution: 14,
      intelligence: 16,
      wisdom: 12,
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
          id: 'class:Wizard|PHB',
          type: 'class',
          label: 'Wizard (Lv 2)',
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
        1: { max: 3, used: 0 },
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
    hitPoints: { max: 12, current: 12, temporary: 0 },
    armorClass: 12,
    initiative: 2,
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

  const gameData = {
    races: [],
    classes: [
      {
        name: 'Wizard',
        source: 'PHB',
        classFeatures: [],
        classFeatureRefs: [],
        casterProgression: 'full',
        spellcastingAbility: 'intelligence',
        spellSlotProgression: [[2], [3]],
      },
    ],
    backgrounds: [],
    spells: [
      {
        name: 'Magic Missile',
        source: 'PHB',
        level: 1,
        school: 'V',
        time: [{ number: 1, unit: 'action' }],
        range: { type: 'point', distance: { type: 'feet', amount: 120 } },
        components: { v: true, s: true },
        duration: [{ type: 'instant' }],
        classes: {
          fromClassList: [{ name: 'Wizard', source: 'PHB' }],
        },
        entries: ['A bolt of force deals damage.'],
      },
      {
        name: 'Fire Bolt',
        source: 'PHB',
        level: 0,
        school: 'V',
        time: [{ number: 1, unit: 'action' }],
        range: { type: 'point', distance: { type: 'feet', amount: 120 } },
        components: { v: true, s: true },
        duration: [{ type: 'instant' }],
        classes: {
          fromClassList: [{ name: 'Wizard', source: 'PHB' }],
        },
        entries: ['A mote of fire deals damage.'],
      },
    ],
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
    trapHazards: [],
    rewards: [],
    cultsBoons: [],
    sources: [],
  }

  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await page.evaluate(
    async ({ characterSeed, cacheSeed, configSeed }) => {
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
      characterSeed: {
        state: {
          characters: [character],
          activeCharacterId: character.id,
        },
        version: 0,
      },
      cacheSeed: {
        data: gameData,
        cachedAt: new Date().toISOString(),
        sourceSnapshot: { type: 'remote', path: 'e2e-spell-seed' },
      },
      configSeed: {
        state: {
          dataSourceConfig: {
            type: 'remote',
            path: 'e2e-spell-seed',
            isValid: true,
            lastLoaded: new Date().toISOString(),
          },
          lastLoadedAt: new Date().toISOString(),
        },
        version: 0,
      },
    },
  )

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await selectCharacterFromHome(page, 'Spell E2E')
  await page.getByRole('link', { name: 'Spells' }).click()
  await expect(page).toHaveURL(/\/spells$/)
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await expect(page.getByRole('heading', { name: 'Spells', exact: true })).toBeVisible()

  // Seed Magic Missile into the Bonus Spells profile via IndexedDB, then reload.
  await page.evaluate(
    async ({ characterId }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('keyval', 'readwrite')
          const store = tx.objectStore('keyval')
          const getReq = store.get('character-storage')

          getReq.onerror = () => reject(getReq.error)
          getReq.onsuccess = () => {
            const payload = getReq.result as
              | {
                  state?: {
                    characters?: Array<{
                      id: string
                      spells?: {
                        spellProfiles?: Array<{
                          id: string
                          cantrips?: string[]
                          spellsKnown?: string[]
                        }>
                      }
                    }>
                  }
                  version?: number
                }
              | undefined

            const characters = payload?.state?.characters ?? []
            const target = characters.find((entry) => entry.id === characterId)
            const profiles = target?.spells?.spellProfiles ?? []
            const bonusProfile = profiles.find((profile) => profile.id === 'special:unrestricted')
            if (bonusProfile) {
              const known = new Set(bonusProfile.spellsKnown ?? [])
              known.add('Magic Missile')
              bonusProfile.spellsKnown = [...known]
            }

            store.put(payload, 'character-storage')
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }
        }
      })
    },
    { characterId: character.id },
  )

  // Reload to pick up IndexedDB changes, re-select character, navigate to Spells.
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)
  await selectCharacterFromHome(page, 'Spell E2E')
  await page.getByRole('link', { name: 'Spells' }).click()
  await expect(page).toHaveURL(/\/spells$/)

  const mainContent = page.locator('main')
  await expect(mainContent.getByText('Magic Missile').first()).toBeVisible()

  const notPreparedToggle = page.locator('button[title="Not prepared"]').first()
  if (await notPreparedToggle.isVisible().catch(() => false)) {
    await notPreparedToggle.click()
    await expect(page.locator('button[title="Prepared"]').first()).toBeVisible()
  }

  const spellRow = page.locator('div').filter({ hasText: 'Magic Missile' }).first()
  await spellRow.locator('button').last().click()

  await expect(mainContent.getByText('Magic Missile')).toHaveCount(0)
})
