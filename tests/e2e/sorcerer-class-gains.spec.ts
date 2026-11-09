import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeBundledClassCastingLayer } from '../fixtures/classCastingFixtures'
import { makeOptionalDeclarationLayer } from '../fixtures/optionalClassDeclarationFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function openLevel(page: Page, level: number) {
  const trigger = page.getByRole('button', { name: new RegExp(`^Level ${level},`) })
  if ((await trigger.getAttribute('data-state')) === 'closed') await trigger.click()
  return page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`)
}

async function levelUp(page: Page, level: number) {
  const dialog = page.getByRole('dialog', { name: 'Level Up Character' })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Level up character', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Level Up', exact: true }).first().click()
  await expect(dialog.getByText(String(level), { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(dialog).toBeHidden()
}

async function chooseMetamagic(page: Page, level: number, names: string[]) {
  const group = (await openLevel(page, level)).getByRole('group', {
    name: 'Metamagic',
    exact: true,
  })
  await expect(group.getByText(`0 / ${names.length} chosen`, { exact: true })).toBeVisible()
  await group.getByRole('button', { name: 'Choose', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const search = dialog.getByRole('textbox', { name: /search/i })
  await search.fill('Twinned Spell')
  await expect(
    dialog.locator('button[aria-pressed]').filter({ hasText: 'Twinned Spell' }),
  ).toHaveCount(0)
  for (const name of names) {
    await search.fill(name)
    const card = dialog.locator('button[aria-pressed]').filter({ hasText: name })
    await card.click({ position: { x: 8, y: 8 } })
    await expect(card).toHaveAttribute('aria-pressed', 'true')
  }
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    group.getByText(`${names.length} / ${names.length} chosen`, { exact: true }),
  ).toBeVisible()
}

async function openFeature(page: Page, level: number, feature: string, rules: RegExp) {
  const content = await openLevel(page, level)
  await content.getByRole('button', { name: feature, exact: true }).click()
  await expect(page.getByRole('heading', { name: feature, exact: true })).toBeVisible()
  await expect(page.getByText(rules).first()).toBeVisible()
}

for (const edition of ['2014', '2024'] as const) {
  test(`@focused ${edition} Sorcerer edits earned Metamagic and opens its later subclass features through save and reopen`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const classic = edition === '2014'
    const source = classic ? 'PHB' : 'XPHB'
    const initialLevel = classic ? 3 : 2
    const subclass = classic ? 'Draconic Bloodline' : 'Draconic Sorcery'
    const capstone = classic ? 'Draconic Presence' : 'Dragon Companion'
    const wingsRules = classic
      ? /flying speed equal to your current speed/i
      : /fly speed of 60 feet/i
    const capstoneRules = classic ? /aura of awe or fear/i : /without a Material component/i
    const at10 = classic ? ['Careful Spell'] : ['Careful Spell', 'Distant Spell']
    const at17 = classic ? ['Empowered Spell'] : ['Empowered Spell', 'Extended Spell']
    const initial = ['Heightened Spell', 'Twinned Spell']
    const gameData = makeBundledClassCastingLayer('class/class-sorcerer.json')
    gameData.optionalfeatures = parseOptionalFeatures(
      JSON.parse(readFileSync('resources/srd/data/optionalfeatures.json', 'utf8')),
    )
    const actor = makeCharacterFixture({
      name: `Draconic Sorcerer ${edition}`,
      originSystem: edition,
      allowedSources: [source],
      classProgression: [{ name: 'Sorcerer', source, levels: 9, subclass, subclassSource: source }],
      classChoiceSelections: [
        {
          choiceId: `class:sorcerer|${source.toLowerCase()}|choice:metamagic|${initialLevel}`,
          label: 'Metamagic',
          kind: 'optional-feature',
          className: 'Sorcerer',
          classSource: source,
          classLevel: initialLevel,
          selected: initial.map((name) => ({
            entityType: 'optionalFeature',
            name,
            source,
            slotLevel: initialLevel,
          })),
        },
      ],
    })

    await page.goto('/')
    await seedAppState(page, {
      sourcePath: `e2e-sorcerer-gains-${edition}`,
      gameData,
      characters: [actor],
    })
    await page.reload()
    await selectCharacterFromHome(page, actor.name)
    await page.getByRole('link', { name: 'Class', exact: true }).click()

    for (let level = 10; level <= 18; level++) {
      await levelUp(page, level)
      if (level === 10) await chooseMetamagic(page, 10, at10)
      if (level === 14) await openFeature(page, 14, 'Dragon Wings', wingsRules)
      if (level === 17) await chooseMetamagic(page, 17, at17)
      if (level === 18) await openFeature(page, 18, capstone, capstoneRules)
    }

    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    const expected = [
      ...initial.map((name) => `${initialLevel}|${name}|${source}`),
      ...at10.map((name) => `10|${name}|${source}`),
      ...at17.map((name) => `17|${name}|${source}`),
    ].sort()
    await expect
      .poll(async () => {
        const row = (await readPersistedCharacters(page)).find(
          (value) => (value as { id: string }).id === actor.id,
        )
        const saved = characterPersistenceSchema.parse(row)
        return saved.classChoiceSelections
          ?.find((choice) => choice.label === 'Metamagic')
          ?.selected.map((choice) => `${choice.slotLevel}|${choice.name}|${choice.source}`)
          .sort()
      })
      .toEqual(expected)

    await page.reload()
    await selectCharacterFromHome(page, actor.name)
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    for (const [level, names] of [
      [initialLevel, initial],
      [10, at10],
      [17, at17],
    ] as const) {
      const group = (await openLevel(page, level)).getByRole('group', {
        name: 'Metamagic',
        exact: true,
      })
      await expect(
        group.getByText(`${names.length} / ${names.length} chosen`, { exact: true }),
      ).toBeVisible()
      for (const name of names) await expect(group.getByText(name, { exact: true })).toBeVisible()
    }
    await openFeature(page, 14, 'Dragon Wings', wingsRules)
    await openFeature(page, 18, capstone, capstoneRules)
  })
}

test('@focused classic Battle Master chooses Maneuvers at the earned Fighter levels', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const gameData = makeOptionalDeclarationLayer('class/class-fighter.json', (document) => {
    document.subclassFeature.push({
      name: 'Additional Maneuvers',
      className: 'Fighter',
      classSource: 'PHB',
      subclassShortName: 'Battle Master',
      subclassSource: 'PHB',
      source: 'PHB',
      level: 7,
      entries: ['At 7th level, you learn two additional maneuvers of your choice.'],
    })
    document.classFeature.push({
      name: 'Martial Archetype feature',
      className: 'Fighter',
      classSource: 'PHB',
      source: 'PHB',
      level: 18,
      entries: ['At 18th level, you gain a feature granted by your Martial Archetype.'],
    })
  })
  const cls = gameData.classes.find((entry) => entry.name === 'Fighter' && entry.source === 'PHB')
  const subclass = cls?.subclasses?.find(
    (entry) => entry.name === 'Battle Master' && entry.source === 'PHB',
  )
  const maneuvers = subclass?.normalizedRules?.choices.find(
    (choice) => choice.label === 'Maneuvers',
  )
  if (!maneuvers) throw new Error('Missing the configured Battle Master progression')
  const initial = ['Precision Attack', 'Trip Attack', 'Menacing Attack']
  const actor = makeCharacterFixture({
    name: 'Battle Master with earned maneuvers',
    allowedSources: ['PHB'],
    classProgression: [
      {
        name: 'Fighter',
        source: 'PHB',
        levels: 18,
        subclass: 'Battle Master',
        subclassSource: 'PHB',
      },
    ],
    classChoiceSelections: [
      {
        choiceId: maneuvers.id,
        label: 'Maneuvers',
        kind: 'optional-feature',
        className: 'Fighter',
        classSource: 'PHB',
        subclassName: 'Battle Master',
        subclassSource: 'PHB',
        classLevel: 3,
        selected: initial.map((name) => ({
          entityType: 'optionalFeature',
          name,
          source: 'PHB',
          slotLevel: 3,
        })),
      },
    ],
  })
  await page.goto('/')
  await seedAppState(page, { sourcePath: 'e2e-battle-master-gains', gameData, characters: [actor] })
  await page.reload()
  await selectCharacterFromHome(page, actor.name)
  await page.getByRole('link', { name: /^Review/ }).click()
  await page.getByRole('button', { name: /^Finish Maneuvers/ }).click()
  const dialog = page.getByRole('dialog')
  const search = dialog.getByRole('textbox', { name: /search/i })
  await search.fill('Precision Attack')
  await expect(
    dialog.locator('button[aria-pressed]').filter({ hasText: 'Precision Attack' }),
  ).toHaveCount(0)
  for (const name of ['Disarming Attack', 'Pushing Attack']) {
    await search.fill(name)
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: name })
      .click({ position: { x: 8, y: 8 } })
  }
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(dialog).toBeHidden()
  const group = (await openLevel(page, 7)).getByRole('group', { name: 'Maneuvers', exact: true })
  await expect(group.getByText('2 / 2 chosen', { exact: true })).toBeVisible()
  await group.getByRole('button', { name: 'Additional Maneuvers', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Additional Maneuvers', exact: true }),
  ).toBeVisible()
  for (const level of [10, 15]) {
    await expect(
      (await openLevel(page, level))
        .getByRole('group', { name: 'Maneuvers', exact: true })
        .getByText('0 / 2 chosen', { exact: true }),
    ).toBeVisible()
  }
  await expect(
    (await openLevel(page, 18)).getByRole('group', { name: 'Maneuvers', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const row = (await readPersistedCharacters(page)).find(
        (value) => (value as { id: string }).id === actor.id,
      )
      return characterPersistenceSchema
        .parse(row)
        .classChoiceSelections?.find((choice) => choice.choiceId === maneuvers.id)
        ?.selected.map((option) => option.slotLevel)
    })
    .toEqual([3, 3, 3, 7, 7])
  await page.reload()
  await selectCharacterFromHome(page, actor.name)
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  for (const [level, count] of [
    [3, 3],
    [7, 2],
  ] as const) {
    await expect(
      (await openLevel(page, level))
        .getByRole('group', { name: 'Maneuvers', exact: true })
        .getByText(`${count} / ${count} chosen`, { exact: true }),
    ).toBeVisible()
  }
})

for (const edition of ['2014', '2024'] as const) {
  test(`@focused ${edition} Warlock chooses and reopens additional Invocations at level 5`, async ({
    page,
  }) => {
    const classic = edition === '2014'
    const source = classic ? 'PHB' : 'XPHB'
    const initial = classic
      ? ['Armor of Shadows', 'Beast Speech']
      : ['Armor of Shadows', 'Mask of Many Faces', 'Eldritch Mind']
    const gained = classic ? ['Mask of Many Faces'] : ["Devil's Sight", 'Otherworldly Leap']
    const subclass = classic ? 'The Fiend' : 'Fiend Patron'
    const initialLevel = classic ? 2 : 1
    const choiceId = `class:warlock|${source.toLowerCase()}|choice:eldritch-invocations|${initialLevel}`
    const gameData = makeBundledClassCastingLayer('class/class-warlock.json')
    gameData.optionalfeatures = parseOptionalFeatures(
      JSON.parse(readFileSync('resources/srd/data/optionalfeatures.json', 'utf8')),
    )
    const actor = makeCharacterFixture({
      name: `Fiend Warlock ${edition}`,
      originSystem: edition,
      allowedSources: [source],
      classProgression: [{ name: 'Warlock', source, levels: 4, subclass, subclassSource: source }],
      classChoiceSelections: [
        {
          choiceId,
          label: 'Eldritch Invocations',
          kind: 'optional-feature',
          className: 'Warlock',
          classSource: source,
          classLevel: initialLevel,
          selected: initial.map((name, index) => ({
            entityType: 'optionalFeature',
            name,
            source,
            slotLevel: index === 0 ? initialLevel : 2,
          })),
        },
      ],
    })

    await page.goto('/')
    await seedAppState(page, {
      sourcePath: `e2e-warlock-gains-${edition}`,
      gameData,
      characters: [actor],
    })
    await page.reload()
    await selectCharacterFromHome(page, actor.name)
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    await levelUp(page, 5)
    const group = (await openLevel(page, 5)).getByRole('group', {
      name: 'Eldritch Invocations',
      exact: true,
    })
    await expect(group.getByText(`0 / ${gained.length} chosen`, { exact: true })).toBeVisible()
    await group.getByRole('button', { name: 'Choose', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose Eldritch Invocations' })
    await expect(
      dialog.getByText(`${initial.length}/${initial.length + gained.length} selections`, {
        exact: true,
      }),
    ).toBeVisible()
    const search = dialog.getByRole('textbox', { name: /search/i })
    for (const name of gained) {
      await search.fill(name)
      await dialog
        .locator('button[aria-pressed]')
        .filter({ hasText: name })
        .click({ position: { x: 8, y: 8 } })
    }
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()

    const expected = [
      ...initial.map((name, index) => `${index === 0 ? initialLevel : 2}|${name}`),
      ...gained.map((name) => `5|${name}`),
    ].sort()
    await expect
      .poll(async () => {
        const row = (await readPersistedCharacters(page)).find(
          (value) => (value as { id: string }).id === actor.id,
        )
        return characterPersistenceSchema
          .parse(row)
          .classChoiceSelections?.find((choice) => choice.choiceId === choiceId)
          ?.selected.map((option) => `${option.slotLevel}|${option.name}`)
          .sort()
      })
      .toEqual(expected)

    await page.reload()
    await selectCharacterFromHome(page, actor.name)
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    const reopened = (await openLevel(page, 5)).getByRole('group', {
      name: 'Eldritch Invocations',
      exact: true,
    })
    await expect(
      reopened.getByText(`${gained.length} / ${gained.length} chosen`, { exact: true }),
    ).toBeVisible()
    for (const name of gained) await expect(reopened.getByText(name, { exact: true })).toBeVisible()
  })
}
