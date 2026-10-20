import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeCannyFixture } from '../fixtures/cannyFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('@focused Class header and replacement tabs preserve independent choices through reopening', async ({
  page,
}) => {
  const fixture = makeCannyFixture(6)
  const { data } = makeOptionalClassSourceData()
  data.skills = fixture.data.skills
  data.languages = fixture.data.languages
  const ranger = data.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
  ranger.subclasses = fixture.classData.subclasses
  const subclass = ranger.subclasses!.find((row) => row.source === 'PHB')!
  const parsedFighter = parseClassDocument(
    JSON.parse(readFileSync('resources/srd/core/data/class/class-fighter.json', 'utf8')),
  )
  data.classes.push(...(parsedFighter.classes as Class5e[]))
  data.classFeatures.push(...(parsedFighter.classFeatures as ClassFeature[]))
  data.lookups = buildGameDataLookups(data)
  const character = {
    ...fixture.character,
    name: 'Class Presentation',
    optionalClassFeatureAdoptions: [],
    classProgression: [
      {
        name: 'Ranger',
        source: 'PHB',
        levels: 6,
        subclass: subclass.name,
        subclassSource: subclass.source,
      },
      { name: 'Fighter', source: 'PHB', levels: 1 },
    ],
  }
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-class-presentation', data)
  await seedAppState(page, {
    sourcePath: 'e2e-class-presentation',
    gameData: data,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const header = page.getByRole('region', { name: 'Selected class' })
  await expect(header.getByRole('heading', { name: 'Ranger Level 6', exact: true })).toBeVisible()
  await expect(header.locator('img')).toHaveAttribute('src', /ranger\.svg/)
  await expect(header.getByRole('link')).toHaveCount(0)
  await expect(header.getByRole('button')).toHaveCount(0)
  await expect(header.getByText(`PHB · ${subclass.name}`, { exact: true })).toBeVisible()
  const level = page.getByRole('button', { name: /^Level 1,/ })
  await level.click()
  await expect(level.getByText(/\d+ Features?/)).toBeVisible()
  const deft = page.getByRole('tab', { name: /^Deft Explorer/ })
  const natural = page.getByRole('tab', { name: /^Natural Explorer/ })
  const enemy = page.getByRole('tab', { name: /^Favored Enemy/ })
  const foe = page.getByRole('tab', { name: /^Favored Foe/ })
  await deft.click()
  await expect(deft).toHaveAttribute('aria-selected', 'true')
  await expect(enemy).toHaveAttribute('aria-selected', 'true')
  const canny = page.getByRole('tabpanel', { name: /^Deft Explorer/ })
  await expect(deft).toHaveAccessibleName('Deft Explorer')
  await expect(natural).toHaveAccessibleName('Natural Explorer')
  await expect(canny.getByRole('button', { name: 'View Deft Explorer' })).toHaveCount(0)
  await expect(canny.getByRole('group', { name: 'Canny expertise' })).toBeVisible()
  await expect(canny.getByRole('group', { name: 'Canny languages' })).toBeVisible()
  await canny
    .getByRole('group', { name: 'Canny expertise' })
    .getByRole('button', { name: 'Choose', exact: true })
    .click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Choose up to 1 proficient option.', { exact: true })).toBeVisible()
  await expect(modal.getByText(/You can leave this pending|Ranger \(PHB\) · Level/)).toHaveCount(0)
  await modal.getByRole('textbox').fill('Survival')
  await modal.getByText('Survival', { exact: true }).click()
  await expect(modal.getByText('Survival', { exact: true })).toHaveCount(2)
  await expect(modal.getByText('proficiency:expertise:survival', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: '.tmp/optional38/class-compact-expertise-modal-v1.png' })
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  // Three Canny picks plus the existing unsupported Favored Enemy setup duty.
  await expect(level.getByText('4 pending choices', { exact: true })).toBeVisible()
  await deft.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(natural).toBeFocused()
  await expect(deft).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(natural).toHaveAttribute('aria-selected', 'true')
  await expect(canny).toHaveCount(0)
  await deft.click()
  await foe.click()
  await expect(level.getByText('3 pending choices', { exact: true })).toBeVisible()
  await natural.click()
  await expect(foe).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const stored = (await readPersistedCharacters(page)).find(
        (row) => (row as { id: string }).id === character.id,
      ) as { optionalClassFeatureAdoptions?: Array<{ target: string }> }
      return stored?.optionalClassFeatureAdoptions?.map((row) => row.target)
    })
    .toEqual(['class-feature|favored foe|ranger|phb|1|tce'])
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  await page.getByRole('button', { name: /^Level 1,/ }).click()
  await expect(natural).toHaveAttribute('aria-selected', 'true')
  await expect(foe).toHaveAttribute('aria-selected', 'true')
  {
    const switcher = page.getByRole('combobox', { name: 'Switch class' })
    await switcher.click()
    await page.getByRole('option', { name: 'Fighter · Level 1' }).click()
    await expect(
      header.getByRole('heading', { name: 'Fighter Level 1', exact: true }),
    ).toBeVisible()
    await switcher.click()
    await page.getByRole('option', { name: 'Ranger · Level 6' }).click()
    await expect(header.getByRole('heading', { name: 'Ranger Level 6', exact: true })).toBeVisible()
  }
  await deft.click()
  await page.getByRole('button', { name: /^Level 2,/ }).click()
  const focus = page.getByRole('checkbox', { name: 'Spellcasting Focus', exact: true })
  const focusCard = focus.locator('..').locator('..')
  const focusDetails = page.getByRole('button', { name: 'Spellcasting Focus', exact: true })
  await expect(focusDetails).toHaveCount(1)
  await expect(focus).not.toBeChecked()
  await focusDetails.click()
  await expect(page.getByRole('heading', { name: 'Spellcasting Focus', exact: true })).toBeVisible()
  await expect(focus).not.toBeChecked()
  await focusDetails.press('Enter')
  await expect(focus).not.toBeChecked()
  await focus.check()
  await expect(focus).toBeChecked()
  await expect(focusCard).toHaveClass(/border-accent bg-accent\/10/)
  await expect(
    focusCard.getByRole('button', { name: 'Spellcasting Focus', exact: true }),
  ).toHaveCount(1)
  await expect(focusDetails).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'View Spellcasting Focus' })).toHaveCount(0)
  await focusDetails.click()
  await focusDetails.press('Space')
  await expect(focus).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Spellcasting Focus', exact: true })).toBeVisible()
  await focus.uncheck()
  await expect(focus).not.toBeChecked()
  await expect(focusDetails).toHaveCount(1)
  await focus.press('Space')
  await expect(focus).toBeChecked()
  const viewport = header.locator('..').locator('[data-slot="scroll-area-viewport"]').first()
  const originalTop = await header.evaluate((element) => element.getBoundingClientRect().top)
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(header).toBeVisible()
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBe(originalTop)
  await focusCard.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '.tmp/optional38/optional-card-details-selected-v1.png',
    fullPage: true,
  })
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: '.tmp/optional38/optional-card-details-desktop-v1.png',
    fullPage: true,
  })
  await page.screenshot({ path: '.tmp/optional38/class-presentation-desktop.png', fullPage: true })
})
