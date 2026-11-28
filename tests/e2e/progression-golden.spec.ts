import { expect, type Page, test } from '@playwright/test'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { Class5e, ClassFeatureReference, GameData } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import {
  MINIMAL_GAME_DATA,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

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
  const classFeatures: string[] = []
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
    classFeatures.push(mastery.ref)
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
    classFeatures,
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
  classFeatures: [
    ...castingFixture.gameData.classFeatures,
    fighter.classFeatureRefs!.find((row) => row.name === 'Weapon Mastery')!.feature!,
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
  await expect(dialog.getByRole('heading', { name: 'Choose sourcebooks' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: new RegExp(`Human\\s+${options.raceSource}`) }).click()
  const raceChoicesTab = dialog.getByRole('tab', { name: 'Choices', exact: true })
  if (options.subrace || options.racialBonuses || (await raceChoicesTab.isVisible()))
    await raceChoicesTab.click()
  if (options.subrace) {
    const subrace = dialog.getByRole('button', { name: options.subrace, exact: true })
    if (await subrace.isVisible()) await subrace.click()
    else
      await expect(
        dialog.getByRole('heading', { name: `Human (${options.subrace})` }),
      ).toBeVisible()
  }
  if (options.racialBonuses) {
    const selectors = dialog.getByTestId('race-ability-choices').getByRole('combobox')
    for (const ability of options.racialBonuses) {
      await selectors.first().click()
      await page.getByRole('option', { name: ability, exact: true }).click()
    }
  }
  if (options.raceSource === 'XPHB') {
    await dialog.getByRole('combobox', { name: 'Racial size' }).click()
    await page.getByRole('option', { name: 'Medium', exact: true }).click()
  }
  await dialog.getByRole('combobox', { name: /^Skills ·/ }).click()
  await page.getByRole('option', { name: 'Acrobatics', exact: true }).click()
  if (options.subrace) {
    await dialog.getByRole('button', { name: 'Choose feat', exact: true }).click()
    const featDialog = page.getByRole('dialog', { name: 'Select Feats' })
    await featDialog.getByLabel('Search select feats').fill('Alert')
    await featDialog.getByRole('button').filter({ hasText: 'AlertPHB' }).click()
    await featDialog.getByRole('button', { name: 'Confirm' }).click()
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog
    .getByRole('button', { name: new RegExp(`${options.className}\\s+${options.classSource}`) })
    .click()
  if (options.classSource === 'XPHB') {
    await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
    await dialog.getByRole('button', { name: 'Choose Weapon Mastery' }).click()
    const mastery = page.getByRole('dialog', { name: 'Choose weapons for Weapon Mastery' })
    for (const name of MASTERY_WEAPONS.slice(0, 3))
      await mastery
        .getByRole('button')
        .filter({ has: page.getByText(name, { exact: true }) })
        .click()
    await mastery.getByRole('button', { name: 'Confirm' }).click()
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog
    .getByRole('button', {
      name: new RegExp(`${options.background}\\s+${options.backgroundSource}`),
    })
    .click()
  if (options.backgroundSource === 'XPHB') {
    await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
    for (const [label, pick] of [
      ['Background ability bonus +2', 'STR'],
      ['Background ability bonus +1', 'CON'],
      [/^Languages ·/, 'Dwarvish'],
      [/^Languages ·/, 'Elvish'],
    ] as const) {
      await dialog.getByRole('combobox', { name: label }).click()
      await page.getByRole('option', { name: pick, exact: true }).click()
    }
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText(options.name)).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
}

async function chooseWeaponMastery(page: Page, level = 1, count = 3, previous = 0) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const levelName = new RegExp(`^Level ${level}\\b`)
  const trigger = page.getByRole('button', { name: levelName })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  const group = page
    .getByRole('region', { name: levelName })
    .getByRole('group', { name: 'Weapon Mastery', exact: true })
  await expect(group.getByText(`0 / ${count - previous} chosen`, { exact: true })).toBeVisible()
  await group.getByRole('button', { name: 'Choose', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Choose weapons for Weapon Mastery' })
  for (const name of MASTERY_WEAPONS.slice(previous, count)) {
    await modal
      .getByRole('button')
      .filter({ has: page.getByText(name, { exact: true }) })
      .click()
  }
  await modal.getByRole('button', { name: 'Confirm' }).click()
  await expect(
    group.getByText(`${count - previous} / ${count - previous} chosen`, { exact: true }),
  ).toBeVisible()
  for (const name of MASTERY_WEAPONS.slice(previous, count)) {
    await expect(group.getByText(name, { exact: true })).toBeVisible()
  }
}

async function assertCurrentHpMatchesMaximum(page: Page, maximum: number) {
  const controls = page.getByRole('complementary', { name: 'Manual Adjustments' })
  await controls.getByRole('tab', { name: 'Stats' }).click()
  await controls.getByRole('button', { name: 'Manage Hit Points' }).click()
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
  const characterLevel = (pattern: RegExp) =>
    page
      .getByRole('region', { name: 'Character overview' })
      .getByText(pattern)
      .or(page.getByRole('banner').getByText(pattern))
  const currentLevelText = await characterLevel(/\bLevel \d+/).textContent()
  const currentLevel = Number(currentLevelText?.match(/\bLevel (\d+)/)?.[1] ?? 1)
  const controls = page.getByRole('complementary', { name: 'Manual Adjustments' })

  for (const level of LEVEL_SEQUENCE.filter(
    (candidate) => candidate > currentLevel && candidate <= targetLevel,
  )) {
    await page.getByRole('link', { name: /^Overview\b/ }).click()
    await controls.getByRole('tab', { name: 'Levels' }).click()
    await controls
      .getByRole('button', { name: /^Add a level to / })
      .first()
      .click()
    await expect(controls.getByText(new RegExp(`^Level ${level} ·`))).toBeVisible()
    const maximum = Number(
      await page
        .getByText('Max HP', { exact: true })
        .locator('xpath=following-sibling::*[1]')
        .textContent(),
    )
    expect(maximum).toBeGreaterThan(0)

    if (checkpointLevels.has(level)) {
      await assertCurrentHpMatchesMaximum(page, maximum)
    }
    await onLevel?.(level)
  }
  await expect(characterLevel(new RegExp(`\\bLevel ${targetLevel}\\b`))).toBeVisible()
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
    const trigger = page.getByRole('button', { name: new RegExp(`Level ${level}\\b`) })
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
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
  await page.getByRole('link', { name: /^Overview\b/ }).click()
  await expect(page.getByText('No required actions', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Characters' }).click()
  await selectCharacterFromHome(page, characterName)
  await page.getByRole('link', { name: /^Overview\b/ }).click()
  await expect(page.getByText('No required actions', { exact: true })).toBeVisible()
  const reopened = await readSaved()
  expect(reopened.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
  expect(reopened.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
}

test.use({ viewport: { width: 1440, height: 900 } })

test('Guided Level Up requires a manual-rule hit die result and saves only applied levels', async ({
  page,
}) => {
  const character = makeCharacterFixture({
    name: 'Manual HP Fighter',
    initialClass: { name: 'Fighter', source: 'PHB' },
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    variantRules: { averageHitPoints: false },
  })
  const fighter = makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { number: 1, faces: 10 } })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-guided-manual-hp',
    gameData: { ...MINIMAL_GAME_DATA, classes: [fighter] },
    characters: [character],
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  const header = page.getByRole('banner')
  const wizard = page.getByRole('dialog', { name: 'Level Up', exact: true })
  const result = wizard.getByRole('spinbutton', { name: /Hit die result/ })
  const apply = wizard.getByRole('button', { name: 'Apply level' })
  const save = header.getByRole('button', { name: 'Save character' })
  const savedCharacter = async () =>
    characterPersistenceSchema.array().parse(await readPersistedCharacters(page))[0]
  const savedGain = async (classLevel: number) =>
    (await savedCharacter()).hitPointGains?.find((gain) => gain.classLevel === classLevel)
  const openReview = async () => {
    await header.getByRole('button', { name: 'Level up character' }).click()
    await wizard.getByRole('button', { name: 'Next', exact: true }).click()
    await wizard.getByRole('button', { name: 'Review level' }).click()
    await expect(apply).toBeDisabled()
  }

  const before = await savedCharacter()
  await openReview()
  await result.fill('11')
  await expect(apply).toBeDisabled()
  await result.fill('7')
  await expect(apply).toBeEnabled()
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(wizard).toBeHidden()
  await expect(save).toBeDisabled()
  expect(await savedCharacter()).toEqual(before)

  await openReview()
  await result.fill('7')
  await apply.click()
  await expect(wizard).toBeHidden()
  await save.click()
  await expect
    .poll(() => savedGain(2))
    .toMatchObject({
      classLevel: 2,
      hitDie: 10,
      dieResult: 7,
      method: 'manual',
    })

  await openReview()
  await wizard.getByRole('button', { name: 'Roll d10' }).click()
  const roll = Number(await result.inputValue())
  expect(roll).toBeGreaterThanOrEqual(1)
  expect(roll).toBeLessThanOrEqual(10)
  await apply.click()
  await expect(wizard).toBeHidden()
  await save.click()
  await expect
    .poll(() => savedGain(3))
    .toMatchObject({
      classLevel: 3,
      hitDie: 10,
      dieResult: roll,
      method: 'rolled',
    })
})

test('Guided Level Up reopens spell and feature pickers when an exact choice is removed', async ({
  page,
}, testInfo) => {
  const base = makeCharacterFixture()
  const character = makeCharacterFixture({
    name: 'Guided choice pills',
    originSystem: '2024',
    initialClass: { name: 'Fighter', source: 'XPHB' },
    classProgression: [
      {
        name: 'Fighter',
        source: 'XPHB',
        levels: 3,
        subclass: 'Eldritch Knight',
        subclassSource: 'XPHB',
      },
    ],
    proficiencies: { ...base.proficiencies, weapons: ['simple', 'martial'] },
  })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-guided-choice-pills',
    gameData: PROGRESSION_GAME_DATA,
    characters: [character],
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)

  const saved = async () =>
    characterPersistenceSchema.array().parse(await readPersistedCharacters(page))[0]
  const before = await saved()
  const header = page.getByRole('banner')
  await header.getByRole('button', { name: 'Level up character' }).click()
  const wizard = page.getByRole('dialog', { name: 'Level Up', exact: true })
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()

  const chooseSpells = wizard.getByRole('button', { name: 'Choose spells', exact: true })
  const draft = page.getByRole('dialog', { name: 'Fighter spells at level 4' })
  const pickSpell = async (name: string) => {
    await chooseSpells.click()
    await draft
      .getByRole('group', { name: 'Spell 1', exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
    const picker = page.getByRole('dialog', { name: 'Choose spell 1', exact: true })
    await picker.getByRole('textbox', { name: /Search/ }).fill(name)
    await picker.getByRole('button').filter({ hasText: name }).first().click()
    await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
    await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  }
  await pickSpell('Thunderwave')
  const removeSpell = wizard.getByRole('button', { name: 'Remove Thunderwave', exact: true })
  await expect(removeSpell).toHaveAccessibleDescription('Source XPHB')
  await expect(wizard.getByRole('button', { name: /^(Choose|Edit) spells$/ })).toHaveCount(0)
  await removeSpell.press('Enter')
  await expect(removeSpell).toHaveCount(0)
  await expect(chooseSpells).toBeVisible()
  await pickSpell('Shield')
  await expect(wizard.getByRole('button', { name: 'Remove Shield', exact: true })).toBeVisible()

  const masteryButton = wizard.getByRole('button', { name: /^(Choose|Edit) Weapon Mastery$/i })
  const mastery = page.getByRole('dialog', { name: /Choose weapons for Weapon Mastery/i })
  const confirm = mastery.getByRole('button', { name: 'Confirm', exact: true })
  const pickWeapon = async (name: string) => {
    await mastery.getByRole('textbox', { name: /Search/ }).fill(name)
    await mastery.getByRole('button', { name: new RegExp('^' + name + '\\b') }).click()
  }
  await masteryButton.click()
  for (const weapon of MASTERY_WEAPONS.slice(0, 4)) await pickWeapon(weapon)
  await confirm.click()
  await expect(masteryButton).toHaveCount(0)
  const removeWeapon = wizard.getByRole('button', { name: /^Remove Longsword\b/ })
  await removeWeapon.click()
  await expect(removeWeapon).toHaveCount(0)
  await expect(wizard.getByRole('button', { name: /^Remove Longbow\b/ })).toBeVisible()
  await masteryButton.click()
  await pickWeapon('Dagger')
  await confirm.click()
  await expect(masteryButton).toHaveCount(0)
  expect(await saved()).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('guided-choice-pills.png') })

  await wizard.getByRole('button', { name: 'Review level' }).click()
  await wizard.getByRole('button', { name: 'Apply level', exact: true }).click()
  await header.getByRole('button', { name: 'Save character' }).click()
  await expect.poll(async () => (await saved()).classProgression[0].levels).toBe(4)
  const applied = await saved()
  expect(
    applied.managedClassSpellChoices
      ?.filter(({ slot }) => slot[3] === 4)
      .map(({ target }) => target),
  ).toEqual([{ name: 'Shield', source: 'XPHB' }])
  expect(
    applied.classChoiceSelections
      ?.find(({ label }) => label === 'Weapon Mastery')
      ?.selected.map(({ name }) => name)
      .sort(),
  ).toEqual(['Battleaxe', 'Dagger', 'Greataxe', 'Longbow'])
})

test('Creator hides the Wizard spell picker when full and reopens a choice from a pill', async ({
  page,
}) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-creator-class-spell-pills',
    gameData: {
      ...PROGRESSION_GAME_DATA,
      races: [{ name: 'Hillborn', source: 'PHB', size: ['M'], speed: 30, ability: [{ con: 1 }] }],
    },
    characters: [],
  })
  await page.reload()
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const creator = page.getByRole('dialog', { name: 'Create New Character' })
  const next = creator.getByRole('button', { name: 'Next', exact: true })
  await creator.getByLabel('Character Name').fill('Spell pill test')
  for (let step = 0; step < 4; step++) await next.click()
  await creator.getByRole('button', { name: /^Wizard\s+PHB/ }).click()
  await creator.getByRole('tab', { name: 'Choices', exact: true }).click()
  await creator.getByRole('button', { name: 'Choose spells', exact: true }).click()
  const draft = page.getByRole('dialog', { name: 'Wizard spells at level 1' })
  const pickSpell = async (pickerName: string, name: string) => {
    await draft
      .getByRole('group', { name: pickerName, exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
    const picker = page.getByRole('dialog', {
      name: `Choose ${pickerName.toLowerCase()}`,
      exact: true,
    })
    await picker.getByRole('textbox', { name: /Search/ }).fill(name)
    await picker
      .getByRole('button')
      .filter({ has: page.getByText(name, { exact: true }) })
      .filter({ has: page.getByText('PHB', { exact: true }) })
      .click()
    await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
  }
  const cantrips = ['Fire Bolt', 'Light', 'Mage Hand']
  const book = [
    'Magic Missile',
    'Shield',
    'Burning Hands',
    'Charm Person',
    'Silent Image',
    'Thunderwave',
  ]
  for (const [index, name] of cantrips.entries()) await pickSpell(`Cantrip ${index + 1}`, name)
  for (const [index, name] of book.entries()) await pickSpell(`Spell ${index + 1}`, name)
  await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(draft).toBeHidden()
  const edit = creator.getByRole('button', { name: 'Edit spells', exact: true })
  const row = creator
    .getByRole('heading', { name: 'Spells', exact: true })
    .locator('xpath=ancestor::section[1]')
  await expect(edit).toHaveCount(0)
  await expect(row.getByText('Complete', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: /^Remove / })).toHaveCount(9)
  const fireBolt = row.getByRole('button', { name: 'Remove Fire Bolt', exact: true })
  await expect(fireBolt).toHaveAccessibleDescription('Source PHB')
  await fireBolt.press('Enter')
  await expect(fireBolt).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Remove Light', exact: true })).toBeVisible()
  await expect(row.getByText('Complete', { exact: true })).toHaveCount(0)
  await expect(edit).toBeVisible()
  await expect(next).toBeDisabled()
  await edit.click()
  await pickSpell('Cantrip 1', 'Ray of Frost')
  await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Remove Ray of Frost', exact: true })).toBeVisible()
  await expect(edit).toHaveCount(0)
  await expect(row.getByText('Complete', { exact: true })).toBeVisible()
})

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
  await page.getByRole('link', { name: 'Feats', exact: true }).click()
  await expect(page.getByText('Savage Attacker', { exact: true }).first()).toBeVisible()

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
    if (level === 4) await chooseWeaponMastery(page, level, 4, 3)
    if (level === 10) await chooseWeaponMastery(page, level, 5, 4)
    if (level === 16) await chooseWeaponMastery(page, level, 6, 5)
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
