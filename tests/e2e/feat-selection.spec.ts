import { expect, test } from '@playwright/test'
import type { Feat5e, GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

const watchfulFeat: Feat5e = {
  name: 'Watchful Fixture',
  source: 'PHB',
  entries: [
    'Always on the lookout for danger, you gain the following benefits:',
    {
      type: 'list',
      items: [
        'You have advantage while resisting the {@condition Prone|PHB} condition.',
        'You add your proficiency bonus to initiative rolls.',
      ],
    },
  ],
}

const fillerFeats: Feat5e[] = Array.from({ length: 30 }, (_, index) => ({
  name: `Fixture Feat ${String(index + 1).padStart(2, '0')}`,
  source: 'PHB',
  entries: [`Fixture feat description ${index + 1}.`],
}))

const FEAT_GAME_DATA: GameData = {
  ...MINIMAL_GAME_DATA,
  feats: [watchfulFeat, ...fillerFeats],
  conditions: [
    {
      name: 'Prone',
      source: 'PHB',
      entries: [
        `A prone creature has limited movement. ${'It must account for nearby threats and restricted movement. '.repeat(14)}`,
        `Standing requires additional effort. ${'The condition continues to affect movement and nearby attacks. '.repeat(14)}`,
      ],
    },
  ],
}

test('feat selection shows benefits and keeps portaled previews interactive over the modal', async ({
  page,
}) => {
  const character = makeCharacterFixture({ id: 'feat-selection-character', name: 'Feat Tester' })

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-feat-selection-seed',
    gameData: FEAT_GAME_DATA,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.goto('/#/feats')

  await page.getByRole('button', { name: 'Add Bonus Feat' }).click()
  const dialog = page.getByRole('dialog', { name: 'Select Feats' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('Always on the lookout for danger, you gain the following benefits:'),
  ).toBeVisible()
  await expect(dialog.getByText(/You add your proficiency bonus to initiative rolls/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Prone', exact: true }).hover()
  const preview = page.getByRole('dialog', { name: 'Prone preview' })
  await expect(preview).toBeVisible()
  await preview.hover()
  await page.waitForTimeout(300)
  await expect(preview).toBeVisible()

  const selectionList = dialog.locator('[data-selection-scroll-container]')
  const previewScrollArea = preview.locator('[data-rules-preview-scroll]')
  await expect
    .poll(() =>
      previewScrollArea.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true)
  const selectionScrollBefore = await selectionList.evaluate((element) => element.scrollTop)

  await previewScrollArea.hover()
  await page.mouse.wheel(0, 240)

  await expect
    .poll(() => previewScrollArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  await expect
    .poll(() => selectionList.evaluate((element) => element.scrollTop))
    .toBe(selectionScrollBefore)

  await preview.getByTitle('Pin tooltip').click()
  await expect(preview.getByTitle('Unpin tooltip')).toBeVisible()
  await expect(dialog).toBeVisible()
  await selectionList.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })

  await expect(dialog.getByRole('button', { name: 'Prone', exact: true })).not.toBeInViewport()
  await expect(preview).toBeVisible()
  await expect(preview.getByTitle('Unpin tooltip')).toBeVisible()
})
