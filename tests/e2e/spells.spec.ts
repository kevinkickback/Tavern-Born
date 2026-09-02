import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved } from './helpers/startup'

test('spells page redirects home without an active character', async ({ page }) => {
  await page.goto('/#/spells')
  await ensureStartupPromptResolved(page)

  await expect(page).toHaveURL(/\/#\/$/)
  await expect(page.locator('main')).toContainText('No Characters Yet')
})

test.describe('spells route guard without an active character', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/spells')
    await ensureStartupPromptResolved(page)
  })

  test('redirects to the character library', async ({ page }) => {
    await expect(page).toHaveURL(/\/#\/$/)
    await expect(page.locator('main')).toContainText('No Characters Yet')
  })

  test('shows character creation actions', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Character' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible()
  })

  test('main spell sections are hidden without an active character', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Spell' })).toHaveCount(0)
    await expect(page.getByText('Spell Slots')).toHaveCount(0)
  })

  test('renders the empty character library', async ({ page }) => {
    await expect(page.getByText('No Characters Yet')).toHaveCount(1)
  })

  test('home redirect stays stable on reload', async ({ page }) => {
    await page.reload()
    await expect(page).toHaveURL(/\/#\/$/)
    await expect(page.locator('main')).toContainText('No Characters Yet')
  })

  test('hard navigation to spells redirects home', async ({ page }) => {
    await page.goto('/')
    await page.goto('/#/spells')
    await expect(page).toHaveURL(/\/#\/$/)
    await expect(page.locator('main')).toContainText('No Characters Yet')
  })

  test('does not show spell profile labels without active character', async ({ page }) => {
    await expect(page.getByText('Bonus Spells')).toHaveCount(0)
  })
})
