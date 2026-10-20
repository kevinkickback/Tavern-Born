import { expect, type Page, test } from '@playwright/test'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { Class5e, ClassFeatureReference, GameData } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

const LEVEL_SEQUENCE = Array.from({ length: 19 }, (_, index) => index + 2)

const castingFixture = makeManagedClassSpellBrowserFixtures()

// These journeys keep controlled noncasting choices, including the original level19 ASI.
// Casting fields, raw tables, subclass declarations and source proofs stay native and intact.
function progressionClass(name: string, source: string, subclass: string): Class5e {
  const parent = castingFixture.data.classes.find(
    (row) => row.name === name && row.source === source,
  )!
  const refs = parent.classFeatureRefs!.filter(
    (row) => row.gainSubclassFeature || row.name === 'Ability Score Improvement',
  )
  if (name === 'Fighter') {
    refs.push({
      ref: 'Ability Score Improvement|Fighter|XPHB|19',
      name: 'Ability Score Improvement',
      className: name,
      classSource: source,
      source,
      level: 19,
    })
    const mastery = parent.classFeatureRefs!.find((row) => row.name === 'Weapon Mastery')!
    refs.push({
      ...mastery,
      feature: {
        name: mastery.name,
        className: name,
        classSource: source,
        source,
        level: 1,
        entries: [
          'Choose three kinds of {@filter weapons|items|type=simple weapon;martial weapon} whose Weapon Mastery properties you can use.',
        ],
      },
    } as ClassFeatureReference)
  }
  const current = {
    ...parent,
    classFeatures: [],
    classFeatureRefs: refs,
    startingEquipment: undefined,
    startingProficiencies: { ...parent.startingProficiencies, skills: [] },
    subclasses: parent.subclasses!.filter((row) => row.name === subclass && row.source === source),
  }
  return { ...current, normalizedRules: normalizeClassRules(current, refs) }
}
const rogue = progressionClass('Rogue', 'PHB', 'Arcane Trickster')
const fighter = progressionClass('Fighter', 'XPHB', 'Eldritch Knight')

interface SpellGainPlan {
  level: number
  cantrips?: string[]
  spells: string[]
}
const TRICKSTER_SPELLS: SpellGainPlan[] = [
  {
    level: 3,
    cantrips: ['Light', 'Ray of Frost'],
    spells: ['Magic Missile', 'Charm Person', 'Silent Image'],
  },
  { level: 4, spells: ['Disguise Self'] },
  { level: 7, spells: ['Invisibility'] },
  { level: 8, spells: ['Misty Step'] },
  { level: 10, cantrips: ['Minor Illusion'], spells: ['Mirror Image'] },
  { level: 11, spells: ['Hold Person'] },
  { level: 13, spells: ['Hypnotic Pattern'] },
  { level: 14, spells: ['Fireball'] },
  { level: 16, spells: ['Major Image'] },
  { level: 19, spells: ['Confusion'] },
  { level: 20, spells: ['Dimension Door'] },
]
const KNIGHT_SPELLS: SpellGainPlan[] = [
  {
    level: 3,
    cantrips: ['Fire Bolt', 'Mage Hand'],
    spells: ['Magic Missile', 'Shield', 'Burning Hands'],
  },
  { level: 4, spells: ['Thunderwave'] },
  { level: 7, spells: ['Scorching Ray'] },
  { level: 8, spells: ['Shatter'] },
  { level: 10, cantrips: ['Light'], spells: ['Misty Step'] },
  { level: 11, spells: ['Mirror Image'] },
  { level: 13, spells: ['Counterspell'] },
  { level: 14, spells: ['Fireball'] },
  { level: 16, spells: ['Lightning Bolt'] },
  { level: 19, spells: ['Ice Storm'] },
  { level: 20, spells: ['Dimension Door'] },
]
const MASTERY_WEAPONS = ['Longsword', 'Longbow', 'Greataxe', 'Battleaxe', 'Dagger', 'Spear']

const PROGRESSION_GAME_DATA_BASE: GameData = {
  ...castingFixture.gameData,
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
  classes: [
    rogue,
    fighter,
    ...castingFixture.data.classes.filter(
      (row) => row.name === 'Wizard' && ['PHB', 'XPHB'].includes(row.source),
    ),
  ],
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
  itemsBase: [
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
    ...[
      ['Greataxe', 'martial', 'Cleave'],
      ['Battleaxe', 'martial', 'Topple'],
      ['Dagger', 'simple', 'Nick'],
      ['Spear', 'simple', 'Sap'],
    ].map(([name, weaponCategory, mastery]) => ({
      name,
      source: 'XPHB',
      type: 'M',
      weaponCategory,
      mastery: [mastery + '|XPHB'],
    })),
  ],
  itemMasteries: [
    { name: 'Sap', source: 'XPHB', entries: ['The target has disadvantage on its next attack.'] },
    { name: 'Slow', source: 'XPHB', entries: ['Reduce the target speed until your next turn.'] },
    ...['Cleave', 'Topple', 'Nick'].map((name) => ({ name, source: 'XPHB', entries: [] })),
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

async function chooseWeaponMastery(page: Page, count = 3, previous = 0) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const trigger = page.getByRole('button', { name: /Level 1\b/ })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page
    .getByRole('region', { name: /Level 1\b/ })
    .getByRole('button', { name: /^(Choose|Edit)$/ })
    .click()
  const modal = page.getByRole('dialog', { name: 'Choose weapons for Weapon Mastery' })
  for (const name of MASTERY_WEAPONS.slice(previous, count)) {
    await modal
      .getByRole('button')
      .filter({ has: page.getByText(name, { exact: true }) })
      .click()
  }
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
  onLevel?: (level: number) => Promise<void>,
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
    await onLevel?.(level)
  }
  await expect(page.getByRole('banner').getByText(`Level ${targetLevel}`)).toBeVisible()
}

async function chooseSubclass(page: Page, level: number, name: string, dialogName: string) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`Level ${level}\\b`) }).click()
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
    await page.getByRole('button', { name: new RegExp(`Level ${level}\\b`) }).click()
    const levelRegion = page.getByRole('region', { name: new RegExp(`Level ${level}\\b`) })
    await levelRegion.getByLabel('Ability Score Increase').click()
    await levelRegion.getByRole('button', { name: 'Apply' }).click()

    const dialog = page.getByRole('dialog', { name: `Ability Score Increase — Level ${level}` })
    const ability = abilities[index % abilities.length]
    await dialog.getByRole('button').filter({ hasText: ability }).click()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(dialog).toBeHidden()
  }
}

async function chooseSpellGain(
  page: Page,
  className: string,
  source: string,
  plan: SpellGainPlan | undefined,
) {
  if (!plan) return
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const trigger = page.getByRole('button', { name: new RegExp('^Level ' + plan.level + ',') })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  const section = page
    .getByRole('region', { name: new RegExp('^Level ' + plan.level + '\\b') })
    .getByText('Spell Selection', { exact: true })
    .locator('xpath=../..')
    .locator('..')
  await section.getByRole('button', { name: /^(Choose|Edit)$/ }).click()
  const draft = page.getByRole('dialog', { name: className + ' spells at level ' + plan.level })
  for (const [kind, names] of [
    ['Cantrip', plan.cantrips ?? []],
    ['Spell', plan.spells],
  ] as const) {
    for (const [ordinal, name] of names.entries()) {
      await draft
        .getByRole('group', { name: kind + ' ' + (ordinal + 1), exact: true })
        .getByRole('button', { name: 'Choose', exact: true })
        .click()
      const picker = page.getByRole('dialog', {
        name: 'Choose ' + kind.toLowerCase() + ' ' + (ordinal + 1),
        exact: true,
      })
      await picker.getByRole('textbox', { name: /Search/ }).fill(name)
      await picker
        .getByRole('button')
        .filter({ has: page.getByText(name, { exact: true }) })
        .filter({ has: page.getByText(source, { exact: true }) })
        .click()
      await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
    }
  }
  await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(draft).toBeHidden()
}

async function saveReloadAndAssertReady(
  page: Page,
  characterName: string,
  plans: SpellGainPlan[],
  className: string,
  source: string,
  subclass: string,
) {
  await page.getByRole('banner').getByRole('button', { name: 'Save character' }).click()
  const readSaved = async () =>
    (await readPersistedCharacters(page))
      .map((row) => characterPersistenceSchema.parse(row))
      .find((row) => row.name === characterName)!
  await expect.poll(async () => (await readSaved())?.managedClassSpellChoices?.length).toBe(16)
  const saved = await readSaved()
  const owner = [
    'subclass',
    className.toLowerCase(),
    source.toLowerCase(),
    subclass.toLowerCase(),
    source.toLowerCase(),
  ]
  const declaration = [
    'subclass-feature',
    'spellcasting',
    ...owner.slice(1),
    3,
    source.toLowerCase(),
  ].join('|')
  const expected = plans.flatMap((plan) => [
    ...(plan.cantrips ?? []).map((name, ordinal) => ({
      slot: [owner, 'class-cantrip', declaration, plan.level, ordinal],
      target: { name, source },
      policy: 'default',
    })),
    ...plan.spells.map((name, ordinal) => ({
      slot: [owner, 'class-known', declaration, plan.level, ordinal],
      target: { name, source },
      policy: 'default',
    })),
  ])
  expect(
    saved
      .managedClassSpellChoices!.map(({ slot, target, policy }) =>
        JSON.stringify({ slot, target, policy }),
      )
      .sort(),
  ).toEqual(expected.map((row) => JSON.stringify(row)).sort())
  await page.getByRole('link', { name: /^Review/ }).click()
  await expect(page.getByRole('heading', { name: 'Character is ready' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Characters' }).click()
  await selectCharacterFromHome(page, characterName)
  await page.getByRole('link', { name: /^Review/ }).click()
  await expect(page.getByRole('heading', { name: 'Character is ready' })).toBeVisible()
  const reopened = await readSaved()
  expect(reopened.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
  expect(reopened.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
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
    subrace: 'Variant · PHB',
    racialBonuses: ['DEX', 'INT'],
  })
  await selectCharacterFromHome(page, 'Golden Arcane Trickster')
  await chooseHumanFeatAndSkill(page, 'PHB')

  await levelClassTo(page, 3, new Set([3]))
  await chooseSubclass(page, 3, 'Arcane Trickster', 'Choose Roguish Archetype')
  await chooseSpellGain(page, 'Rogue', 'PHB', TRICKSTER_SPELLS[0])
  await levelClassTo(page, 20, new Set([20]), (level) =>
    chooseSpellGain(
      page,
      'Rogue',
      'PHB',
      TRICKSTER_SPELLS.find((row) => row.level === level),
    ),
  )
  await resolveAbilityScoreImprovements(page, [4, 8, 10, 12, 16, 19])

  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(page.getByText('Rogue', { exact: true }).first()).toBeVisible()
  await saveReloadAndAssertReady(
    page,
    'Golden Arcane Trickster',
    TRICKSTER_SPELLS,
    'Rogue',
    'PHB',
    'Arcane Trickster',
  )
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
  await chooseSpellGain(page, 'Fighter', 'XPHB', KNIGHT_SPELLS[0])
  await levelClassTo(page, 20, new Set([20]), async (level) => {
    await chooseSpellGain(
      page,
      'Fighter',
      'XPHB',
      KNIGHT_SPELLS.find((row) => row.level === level),
    )
    if (level === 4) await chooseWeaponMastery(page, 4, 3)
    if (level === 10) await chooseWeaponMastery(page, 5, 4)
    if (level === 16) await chooseWeaponMastery(page, 6, 5)
  })
  await resolveAbilityScoreImprovements(page, [4, 6, 8, 12, 14, 16, 19])

  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(page.getByText('Fighter', { exact: true }).first()).toBeVisible()
  await saveReloadAndAssertReady(
    page,
    'Golden Eldritch Knight',
    KNIGHT_SPELLS,
    'Fighter',
    'XPHB',
    'Eldritch Knight',
  )
})
