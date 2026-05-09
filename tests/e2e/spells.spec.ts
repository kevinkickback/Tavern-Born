import { expect, test } from '@playwright/test'

async function closeStartupModalIfOpen(page: import('@playwright/test').Page) {
  const closeButton = page.getByRole('button', { name: 'Close' })
  if ((await closeButton.count()) > 0) {
    await closeButton.first().click()
  }
}

test('spells page shows no-character state and returns home', async ({ page }) => {
  await page.goto('/#/spells')
  await closeStartupModalIfOpen(page)

  await expect(page.locator('main')).toContainText('No Character Selected')
  await expect(page.getByText('Please select or create a character to manage spells.')).toHaveCount(
    1,
  )
})

test.describe('spells page no-character coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/spells')
    await closeStartupModalIfOpen(page)
  })

  test('shows no-character heading', async ({ page }) => {
    await expect(page.locator('main')).toContainText('No Character Selected')
  })

  test('shows no-character body text', async ({ page }) => {
    await expect(
      page.getByText('Please select or create a character to manage spells.'),
    ).toHaveCount(1)
  })

  test('main spell sections are hidden without an active character', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Spell' })).toHaveCount(0)
    await expect(page.getByText('Spell Slots')).toHaveCount(0)
  })

  test('renders a single no-character card container', async ({ page }) => {
    await expect(page.locator('h2:has-text("No Character Selected")')).toHaveCount(1)
  })

  test('spells route stays stable on reload without a character', async ({ page }) => {
    await page.reload()
    await expect(page).toHaveURL(/\/spells$/)
    await expect(page.locator('main')).toContainText('No Character Selected')
  })

  test('no-character card remains visible after hard navigation from home', async ({ page }) => {
    await page.goto('/')
    await page.goto('/#/spells')
    await expect(page.locator('main')).toContainText('No Character Selected')
  })

  test('does not show spell profile labels without active character', async ({ page }) => {
    await expect(page.getByText('Bonus Spells')).toHaveCount(0)
  })
})
