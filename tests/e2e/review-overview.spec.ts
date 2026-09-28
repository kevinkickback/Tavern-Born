import { expect, test } from '@playwright/test'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

test('review opens with one expanded section and fills a fixed portrait frame', async ({
  page,
}, testInfo) => {
  const character = makeCharacterFixture({
    name: 'Overview Portrait',
    portrait: 'assets/images/characters/placeholder_char_card.jpg',
  })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-review-overview-seed',
    gameData: MINIMAL_GAME_DATA,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.goto('/#/build/review?section=overview')

  const panel = page.locator('[data-slot="tabs-content"][data-state="active"]')
  const sections = panel.locator('details')
  await expect(sections).toHaveCount(9)
  await expect(sections.first()).toHaveAttribute('open', '')
  for (let index = 1; index < 9; index += 1) {
    await expect(sections.nth(index)).not.toHaveAttribute('open', '')
  }

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
  expect(presentation.frameWidth! / presentation.frameHeight!).toBeCloseTo(1.5, 1)
  await panel.screenshot({ path: testInfo.outputPath('overview.png') })
})
