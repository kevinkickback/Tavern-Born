import { expect, test } from '@playwright/test'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

test('Overview adapts to zero, one, and many setup choices and class levels', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width: 1600, height: 1000 })
  const base = makeCharacterFixture({
    portrait: 'assets/images/characters/placeholder_char_card.jpg',
    variantRules: { abilityScoreMethod: 'custom' },
    movement: { speeds: { walk: 30, swim: 25, fly: 0 }, source: { kind: 'manual', name: 'Test' } },
  })
  const choices = Array.from({ length: 20 }, (_, index) => ({
    id: `test-language-${index}`,
    domain: 'languages' as const,
    sourceTag: {
      sourceType: 'background' as const,
      sourceName: 'Soldier',
      sourceRef: 'PHB',
      grantType: 'choice' as const,
      label: `Language ${index + 1}`,
    },
    chooseCount: 1,
    optionPool: ['Elvish'],
    selected: [],
    status: 'pending' as const,
  }))
  const classNames = ['Fighter', 'Barbarian', 'Monk', 'Test Class', 'Rogue']
  const classes = classNames.map((name) => ({ name, source: 'PHB', levels: 1 }))
  const states = [
    { name: 'Overview ready', actionCount: 0, classCount: 1 },
    { name: 'Overview one action', actionCount: 1, classCount: 2 },
    { name: 'Overview five actions', actionCount: 5, classCount: 4 },
    { name: 'Overview many actions', actionCount: 20, classCount: 5 },
    { name: 'Overview long actions', actionCount: 5, classCount: 2 },
  ]
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-workbench-overview',
    gameData: {
      ...MINIMAL_GAME_DATA,
      races: [makeRaceFixture({ name: 'Human', source: 'PHB', speed: 30 })],
      classes: classNames.map((name) =>
        makeClassFixture({
          name,
          casterProgression: undefined,
          classTableGroups: [],
          classFeatures: [],
        }),
      ),
      backgrounds: [{ name: 'Soldier', source: 'PHB' }],
      sources: [{ abbreviation: 'PHB', name: "Player's Handbook", group: 'Test' }],
    },
    characters: states.map(({ name, actionCount, classCount }) => ({
      ...base,
      id: name.toLowerCase().replace(/ /g, '-'),
      name,
      classProgression: classes.slice(0, classCount),
      provenance: {
        ...base.provenance!,
        choices: choices.slice(0, actionCount).map((choice) =>
          name === 'Overview long actions'
            ? {
                ...choice,
                sourceTag: {
                  ...choice.sourceTag,
                  label:
                    choice.sourceTag.label + ' from the campaign background options'.repeat(16),
                },
              }
            : choice,
        ),
      },
    })),
  })
  await page.reload()

  const attention = page.getByTestId('overview-attention')
  const manual = page.getByRole('complementary', { name: 'Manual Adjustments' })
  const summary = page.getByRole('region', { name: 'Character overview' })
  const combatStats = summary.locator('[data-slot="overview-combat-stats"]')
  const abilityScores = summary.locator('[data-slot="overview-ability-scores"]')
  const details = page.getByRole('region', { name: 'Character details' })
  const workspace = page.locator('[data-slot="workspace-body"]')
  const chooseCharacter = async (name: string) => {
    await page.getByRole('button', { name: 'Characters', exact: true }).click()
    await selectCharacterFromHome(page, name)
    await expect(summary.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  const alignedPanels = async () => {
    const [head, left, right, below] = await Promise.all(
      [summary, attention, manual, details].map((item) => item.boundingBox()),
    )
    return (
      !!head &&
      !!left &&
      !!right &&
      !!below &&
      right.x > left.x &&
      left.y >= head.y + head.height &&
      Math.abs(right.y - left.y) <= 1 &&
      Math.abs(right.height - left.height) <= 1 &&
      below.y >= Math.max(left.y + left.height, right.y + right.height)
    )
  }
  const panelLayout = async () => {
    const [left, right, below] = await Promise.all(
      [attention, manual, details].map((item) => item.boundingBox()),
    )
    return {
      attentionHeight: Math.round(left!.height),
      manualHeight: Math.round(right!.height),
      detailsTop: Math.round(below!.y - left!.y),
    }
  }
  const expectStableTabs = async () => {
    const expected = await panelLayout()
    expect(expected.attentionHeight).toBe(expected.manualHeight)
    for (const name of ['Stats', 'Multiclass', 'Levels']) {
      await manual.getByRole('tab', { name }).click()
      await expect(manual.getByRole('tabpanel')).toHaveCount(1)
      await expect(manual.getByRole('tabpanel', { name })).toBeVisible()
      const inactivePanels = manual.locator('[role="tabpanel"][inert]')
      await expect(inactivePanels).toHaveCount(2)
      for (const panel of await inactivePanels.all()) {
        await expect(panel).toHaveCSS('opacity', '0')
      }
      await expect.poll(panelLayout).toEqual(expected)
    }
  }

  await selectCharacterFromHome(page, states[0].name)
  const empty = attention.getByText('No required actions', { exact: true })
  await expect(empty).toBeVisible()
  const portrait = summary.getByRole('img', { name: /portrait$/ })
  await expect(portrait.locator('..')).toHaveCSS('aspect-ratio', '5 / 4')
  const save = page.getByRole('button', { name: 'Save character' })
  const levelUp = page.getByRole('button', { name: 'Level up character' })
  await expect(save.getByText('Save changes')).toBeVisible()
  await expect(levelUp.getByText('Level Up')).toBeVisible()
  await expect(attention.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  await expect(attention.getByRole('heading').locator('svg')).toHaveClass(/\btext-success\b/)
  for (const header of [
    attention.getByRole('heading', { name: 'Needs attention' }).locator('..'),
    manual.getByRole('heading', { name: 'Manual Adjustments' }).locator('..'),
  ]) {
    expect(
      await header.evaluate(
        (node) =>
          getComputedStyle(node).backgroundColor !==
          getComputedStyle(node.parentElement!).backgroundColor,
      ),
    ).toBe(true)
  }
  await expect(combatStats).toHaveCSS('border-left-width', '1px')
  await expect(abilityScores).toHaveCSS('border-left-width', '1px')
  const [statsBox, scoresBox] = await Promise.all([
    combatStats.boundingBox(),
    abilityScores.boundingBox(),
  ])
  expect(scoresBox).toMatchObject({ y: statsBox!.y, height: statsBox!.height })
  await expect(summary.getByText('Level 1 · Human', { exact: true })).toBeVisible()
  await expect(summary.getByText('Fighter', { exact: true })).toHaveCSS('font-weight', '400')
  await expect(summary.getByText('Soldier · 2014 rules', { exact: true })).toBeVisible()
  const strength = summary.getByTestId('overview-ability-strength')
  const score = strength.getByText('11', { exact: true })
  const modifier = strength.getByText('(+0)', { exact: true })
  await expect(score).toHaveCSS('font-size', '24px')
  await expect(modifier).toBeVisible()
  const [scoreBox, modifierBox] = await Promise.all([score.boundingBox(), modifier.boundingBox()])
  expect(modifierBox!.y).toBeGreaterThanOrEqual(scoreBox!.y + scoreBox!.height)
  const passives = abilityScores.getByRole('region', { name: 'Passive scores' })
  const passiveLabels = ['Passive:', 'Perception 10', 'Investigation 10', 'Insight 10']
  const expectPassiveRow = async () => {
    const row = await passives.boundingBox()
    for (const label of passiveLabels) {
      const passive = passives.getByText(label, { exact: true })
      await expect(passive).toBeVisible()
      expect((await passive.boundingBox())!.y).toBe(row!.y)
    }
  }
  await expectPassiveRow()
  const movement = summary.getByTestId('overview-movement-walk').locator('..')
  await expect(movement).toHaveCSS('border-top-width', '0px')
  await expect(movement).toHaveCSS('justify-content', 'center')
  const movementBox = (await movement.boundingBox())!
  const passivesBox = (await passives.boundingBox())!
  expect(movementBox.y + movementBox.height).toBeCloseTo(statsBox!.y + statsBox!.height, 0)
  expect(passivesBox.y - modifierBox!.y - modifierBox!.height).toBeGreaterThanOrEqual(12)
  const expectScoreAlignment = async () => {
    const abilityLabel = (await strength.getByText('STR', { exact: true }).boundingBox())!
    const abilityValue = (await score.boundingBox())!
    for (const label of ['Armor Class', 'Max HP', 'Proficiency', 'Initiative']) {
      const combatLabel = combatStats.getByText(label, { exact: true })
      await expect(combatLabel.locator('..')).toHaveCSS('text-align', 'center')
      expect((await combatLabel.boundingBox())!.y).toBeCloseTo(abilityLabel.y, 0)
      expect(
        (await combatLabel.locator('xpath=following-sibling::*').boundingBox())!.y,
      ).toBeCloseTo(abilityValue.y, 0)
    }
  }
  await expectScoreAlignment()
  await expectPassiveRow()
  const summaryContainer = summary.locator('xpath=ancestor::*[contains(@class, "@container")][1]')
  await summaryContainer.evaluate((node) => {
    node.style.width = '64rem'
  })
  await expectScoreAlignment()
  const rootFontSize = await page.locator('html').evaluate((node) => {
    const current = node.style.fontSize
    node.style.fontSize = '12.8px'
    return current
  })
  await expect(combatStats).toHaveCSS('display', 'grid')
  await expectScoreAlignment()
  await page.locator('html').evaluate((node, fontSize) => {
    node.style.fontSize = fontSize
  }, rootFontSize)
  await summaryContainer.evaluate((node) => {
    node.style.removeProperty('width')
  })
  await expect(attention.getByRole('list')).toHaveCount(0)
  await expect.poll(alignedPanels).toBe(true)
  const [attentionBox, manualBox] = await Promise.all([
    attention.boundingBox(),
    manual.boundingBox(),
  ])
  expect(attentionBox!.width).toBeGreaterThan(manualBox!.width * 1.5)
  const minimumHeight = (await attention.boundingBox())!.height
  expect(minimumHeight).toBeGreaterThanOrEqual(190)
  const neutralColor = await attention.evaluate((panel) => getComputedStyle(panel).borderLeftColor)
  await expect(empty).toHaveCSS('place-items', 'center')
  await expectStableTabs()
  await expect(details).toHaveCSS('border-top-width', '0px')
  await expect(details.locator('details')).toHaveCount(8)
  await expect(details.locator('details[open]')).toHaveCount(0)

  const skills = details.locator('details').filter({ hasText: 'Proficiencies & skills' })
  const spells = details.locator('details').filter({ hasText: 'Spells & spellcasting' })
  const equipment = details.locator('details').filter({ hasText: 'Equipment' })
  const equipmentTop = (await equipment.boundingBox())!.y
  await skills.locator('summary').click()
  await expect(skills).toHaveAttribute('open', '')
  await expect(
    skills.getByText(/Passive Perception|Passive Investigation|Passive Insight/),
  ).toHaveCount(0)
  await expect(skills.getByText('◆ Expertise · ● Proficient')).toHaveCSS('text-align', 'center')
  await expect(skills).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(skills).toHaveCSS('border-left-width', '0px')
  expect((await equipment.boundingBox())!.y).toBe(equipmentTop)
  await spells.locator('summary').click()
  await expect(details.locator('details[open]')).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('overview-zero-actions.png') })

  await chooseCharacter(states[1].name)
  await expect(attention.getByRole('listitem')).toHaveCount(1)
  await expect(attention.getByRole('listitem')).toHaveCSS('border-left-width', '1px')
  await expect(attention.getByText('1 required', { exact: true })).toBeVisible()
  await expect(attention.getByRole('button', { name: /View all/ })).toHaveCount(0)
  const action = attention.getByRole('link', { name: /Finish Language 1/ })
  const attentionHeader = attention.getByRole('heading').locator('..')
  await expect(attentionHeader).toHaveCSS(
    'background-color',
    await manual
      .getByRole('heading', { name: 'Manual Adjustments' })
      .locator('..')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  )
  const headerBox = (await attentionHeader.boundingBox())!
  expect((await action.locator('..').boundingBox())!.y - headerBox.y - headerBox.height).toBe(10)
  await expect(action.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const restingColor = await action.evaluate((row) => getComputedStyle(row).backgroundColor)
  await action.hover()
  await expect
    .poll(() => action.evaluate((row) => getComputedStyle(row).backgroundColor))
    .not.toBe(restingColor)
  expect(await attention.evaluate((panel) => getComputedStyle(panel).borderLeftColor)).not.toBe(
    neutralColor,
  )
  await expect(manual.getByRole('button', { name: /Add a level to/ })).toHaveCount(2)
  await expect(
    manual.getByRole('button', { name: 'Add a level to Fighter' }).locator('../..'),
  ).toHaveCSS('border-left-width', '1px')
  await expect.poll(alignedPanels).toBe(true)
  expect((await attention.boundingBox())!.height).toBeGreaterThanOrEqual(minimumHeight)
  await equipment.locator('summary').click()
  await expect(details.locator('details[open]')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('overview-one-action.png') })

  await chooseCharacter(states[2].name)
  await expect(attention.getByRole('listitem')).toHaveCount(4)
  await expect(attention.getByRole('button', { name: 'View all 5 actions' })).toBeVisible()
  await expect(manual.getByRole('button', { name: 'View all 4 classes' })).toBeVisible()

  await chooseCharacter(states[3].name)
  await expect(attention.getByText('20 required', { exact: true })).toBeVisible()
  await expect(attention.getByRole('listitem')).toHaveCount(4)
  await expect
    .poll(() =>
      attention
        .getByRole('list')
        .locator('..')
        .evaluate((node) => node.scrollHeight - node.clientHeight),
    )
    .toBeLessThanOrEqual(1)
  await expect.poll(alignedPanels).toBe(true)
  await expectStableTabs()
  await page.screenshot({ path: testInfo.outputPath('overview-many-actions.png') })
  const actionTrigger = attention.getByRole('button', { name: 'View all 20 actions' })
  await expect(actionTrigger).toHaveCSS('border-width', '0px')
  await expect(actionTrigger).toHaveCSS('align-self', 'flex-end')
  const actionTriggerBox = (await actionTrigger.boundingBox())!
  const lastActionBox = (await attention.getByRole('listitem').last().boundingBox())!
  expect(actionTriggerBox.x + actionTriggerBox.width).toBeCloseTo(
    lastActionBox.x + lastActionBox.width,
    0,
  )
  await actionTrigger.click()
  const allActions = page.getByRole('dialog', { name: 'Character setup' })
  await expect(allActions.getByRole('listitem')).toHaveCount(20)
  await allActions.getByRole('link', { name: /^Finish Language 20/ }).focus()
  await expect(allActions.getByRole('link', { name: /^Finish Language 20/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(actionTrigger).toBeFocused()

  const levels = manual.getByRole('tabpanel', { name: 'Levels' })
  await expect(levels.getByRole('button', { name: /Add a level to/ })).toHaveCount(3)
  const classTrigger = levels.getByRole('button', { name: 'View all 5 classes' })
  await classTrigger.click()
  const allClasses = page.getByRole('dialog', { name: 'Class levels' })
  await expect(allClasses.getByRole('button', { name: /Add a level to/ })).toHaveCount(5)
  await allClasses.getByRole('button', { name: 'Remove a level from Rogue' }).click()
  const remove = page.getByRole('alertdialog', { name: /Remove Level/i })
  await expect(remove).toBeVisible()
  await remove.getByRole('button', { name: /Remove/i }).click()
  await expect(allClasses.getByRole('button', { name: 'Add a level to Rogue' })).toHaveCount(0)
  await expect(remove).toBeHidden()
  await expect(allClasses.getByRole('heading', { name: 'Class levels' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(levels.getByRole('button', { name: 'View all 4 classes' })).toBeFocused()
  await levels.getByRole('button', { name: 'View all 4 classes' }).click()
  await allClasses.getByRole('button', { name: 'Remove a level from Monk' }).click()
  await remove.getByRole('button', { name: /Remove/i }).click()
  await expect(remove).toBeHidden()
  await expect(allClasses.getByRole('heading', { name: 'Class levels' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(manual.getByRole('heading', { name: 'Manual Adjustments' })).toBeFocused()
  await expect(levels.getByRole('button', { name: /View all/ })).toHaveCount(0)

  for (const [mode, label] of Object.entries({
    walk: 'Walk 30 ft.',
    swim: 'Swim 25 ft.',
    fly: 'Fly 0 ft.',
    climb: 'Climb —',
  })) {
    await expect(summary.getByTestId(`overview-movement-${mode}`)).toHaveText(label)
  }
  await page.setViewportSize({ width: 740, height: 720 })
  const compactMovement = (await movement.boundingBox())!
  const compactScores = (await abilityScores.boundingBox())!
  expect(compactMovement.y).toBeGreaterThanOrEqual(compactScores.y + compactScores.height)
  await expect
    .poll(async () => {
      const [left, right] = await Promise.all([attention.boundingBox(), manual.boundingBox()])
      return !!left && !!right && Math.abs(right.x - left.x) <= 1 && right.y >= left.y + left.height
    })
    .toBe(true)
  expect(
    await workspace.evaluate((body) => body.scrollWidth - body.clientWidth),
  ).toBeLessThanOrEqual(1)
  await expectStableTabs()
  await manual.getByRole('tab', { name: 'Stats' }).click()
  const stats = manual.getByRole('tabpanel', { name: 'Stats' })
  for (const name of ['Manage Hit Points', 'Manage Armor Class', 'Manage Movement']) {
    const button = stats.getByRole('button', { name })
    await expect(button).toBeVisible()
    await expect(button).toHaveCSS('justify-content', 'center')
  }
  await page.screenshot({ path: testInfo.outputPath('overview-compact.png'), fullPage: true })
  await actionTrigger.click()
  await allActions.getByRole('link', { name: /^Finish Language 20/ }).click()
  await expect(page).toHaveURL(/\/build\/proficiencies\?attention=choice%3Atest-language-19/)

  await save.click()
  await expect(save).toBeDisabled()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await expect(save.getByText('Save changes')).toBeVisible()
  await expect(levelUp.getByText('Level Up')).toBeVisible()
  await chooseCharacter(states[4].name)
  await page.setViewportSize({ width: 740, height: 720 })
  await expect(attention.getByText('5 required', { exact: true })).toBeVisible()
  await expectStableTabs()
  expect((await attention.boundingBox())!.height).toBeLessThanOrEqual(320)
  const preview = attention.getByRole('list').locator('..')
  await expect(preview).toHaveCSS('overflow-y', 'visible')
  await expect
    .poll(() => preview.evaluate((area) => area.scrollHeight - area.clientHeight))
    .toBeLessThanOrEqual(1)
  await expect
    .poll(() => attention.evaluate((panel) => panel.scrollHeight - panel.clientHeight))
    .toBeLessThanOrEqual(1)
  const fourthAction = attention.getByRole('link', { name: /^Finish Language 4/ })
  await fourthAction.focus()
  await expect(fourthAction).toBeInViewport()
  await expect(attention.getByRole('button', { name: 'View all 5 actions' })).toBeInViewport()
  await attention.getByRole('button', { name: 'View all 5 actions' }).click()
  const longAction = allActions.getByRole('link', { name: /^Finish Language 5/ })
  await expect(longAction.getByText(/Finish Language 5/)).toHaveCSS('white-space', 'normal')
  expect(pageErrors).toEqual([])
})

test('Overview keeps hover and keyboard previews, including from old Review bookmarks', async ({
  page,
}, testInfo) => {
  const character = makeCharacterFixture({
    name: 'Overview Portrait',
    portrait: 'assets/images/characters/placeholder_char_card.jpg',
    equipment: [
      {
        id: 'training-guide',
        name: 'Training Guide',
        type: 'G',
        quantity: 1,
        equipped: false,
        description: 'The field guide explains {@condition petrified|PHB}.',
      },
      {
        id: 'pocket-compass',
        name: 'Pocket Compass',
        type: 'G',
        quantity: 1,
        equipped: false,
        description: 'The needle points north.',
      },
    ],
  })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-overview-seed',
    gameData: {
      ...MINIMAL_GAME_DATA,
      conditions: [{ name: 'Petrified', source: 'PHB', entries: ['Turned to stone.'] }],
    },
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await expect(page).toHaveURL(/\/build\/overview$/)
  await expect(page.getByRole('heading', { name: character.name, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open character sheet' })).toHaveCount(0)
  const overview = page.getByRole('main')
  await overview.getByText('Equipment', { exact: true }).click()
  const guide = overview.getByRole('button', { name: 'Training Guide ×1', exact: true })
  const compass = overview.getByRole('button', { name: 'Pocket Compass ×1', exact: true })
  const [guideBox, compassBox] = await Promise.all([guide.boundingBox(), compass.boundingBox()])
  expect(guideBox!.y).toBe(compassBox!.y)
  expect(guideBox!.x).not.toBe(compassBox!.x)
  await guide.hover()
  const hoveredGuide = page.getByRole('dialog', { name: 'Training Guide ×1 preview', exact: true })
  await expect(hoveredGuide.getByText(/The field guide explains/)).toBeVisible()
  await hoveredGuide.hover()
  await expect(hoveredGuide).toBeVisible()
  await compass.hover()
  await expect(hoveredGuide).toBeHidden()
  await expect(
    page
      .getByRole('dialog', { name: 'Pocket Compass ×1 preview' })
      .getByText('The needle points north.'),
  ).toBeVisible()
  await overview.getByRole('heading', { name: character.name, exact: true }).hover()
  await expect(page.getByRole('dialog', { name: 'Pocket Compass ×1 preview' })).toBeHidden()
  for (const route of ['/build/review', '/build/review?section=overview']) {
    await page.goto(`/#${route}`)
    await expect(page).toHaveURL(/\/build\/overview$/)
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  }

  const panel = overview
  const sections = panel.locator('details')
  await expect(sections).toHaveCount(8)
  await expect(panel.locator('details[open]')).toHaveCount(0)

  const portrait = panel.getByRole('img', { name: 'Overview Portrait portrait' })
  await expect(portrait).toBeVisible()
  await expect
    .poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  const presentation = await portrait.evaluate((image: HTMLImageElement) => ({
    objectFit: getComputedStyle(image).objectFit,
    objectPosition: getComputedStyle(image).objectPosition,
    transform: getComputedStyle(image).transform,
    frameWidth: image.parentElement?.getBoundingClientRect().width,
    frameHeight: image.parentElement?.getBoundingClientRect().height,
  }))
  expect(presentation.objectFit).toBe('cover')
  expect(presentation.objectPosition).toBe('50% 25%')
  expect(presentation.transform).toBe('none')
  expect(presentation.frameWidth).toBeGreaterThan(0)
  expect(presentation.frameWidth! / presentation.frameHeight!).toBeCloseTo(1.25, 1)
  await panel.screenshot({ path: testInfo.outputPath('overview.png') })

  await panel.getByText('Equipment', { exact: true }).click()
  const equipment = panel.getByRole('button', { name: 'Training Guide ×1', exact: true })
  await equipment.click()
  const item = page.getByRole('dialog', { name: 'Training Guide ×1 preview', exact: true })
  const conditionRef = item.getByRole('button', { name: /^petrified$/i })
  const condition = page.getByRole('dialog', { name: /^petrified preview$/i })
  await conditionRef.focus()
  await expect(condition).toBeVisible()
  await expect(condition.getByText('Turned to stone.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(condition).toBeHidden()
  await expect(item).toBeVisible()
  await expect(conditionRef).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(item).toBeHidden()
  await expect(equipment).toBeFocused()
})
