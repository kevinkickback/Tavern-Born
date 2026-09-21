import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION } from '../helpers/electronEnvironment'

const HAS_DEVELOPMENT_SRD = existsSync(resolve('resources/srd/core/manifest.json'))

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
test.skip(
  HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION,
  'Windows build has upstream Electron sandbox crash 0x80000003',
)

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
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${testInfo.outputPath('bundled-srd-user-data')}`],
    env: environment,
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
      await page.getByRole('banner').getByRole('button', { name: 'Save character' }).click()

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
      await expect(page.getByRole('heading', { name: 'Fireball' })).toBeVisible()
    })

    await test.step('generate the revised character sheet preview', async () => {
      await page.getByRole('button', { name: 'Characters' }).click()
      await openCharacter(page, 'SRD Revised')
      await page.getByRole('button', { name: 'Character Sheet' }).click()
      await page.getByRole('link', { name: '5.5e (2024)' }).click()
      await page.getByRole('button', { name: 'Generate Preview' }).click()
      await expect(page.getByText('Preview ready')).toBeVisible({ timeout: 60_000 })
    })
  } finally {
    if (electronApp.process().exitCode === null) {
      await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    }
  }
})
