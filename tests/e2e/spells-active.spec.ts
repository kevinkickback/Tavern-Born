import { expect, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('active-character spell workflow: profile switch, add/remove, prepared toggle', async ({
  page,
}) => {
  const character = {
    id: 'spells-e2e-1',
    schemaVersion: 1,
    name: 'Spell E2E',
    originSystem: '2014',
    race: 'Human',
    raceSource: 'PHB',
    background: 'Sage',
    backgroundSource: 'PHB',
    experiencePoints: 0,
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 2 },
      { name: 'Cleric', source: 'PHB', levels: 1 },
    ],
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
          id: 'class:Cleric|PHB',
          type: 'class',
          label: 'Cleric (Lv 1)',
          className: 'Cleric',
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
    hitPoints: { current: 12, temporary: 0 },
    movement: {
      speeds: { walk: 30 },
      source: { kind: 'manual', name: 'E2E seed' },
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
      {
        name: 'Cleric',
        source: 'PHB',
        classFeatures: [],
        classFeatureRefs: [],
        casterProgression: 'full',
        spellcastingAbility: 'wisdom',
        preparedSpells: '<$level$> + <$wis_mod$>',
        spellSlotProgression: [[2]],
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
  }

  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await seedAppState(page, {
    sourcePath: 'e2e-spell-seed',
    gameData,
    characters: [character],
    activeCharacterId: character.id,
  })

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await selectCharacterFromHome(page, 'Spell E2E')
  await page.getByRole('link', { name: 'Spells' }).click()
  await expect(page).toHaveURL(/\/spells$/)
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', gameData)

  await expect(page.getByRole('heading', { name: 'Spells', exact: true })).toBeVisible()

  const spellViewTabs = page.getByRole('tablist', { name: 'Spell view' })
  const wizardTab = spellViewTabs.getByRole('tab', { name: /Wizard/ })
  const clericTab = spellViewTabs.getByRole('tab', { name: /Cleric/ })
  await expect(wizardTab).toBeVisible()
  await expect(clericTab).toBeVisible()
  await expect(spellViewTabs.getByRole('tab', { name: /^Class(?:\s+\d+)?$/ })).toHaveCount(0)

  await clericTab.click()
  await expect(clericTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('main').getByText('Cleric (Lv 1)')).toBeVisible()
  await expect(page.locator('main').getByText('Wizard (Lv 2)')).toHaveCount(0)

  await wizardTab.click()
  await expect(wizardTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('main').getByText('Wizard (Lv 2)')).toBeVisible()
  await expect(page.locator('main').getByText('Cleric (Lv 1)')).toHaveCount(0)

  // Seed an exact source-qualified spell reference into the Bonus Spells profile, then reload.
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
              known.add('Magic Missile|PHB')
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

  const wizardSpells = page.getByRole('region', { name: /Wizard/ })
  const notPreparedToggle = wizardSpells.getByTitle('Not prepared — click to prepare')
  await expect(notPreparedToggle).toBeVisible()
  await notPreparedToggle.click()
  await expect(wizardSpells.getByTitle('Prepared — click to unprepare')).toBeVisible()

  const bonusSpellsContent = page.getByRole('region', { name: /Bonus Spells/ })
  await bonusSpellsContent.getByRole('button', { name: 'Remove Magic Missile' }).click()

  // Wizard is a true prepared caster — Magic Missile always appears in its class spell list.
  await expect(bonusSpellsContent.getByText('Magic Missile')).toHaveCount(0)
})
