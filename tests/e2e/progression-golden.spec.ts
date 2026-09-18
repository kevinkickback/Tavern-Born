import { expect, type Page, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { Class5e, GameData } from '@/types/5etools'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

const LEVEL_SEQUENCE = Array.from({ length: 19 }, (_, index) => index + 2)

const ZERO_PROGRESSION = Array(20).fill(0)

function makeClassRules(
  choices: NonNullable<Class5e['normalizedRules']>['choices'] = [],
  asiLevels: number[] = [],
) {
  return {
    resources: [],
    asiLevels,
    ritualCasting: false,
    choices,
    choiceDiagnostics: [],
  }
}

const rogue: Class5e = {
  name: 'Rogue',
  source: 'PHB',
  hd: { faces: 8, number: 1 },
  proficiency: ['dex', 'int'],
  startingProficiencies: { armor: ['light armor'], weapons: ['simple weapons'], skills: [] },
  classFeatures: [],
  classFeatureRefs: [],
  normalizedRules: makeClassRules([], [4, 8, 10, 12, 16, 19]),
  subclassTitle: 'Roguish Archetype',
  subclasses: [
    {
      name: 'Arcane Trickster',
      shortName: 'Arcane Trickster',
      source: 'PHB',
      className: 'Rogue',
      classSource: 'PHB',
      casterProgression: '1/3',
      spellcastingAbility: 'int',
      cantripProgression: ZERO_PROGRESSION,
      spellsKnownProgression: ZERO_PROGRESSION,
      entries: ['Arcane Tricksters combine stealth with carefully studied magic.'],
    },
  ],
}

const masteryChoice = {
  id: 'class:fighter|xphb|choice:weapon-mastery|1',
  label: 'Weapon Mastery',
  kind: 'item' as const,
  owner: { type: 'class' as const, name: 'Fighter', source: 'XPHB' },
  level: 1,
  minimumSelections: 1,
  maximumSelections: 1,
  selectionCountByLevel: Array(20).fill(1),
  options: [
    { entityType: 'item' as const, name: 'Longsword', source: 'XPHB' },
    { entityType: 'item' as const, name: 'Longbow', source: 'XPHB' },
  ],
  repeatable: false,
  replacement: { cadence: 'long-rest' as const, maximumPerEvent: 'all' as const },
  source: { kind: 'class-table' as const, field: 'Weapon Mastery' },
}

const fighter: Class5e = {
  name: 'Fighter',
  source: 'XPHB',
  edition: 'one',
  hd: { faces: 10, number: 1 },
  proficiency: ['str', 'con'],
  startingProficiencies: {
    armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
    weapons: ['simple weapons', 'martial weapons'],
    skills: [],
  },
  classFeatures: [],
  classFeatureRefs: [],
  normalizedRules: makeClassRules([masteryChoice], [4, 6, 8, 12, 14, 16, 19]),
  subclassTitle: 'Fighter Subclass',
  subclasses: [
    {
      name: 'Eldritch Knight',
      shortName: 'Eldritch Knight',
      source: 'XPHB',
      className: 'Fighter',
      classSource: 'XPHB',
      casterProgression: '1/3',
      spellcastingAbility: 'int',
      cantripProgression: ZERO_PROGRESSION,
      preparedSpellsProgression: ZERO_PROGRESSION,
      entries: ['Eldritch Knights reinforce martial training with arcane study.'],
    },
  ],
}

const PROGRESSION_GAME_DATA_BASE: GameData = {
  ...MINIMAL_GAME_DATA,
  races: [
    {
      name: 'Human',
      source: 'PHB',
      size: ['M'],
      speed: 30,
      entries: ['Humans are adaptable and ambitious.'],
      subraces: [
        {
          name: 'Variant',
          source: 'PHB',
          raceName: 'Human',
          raceSource: 'PHB',
          ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], count: 2 } }],
          feats: [{ any: 1 }],
          skillProficiencies: [{ any: 1 } as never],
        },
      ],
    },
    {
      name: 'Human',
      source: 'XPHB',
      edition: 'one',
      size: ['S', 'M'],
      speed: 30,
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
      skillProficiencies: [{ any: 1 } as never],
      entries: ['Humans are resourceful, skillful, and versatile.'],
    },
  ],
  classes: [rogue, fighter],
  backgrounds: [
    { name: 'Criminal', source: 'PHB', entries: ['You have experience outside the law.'] },
    {
      name: 'Soldier',
      source: 'XPHB',
      edition: 'one',
      ability: [
        { choose: { weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] } } },
        { choose: { weighted: { from: ['str', 'dex', 'con'], weights: [1, 1, 1] } } },
      ],
      feats: [{ 'savage attacker|xphb': true }],
      skillProficiencies: [{ athletics: true, intimidation: true }],
      entries: ['You trained for battle as part of an organized military force.'],
    },
  ],
  feats: [
    { name: 'Alert', source: 'PHB', entries: ['You are always on the lookout for danger.'] },
    {
      name: 'Alert',
      source: 'XPHB',
      category: 'O',
      entries: ['You gain Initiative Proficiency and can swap initiative.'],
    },
    {
      name: 'Savage Attacker',
      source: 'XPHB',
      category: 'O',
      entries: ['Once per turn, roll weapon damage twice and use either roll.'],
    },
  ],
  items: [
    {
      name: 'Longsword',
      source: 'XPHB',
      type: 'M',
      weaponCategory: 'martial',
      mastery: ['Sap|XPHB'],
      entries: ['A versatile martial melee weapon.'],
    },
    {
      name: 'Longbow',
      source: 'XPHB',
      type: 'R',
      weaponCategory: 'martial',
      mastery: ['Slow|XPHB'],
      entries: ['A martial ranged weapon.'],
    },
  ],
  itemMasteries: [
    { name: 'Sap', source: 'XPHB', entries: ['The target has disadvantage on its next attack.'] },
    { name: 'Slow', source: 'XPHB', entries: ['Reduce the target speed until your next turn.'] },
  ],
  skills: [
    { name: 'Acrobatics', ability: 'dex' },
    { name: 'Athletics', ability: 'str' },
    { name: 'Intimidation', ability: 'cha' },
  ],
  languages: [
    { name: 'Common', source: 'XPHB', type: 'standard' },
    { name: 'Dwarvish', source: 'XPHB', type: 'standard' },
    { name: 'Elvish', source: 'XPHB', type: 'standard' },
  ],
  sources: [
    { abbreviation: 'PHB', name: "Player's Handbook", group: 'core', year: 2014 },
    { abbreviation: 'XPHB', name: "Player's Handbook (2024)", group: 'core', year: 2024 },
  ],
}

const PROGRESSION_GAME_DATA: GameData = {
  ...PROGRESSION_GAME_DATA_BASE,
  lookups: buildGameDataLookups(PROGRESSION_GAME_DATA_BASE),
}

async function createCharacter(
  page: Page,
  options: {
    name: string
    rulesetButton: RegExp
    raceSource: string
    className: string
    classSource: string
    background: string
    backgroundSource: string
    subrace?: string
    racialBonuses?: string[]
  },
) {
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill(options.name)
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.rulesetButton }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: new RegExp(`Human\\s+${options.raceSource}`) }).click()
  if (options.subrace) {
    await dialog.getByRole('button', { name: options.subrace, exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog
    .getByRole('button', { name: new RegExp(`${options.className}\\s+${options.classSource}`) })
    .click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog
    .getByRole('button', {
      name: new RegExp(`${options.background}\\s+${options.backgroundSource}`),
    })
    .click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()

  if (options.racialBonuses) {
    const bonuses = dialog
      .getByRole('heading', { name: 'Racial Bonuses' })
      .locator('..')
      .locator('..')
    const selectors = bonuses.getByRole('combobox')
    for (const [index, ability] of options.racialBonuses.entries()) {
      await selectors.nth(index).click()
      await page.getByRole('option', { name: ability, exact: true }).click()
    }
  }

  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText(options.name)).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
}

async function chooseHumanFeatAndSkill(page: Page, featSource?: string) {
  await page.getByRole('link', { name: 'Race', exact: true }).click()
  if (featSource) {
    await page.getByRole('button', { name: /Choose(?: Origin)? feat/i }).click()
    const featDialog = page.getByRole('dialog', { name: 'Select Feats' })
    await featDialog.getByLabel('Search select feats').fill('Alert')
    await featDialog
      .getByRole('button')
      .filter({ hasText: `Alert${featSource}` })
      .click()
    await featDialog.getByRole('button', { name: 'Confirm' }).click()
  }

  await page.getByRole('link', { name: 'Proficiencies', exact: true }).click()
  await page.getByTitle('Choose Acrobatics').click()
}

async function chooseOriginLanguages(page: Page) {
  await page.getByRole('link', { name: 'Proficiencies', exact: true }).click()
  await page.getByRole('tab', { name: /Languages/ }).click()
  await page.getByTitle('Choose Dwarvish').click()
  await page.getByTitle('Choose Elvish').click()
}

async function chooseBackgroundBonuses(page: Page) {
  await page.getByRole('link', { name: 'Ability Scores', exact: true }).click()
  const choices = page.getByTestId('background-ability-choices')
  await choices.getByRole('combobox', { name: 'Background ability bonus +2' }).click()
  await page.getByRole('option', { name: 'STR', exact: true }).click()
  await choices.getByRole('combobox', { name: 'Background ability bonus +1' }).click()
  await page.getByRole('option', { name: 'CON', exact: true }).click()
}

async function chooseWeaponMastery(page: Page) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  await page.getByRole('button', { name: /Level 1 Features/ }).click()
  await page
    .getByRole('region', { name: /Level 1 Features/ })
    .getByRole('button', { name: 'Choose' })
    .click()
  const modal = page.getByRole('dialog', { name: 'Choose Weapon Mastery' })
  await modal.getByRole('button').filter({ hasText: 'Longsword' }).click()
  await modal.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Longsword', { exact: true })).toBeVisible()
}

async function assertCurrentHpMatchesMaximum(page: Page, maximum: number) {
  const hpButton = page.getByRole('button', {
    name: `Manage hit points. Maximum ${maximum}`,
  })
  await expect(hpButton).toBeVisible()
  await hpButton.click()
  const hpDialog = page.getByRole('dialog', { name: 'Manage Hit Points' })
  await expect(hpDialog.getByLabel('Current HP')).toHaveValue(String(maximum))
  await page.keyboard.press('Escape')
  await expect(hpDialog).toBeHidden()
}

async function levelClassTo(
  page: Page,
  targetLevel: number,
  checkpointLevels: ReadonlySet<number> = new Set(),
) {
  const currentLevelText = await page
    .getByRole('banner')
    .getByText(/Level \d+/)
    .first()
    .textContent()
  const currentLevel = Number(currentLevelText?.match(/\d+/)?.[0] ?? 1)
  const levelDialog = page.getByRole('dialog', { name: 'Level Up Character' })

  for (const level of LEVEL_SEQUENCE.filter(
    (candidate) => candidate > currentLevel && candidate <= targetLevel,
  )) {
    await page.getByRole('banner').getByRole('button', { name: 'Level Up' }).click()
    await expect(levelDialog).toBeVisible()
    await levelDialog.getByRole('button', { name: 'Level Up' }).first().click()
    await expect(levelDialog.getByText(String(level), { exact: true })).toBeVisible()
    await levelDialog.getByRole('button', { name: 'Close' }).first().click()
    await expect(levelDialog).toBeHidden()
    const hpLabel = await page
      .getByRole('banner')
      .getByRole('button', { name: /Manage hit points\. Maximum \d+/ })
      .getAttribute('aria-label')
    const maximum = Number(hpLabel?.match(/Maximum (\d+)/)?.[1])
    expect(maximum).toBeGreaterThan(0)

    if (checkpointLevels.has(level)) {
      await assertCurrentHpMatchesMaximum(page, maximum)
    }
  }
  await expect(page.getByRole('banner').getByText(`Level ${targetLevel}`)).toBeVisible()
}

async function chooseSubclass(page: Page, level: number, name: string, dialogName: string) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`Level ${level} Features`) }).click()
  await page.getByRole('button', { name: 'Choose', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: dialogName })
  await dialog.getByRole('button').filter({ hasText: name }).click()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

async function resolveAbilityScoreImprovements(page: Page, levels: number[]) {
  const abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
  await page.getByRole('link', { name: 'Class', exact: true }).click()

  for (const [index, level] of levels.entries()) {
    await page.getByRole('button', { name: new RegExp(`Level ${level} Features`) }).click()
    const levelRegion = page.getByRole('region', { name: new RegExp(`Level ${level} Features`) })
    await levelRegion.getByLabel('Ability Score Increase').click()
    await levelRegion.getByRole('button', { name: 'Apply' }).click()

    const dialog = page.getByRole('dialog', { name: `Ability Score Increase — Level ${level}` })
    const ability = abilities[index % abilities.length]
    await dialog.getByRole('button').filter({ hasText: ability }).click()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(dialog).toBeHidden()
  }
}

async function saveReloadAndAssertReady(page: Page, characterName: string) {
  await page.getByRole('banner').getByRole('button', { name: 'Save character' }).click()
  await page.getByRole('link', { name: /^Review/ }).click()
  await expect(page.getByRole('heading', { name: 'Character is ready' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Characters' }).click()
  await selectCharacterFromHome(page, characterName)
  await page.getByRole('link', { name: /^Review/ }).click()
  await expect(page.getByRole('heading', { name: 'Character is ready' })).toBeVisible()
}

test.use({ viewport: { width: 1440, height: 900 } })

test('@golden 2014 Variant Human Arcane Trickster progresses from creation through level 20', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-progression-golden',
    gameData: PROGRESSION_GAME_DATA,
    characters: [],
  })
  await page.reload()

  await createCharacter(page, {
    name: 'Golden Arcane Trickster',
    rulesetButton: /5e Legacy/,
    raceSource: 'PHB',
    className: 'Rogue',
    classSource: 'PHB',
    background: 'Criminal',
    backgroundSource: 'PHB',
    subrace: 'Variant',
    racialBonuses: ['DEX', 'INT'],
  })
  await selectCharacterFromHome(page, 'Golden Arcane Trickster')
  await chooseHumanFeatAndSkill(page, 'PHB')

  await levelClassTo(page, 3, new Set([3]))
  await chooseSubclass(page, 3, 'Arcane Trickster', 'Choose Roguish Archetype')
  await levelClassTo(page, 20, new Set([20]))
  await resolveAbilityScoreImprovements(page, [4, 8, 10, 12, 16, 19])

  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(page.getByText('Rogue', { exact: true }).first()).toBeVisible()
  await saveReloadAndAssertReady(page, 'Golden Arcane Trickster')
})

test('@golden 2024 Human Eldritch Knight progresses from creation through level 20', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-progression-golden',
    gameData: PROGRESSION_GAME_DATA,
    characters: [],
  })
  await page.reload()

  await createCharacter(page, {
    name: 'Golden Eldritch Knight',
    rulesetButton: /5\.5e Revised/,
    raceSource: 'XPHB',
    className: 'Fighter',
    classSource: 'XPHB',
    background: 'Soldier',
    backgroundSource: 'XPHB',
  })
  await selectCharacterFromHome(page, 'Golden Eldritch Knight')
  await chooseHumanFeatAndSkill(page)
  await chooseOriginLanguages(page)
  await chooseBackgroundBonuses(page)
  await page.getByRole('link', { name: 'Feats', exact: true }).click()
  await expect(page.getByText('Savage Attacker', { exact: true }).first()).toBeVisible()
  await chooseWeaponMastery(page)

  await levelClassTo(page, 3, new Set([3]))
  await chooseSubclass(page, 3, 'Eldritch Knight', 'Choose Fighter Subclass')
  await levelClassTo(page, 20, new Set([20]))
  await resolveAbilityScoreImprovements(page, [4, 6, 8, 12, 14, 16, 19])

  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(page.getByText('Fighter', { exact: true }).first()).toBeVisible()
  await saveReloadAndAssertReady(page, 'Golden Eldritch Knight')
})
