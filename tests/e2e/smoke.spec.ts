import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved } from './helpers/startup'

test('home page renders expected shell', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page)

  await expect(page).toHaveTitle('Tavern Born - D&D Character Creator')
  await expect(page.getByRole('heading', { name: 'Characters', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Characters' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
})

test('opens the library while the web font stylesheet is pending', async ({ page }) => {
  const fontStylesheet = /^https:\/\/fonts\.googleapis\.com\/css2\?/
  let holdFontResponse = false
  let finishFontResponse = () => {}
  const fontResponse = new Promise<void>((resolve) => {
    finishFontResponse = resolve
  })
  await page.route(fontStylesheet, async (route) => {
    if (holdFontResponse) await fontResponse
    await route.fulfill({ contentType: 'text/css', body: '' })
  })

  try {
    await page.goto('/')
    await ensureStartupPromptResolved(page)
    const library = page.getByRole('heading', { name: 'Characters', exact: true })
    await expect(library).toBeVisible()

    holdFontResponse = true
    const fontRequest = page.waitForRequest(fontStylesheet)
    await page.reload({ waitUntil: 'commit' })
    await fontRequest
    await expect(library).toBeVisible({ timeout: 10_000 })
  } finally {
    finishFontResponse()
    await page.unrouteAll({ behavior: 'wait' })
  }
})
