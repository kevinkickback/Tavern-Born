import { expect, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

async function navigateToClassPage(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Build' }).click()
  await page.getByRole('link', { name: 'Class' }).click()
}

const MULTICLASS_CHARACTER = {
  id: 'multiclass-e2e-1',
  schemaVersion: 2,
  name: 'Multiclass E2E Hero',
  originSystem: '2014' as const,
  race: 'Human',
  raceSource: 'PHB',
  background: 'Soldier',
  backgroundSource: 'PHB',
  experiencePoints: 0,
  classProgression: [
    { name: 'Fighter', source: 'PHB', levels: 5 },
    { name: 'Wizard', source: 'PHB', levels: 3 },
  ],
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
    expertise: [],
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
  hitPoints: { current: 52, temporary: 0 },
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'manual' as const, name: 'E2E seed' },
  },
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

const MULTICLASS_GAME_DATA = {
  races: [],
  classes: [
    {
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
      classFeatures: [],
      classFeatureRefs: [],
    },
    {
      name: 'Wizard',
      source: 'PHB',
      hd: { faces: 6, number: 1 },
      casterProgression: 'full',
      spellcastingAbility: 'intelligence',
      spellSlotProgression: [[2], [3], [4, 2], [4, 3], [4, 3, 2]],
      classFeatures: [],
      classFeatureRefs: [],
    },
    {
      name: 'Cleric',
      source: 'PHB',
      hd: { faces: 8, number: 1 },
      casterProgression: 'full',
      spellcastingAbility: 'wisdom',
      preparedSpells: '<$level$> + <$wis_mod$>',
      spellSlotProgression: [[2], [3]],
      classFeatures: [],
      classFeatureRefs: [],
    },
  ],
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

async function seedCharacter(page: import('@playwright/test').Page) {
  await seedAppState(page, {
    sourcePath: 'e2e-multiclass-seed',
    gameData: MULTICLASS_GAME_DATA,
    characters: [MULTICLASS_CHARACTER],
  })
}

test('multiclass character shows both classes in the class switcher', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')

  await navigateToClassPage(page)
  await expect(page).toHaveURL(/\/build\/class$/)

  const classSwitcher = page.getByRole('combobox', { name: 'Switch class' })
  await expect(classSwitcher).toHaveAttribute('title', 'Fighter, level 5')
  await classSwitcher.click()
  await expect(page.getByRole('option', { name: 'Fighter · Level 5' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Wizard · Level 3' })).toBeVisible()
})

test('multiclass switch updates the visible class panel', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await navigateToClassPage(page)
  await expect(page).toHaveURL(/\/build\/class$/)

  const classSwitcher = page.getByRole('combobox', { name: 'Switch class' })
  await classSwitcher.click()
  await page.getByRole('option', { name: 'Wizard · Level 3' }).click()
  await expect(classSwitcher).toHaveAttribute('title', 'Wizard, level 3')
})

test('multiclass character persists both classes after reload', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await seedCharacter(page)
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await navigateToClassPage(page)
  await expect(page).toHaveURL(/\/build\/class$/)

  const classSwitcher = page.getByRole('combobox', { name: 'Switch class' })
  await classSwitcher.click()
  await expect(page.getByRole('option', { name: 'Fighter · Level 5' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Wizard · Level 3' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Reload and re-navigate
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  await page.getByRole('button', { name: 'Characters' }).click()
  await selectCharacterFromHome(page, 'Multiclass E2E Hero')
  await navigateToClassPage(page)
  await expect(page).toHaveURL(/\/build\/class$/)

  const reloadedSwitcher = page.getByRole('combobox', { name: 'Switch class' })
  await reloadedSwitcher.click()
  await expect(page.getByRole('option', { name: 'Fighter · Level 5' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Wizard · Level 3' })).toBeVisible()
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

test('@focused multiclass spellcasting shows the persisted shared slot pool', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  const multiclassCaster = {
    ...MULTICLASS_CHARACTER,
    id: 'multiclass-caster-e2e',
    name: 'Multiclass Caster E2E',
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Cleric', source: 'PHB', levels: 2 },
    ],
    spells: {
      ...MULTICLASS_CHARACTER.spells,
      spellProfiles: [
        MULTICLASS_CHARACTER.spells.spellProfiles[0],
        {
          id: 'class:Cleric|PHB',
          type: 'class',
          label: 'Cleric (Lv 2)',
          className: 'Cleric',
          classSource: 'PHB',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: false,
        },
        MULTICLASS_CHARACTER.spells.spellProfiles[1],
      ],
      spellSlots: {
        ...MULTICLASS_CHARACTER.spells.spellSlots,
        1: { max: 4, used: 0 },
        2: { max: 3, used: 0 },
        3: { max: 2, used: 0 },
      },
    },
  }
  await seedAppState(page, {
    sourcePath: 'e2e-multiclass-seed',
    gameData: MULTICLASS_GAME_DATA,
    characters: [multiclassCaster],
    activeCharacterId: multiclassCaster.id,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')

  await selectCharacterFromHome(page, 'Multiclass Caster E2E')
  await page.getByRole('link', { name: 'Spells' }).click()

  await expect(page.getByText('Shared Spell Slots')).toBeVisible()
  await expect(page.getByText('Level 1 slots')).toBeVisible()
  await expect(page.getByText('Level 2 slots')).toBeVisible()
})
