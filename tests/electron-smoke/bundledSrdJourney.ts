import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const HAS_DEVELOPMENT_SRD = existsSync(resolve('resources/srd/manifest.json'))

interface CharacterOptions {
  name: string
  ruleset: RegExp
  race: RegExp
  className: RegExp
  background: RegExp
}

async function createCharacter(page: Page, options: CharacterOptions) {
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill(options.name)
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.ruleset }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByRole('heading', { name: 'Choose sourcebooks' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.race }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.className }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.background }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText(options.name)).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
}

async function openCharacter(page: Page, name: string) {
  const cardTitle = page.locator('h3').filter({ hasText: name }).first()
  await expect(cardTitle).toBeVisible()
  await cardTitle.click()
  await expect(page.getByRole('banner').getByText(name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Builder' }).click()
}

test.skip(!HAS_DEVELOPMENT_SRD, 'requires an approved or generated SRD snapshot')

test('creates and reloads both rules generations using only the Included SRD', async ({
  browserName: _browserName,
}, testInfo) => {
  test.setTimeout(180_000)
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
    ),
  )
  const userDataArgument = `--user-data-dir=${testInfo.outputPath('bundled-srd-user-data')}`
  const launchArgs = ['.', userDataArgument]
  const electronApp = await electron.launch({
    args: launchArgs,
    env: environment,
    chromiumSandbox: process.platform === 'win32',
  })

  try {
    const page = await electronApp.firstWindow()
    page.setDefaultTimeout(20_000)
    await test.step('load the Included SRD and dismiss the first-run introduction', async () => {
      const welcomeHeading = page.getByRole('heading', { name: 'Welcome to Tavern Born' })
      await expect(welcomeHeading).toBeVisible({
        timeout: 60_000,
      })
      await page.getByRole('button', { name: 'Get Started' }).dispatchEvent('click')
      await expect(welcomeHeading).toBeHidden()
    })

    await test.step('create representative 2014 and 2024 characters', async () => {
      await createCharacter(page, {
        name: 'SRD Legacy',
        ruleset: /5e Legacy/,
        race: /Half-Orc\s+PHB/,
        className: /Fighter\s+PHB/,
        background: /Acolyte\s+PHB/,
      })
      await createCharacter(page, {
        name: 'SRD Revised',
        ruleset: /5\.5e Revised/,
        race: /Human\s+XPHB/,
        className: /Fighter\s+XPHB/,
        background: /Soldier\s+XPHB/,
      })
    })

    await test.step('edit, save, and reload the revised character', async () => {
      await openCharacter(page, 'SRD Revised')
      await page.getByRole('banner').getByRole('button', { name: 'Level Up' }).click()
      const levelDialog = page.getByRole('dialog', { name: 'Level Up Character' })
      await levelDialog.getByRole('button', { name: 'Level Up' }).first().click()
      await expect(levelDialog.getByText('2', { exact: true })).toBeVisible()
      await levelDialog.getByRole('button', { name: 'Close' }).first().click()

      const mainWindow = await electronApp.browserWindow(page)
      await mainWindow.evaluate((window) => window.hide())
      await expect.poll(() => mainWindow.evaluate((window) => window.isVisible())).toBe(false)
      const executable = await electronApp.evaluate(() => process.execPath)
      // Mirror Playwright's Linux launch policy for the second process.
      const sandboxArgs = electronApp.process().spawnargs.filter((arg) => arg === '--no-sandbox')
      await promisify(execFile)(executable, [...sandboxArgs, ...launchArgs], {
        env: environment,
        timeout: 10_000,
        windowsHide: true,
      })
      await expect.poll(() => mainWindow.evaluate((window) => window.isVisible())).toBe(true)
      expect(electronApp.windows()).toEqual([page])
      await expect(page.getByRole('banner').getByText('Level 2')).toBeVisible()

      await page.getByRole('banner').getByRole('button', { name: 'Save character' }).click()
      await expect(page.getByTestId('character-save-status')).toHaveText('Character saved')

      await page.reload()
      await page.getByRole('button', { name: 'Characters' }).click()
      await openCharacter(page, 'SRD Revised')
      await expect(page.getByRole('banner').getByText('Level 2')).toBeVisible()
      await page.getByRole('button', { name: 'Characters' }).click()
      await expect(page.locator('h3').filter({ hasText: 'SRD Legacy' })).toBeVisible()
    })

    await test.step('open a real SRD compendium entry', async () => {
      await page.getByRole('button', { name: 'Compendium' }).click()
      await page.getByLabel('Search compendium').fill('Fireball')
      await page.getByRole('button').filter({ hasText: 'Fireball' }).first().click()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Fireball', exact: true }),
      ).toBeVisible()
    })

    await test.step('generate the revised character sheet preview', async () => {
      await page.getByRole('button', { name: 'Characters' }).click()
      await openCharacter(page, 'SRD Revised')
      await page.getByRole('button', { name: 'Character Sheet' }).click()
      await page.getByRole('link', { name: '5.5e (2024) Wizards of the Coast' }).click()
      await page.getByRole('button', { name: 'Generate Preview' }).click()
      await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({
        timeout: 60_000,
      })
      await expect(page.locator('canvas').first()).toBeVisible()
    })
  } finally {
    if (electronApp.process().exitCode === null) await electronApp.close()
  }
})
