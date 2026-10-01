import { expect, test } from '@playwright/test'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
  'base64',
)

test('uploaded portraits survive reload, can be reused, and remain assigned after gallery deletion', async ({
  page,
}) => {
  const first = makeCharacterFixture({ id: 'portrait-first', name: 'First Portrait' })
  const second = makeCharacterFixture({ id: 'portrait-second', name: 'Second Portrait' })

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-saved-portraits',
    gameData: MINIMAL_GAME_DATA,
    characters: [first, second],
  })
  await page.reload()
  await selectCharacterFromHome(page, first.name)
  await page.goto('/#/details/portrait')

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: image,
  })
  const savedTile = page.getByRole('button', { name: 'Use uploaded portrait 1' })
  await expect(savedTile).toBeVisible()
  const imageSrc = await page.getByRole('img', { name: 'Uploaded portrait 1' }).getAttribute('src')
  expect(imageSrc).toMatch(/^data:image\/png;base64,/)
  await page.getByRole('button', { name: 'Save character' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Characters' }).click()
  await selectCharacterFromHome(page, second.name)
  await page.goto('/#/details/portrait')
  await expect(savedTile).toBeVisible()
  await savedTile.click()
  await expect(page.getByRole('img', { name: 'Character portrait card preview' })).toHaveAttribute(
    'src',
    imageSrc!,
  )

  await page.getByRole('button', { name: 'Delete uploaded portrait 1' }).click()
  await expect(savedTile).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Character portrait card preview' })).toHaveAttribute(
    'src',
    imageSrc!,
  )
})
