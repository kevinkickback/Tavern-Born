import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, type Locator, type Page, test } from '@playwright/test'

const HAS_DEVELOPMENT_SRD = existsSync(resolve('resources/srd/manifest.json'))

interface CharacterOptions {
  name: string
  ruleset: RegExp
  race: RegExp
  className: RegExp
  background: RegExp
  reviewRaceChoices?: boolean
}

async function expectDialogClearance(dialog: Locator) {
  await expect(dialog).toBeVisible()
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const { top, bottom } = element.getBoundingClientRect()
        const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
        const controls = (
          navigator as Navigator & {
            windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect: () => DOMRect }
          }
        ).windowControlsOverlay
        const titleBarBottom = Math.max(
          rootFontSize * 2,
          controls?.visible ? controls.getTitlebarAreaRect().bottom : 0,
        )
        return {
          hasTitleBarGap: top >= titleBarBottom + 7.5,
          hasBottomGap: window.innerHeight - bottom >= rootFontSize - 0.5,
        }
      }),
    )
    .toEqual({ hasTitleBarGap: true, hasBottomGap: true })
}

async function pickStartingItem(page: Page, trigger: ReturnType<Page['getByRole']>, name: string) {
  await trigger.click()
  const items = page.getByRole('dialog', { name: 'Starting items', exact: true })
  await expectDialogClearance(items)
  await items.getByRole('textbox', { name: /Search/ }).fill(name)
  await items
    .locator('button[aria-pressed]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click({ position: { x: 8, y: 8 } })
  await items.getByRole('button', { name: 'Confirm', exact: true }).click()
}

async function createCharacter(page: Page, options: CharacterOptions) {
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await expectDialogClearance(dialog)
  await dialog.getByLabel('Character Name').fill(options.name)
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.ruleset }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByRole('heading', { name: 'Choose sourcebooks' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.race }).click()
  if (options.reviewRaceChoices) {
    await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Racial size' }).click()
    await page.getByRole('option', { name: 'Medium', exact: true }).click()
    await dialog.getByRole('combobox', { name: /^Skills · Human/ }).click()
    await page.getByRole('option', { name: 'History', exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.className }).click()
  await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
  const classSkills = dialog.getByRole('combobox', { name: /^Skills · Fighter/ })
  for (const skill of ['Perception', 'Survival']) {
    await classSkills.click()
    await page.getByRole('option', { name: skill, exact: true }).click()
  }
  const style = dialog.getByRole('button', { name: /^Choose Fighting Style/ })
  if (await style.isVisible()) {
    await style.click()
    const styles = page
      .getByRole('dialog')
      .filter({ has: page.getByText('Defense', { exact: true }) })
      .last()
    await styles
      .getByRole('button')
      .filter({ has: page.getByText('Defense', { exact: true }) })
      .click()
    await styles.getByRole('button', { name: 'Confirm', exact: true }).click()
  }
  if (options.reviewRaceChoices) {
    await dialog.getByRole('button', { name: 'Choose Weapon Mastery' }).click()
    const mastery = page.getByRole('dialog', { name: 'Choose weapons for Weapon Mastery' })
    for (const weapon of ['Greatsword', 'Longsword', 'Longbow']) {
      await mastery.getByRole('textbox', { name: /Search/ }).fill(weapon)
      await mastery
        .getByRole('button')
        .filter({ has: page.getByText(weapon, { exact: true }) })
        .click()
    }
    await mastery.getByRole('button', { name: 'Confirm', exact: true }).click()
  }
  await expect(dialog.getByRole('button', { name: /^Use package / })).toHaveCount(0)
  if (!options.reviewRaceChoices) {
    const weaponChoice = dialog.getByRole('button', {
      name: 'Class starting equipment choice 2 specific items',
    })
    if (await weaponChoice.isVisible()) {
      const packageGroup = dialog.getByRole('group', {
        name: 'Class starting equipment choice 2 configuration',
      })
      await expect(packageGroup.getByText('Complete', { exact: true })).toHaveCount(0)
      await pickStartingItem(page, weaponChoice, 'Longsword')
      await expect(packageGroup.getByText('Complete', { exact: true }).first()).toBeVisible()
    }
  }
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: options.background }).click()
  await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
  for (const language of ['Dwarvish', 'Elvish']) {
    await dialog.getByRole('combobox', { name: /^Languages ·/ }).click()
    await page.getByRole('option', { name: language, exact: true }).click()
  }
  if (options.reviewRaceChoices) {
    await dialog.getByRole('combobox', { name: 'Background ability bonus +2' }).click()
    await page.getByRole('option', { name: 'STR', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Background ability bonus +1' }).click()
    await page.getByRole('option', { name: 'CON', exact: true }).click()
    const tool = dialog.getByRole('combobox', { name: /^Tools · Soldier/ })
    await tool.click()
    await page.getByRole('option', { name: 'Dice Set', exact: true }).click()
    await dialog.getByRole('tab', { name: 'Package B', exact: true }).click()
  } else {
    const symbol = dialog.getByRole('button', {
      name: 'Background starting equipment choice 1 specific items',
    })
    if (await symbol.isVisible()) await pickStartingItem(page, symbol, 'Amulet')
    await dialog.getByRole('tab', { name: 'Package B', exact: true }).click()
  }
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

    await test.step('keep dialogs clear of the title bar in a compact window', async () => {
      const mainWindow = await electronApp.browserWindow(page)
      await mainWindow.evaluate((window) => {
        if (window.isMaximized()) window.unmaximize()
        window.setContentSize(1280, 720)
      })
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(720)

      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('link', { name: 'Appearance' }).click()
      await page.getByRole('slider').press('End')
      await expect(page.getByText(/^120% — /)).toBeVisible()
      await page.getByRole('button', { name: 'Characters', exact: true }).click()
      await page.getByRole('button', { name: 'New Character' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Create New Character' })
      await expectDialogClearance(dialog)
      await dialog.getByLabel('Character Name').fill('Windowed draft')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      const confirmation = page.getByRole('alertdialog', { name: 'Discard character creation?' })
      await expectDialogClearance(confirmation)
      await confirmation.getByRole('button', { name: 'Discard changes' }).click()
      await expect(dialog).toBeHidden()

      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('link', { name: 'Appearance' }).click()
      const scale = page.getByRole('slider')
      await scale.press('ArrowLeft')
      await scale.press('ArrowLeft')
      await expect(page.getByText(/^100% — /)).toBeVisible()
      await page.getByRole('button', { name: 'Characters', exact: true }).click()
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
        reviewRaceChoices: true,
        className: /Fighter\s+XPHB/,
        background: /Soldier\s+XPHB/,
      })
    })

    await test.step('edit, save, and reload the revised character', async () => {
      await openCharacter(page, 'SRD Revised')
      const adjustments = page.getByRole('complementary', { name: 'Manual Adjustments' })
      await adjustments.getByRole('tab', { name: 'Stats' }).click()
      for (const name of ['Manage Hit Points', 'Manage Armor Class', 'Manage Movement']) {
        const launcher = adjustments.getByRole('button', { name })
        await launcher.click()
        const dialog = page.getByRole('dialog', { name, exact: true })
        await expectDialogClearance(dialog)
        if (name === 'Manage Movement') {
          const mode = dialog.getByRole('combobox', { name: 'Mode' })
          const labelNames = ['What caused it?', 'Mode', 'Feet']
          const labels = await Promise.all(
            labelNames.map((label) => dialog.getByText(label, { exact: true }).boundingBox()),
          )
          const fields = await Promise.all([
            dialog.getByRole('textbox', { name: 'What caused it?' }).boundingBox(),
            mode.boundingBox(),
            dialog.getByRole('spinbutton', { name: 'Feet' }).boundingBox(),
          ])
          expect(labels.map((box) => box?.y)).toEqual(Array(3).fill(labels[0]?.y))
          expect(labels.every(Boolean)).toBe(true)
          expect(fields.map((box) => box?.y)).toEqual(Array(3).fill(fields[0]?.y))
          expect(fields.map((box) => box?.height)).toEqual(Array(3).fill(fields[0]?.height))
          expect(fields.every((box) => box && box.height > 0)).toBe(true)
          await mode.click()
          await page.getByRole('option', { name: 'Swim' }).click()
          await expect(mode).toHaveText('Swim')
        }
        await page.keyboard.press('Escape')
        await expect(launcher).toBeFocused()
      }
      await page.getByRole('banner').getByRole('button', { name: 'Level up character' }).click()
      const wizard = page.getByRole('dialog', { name: 'Level Up', exact: true })
      await expectDialogClearance(wizard)
      await wizard.getByRole('button', { name: 'Next' }).click()
      await wizard.getByRole('button', { name: 'Review level' }).click()
      await expect(wizard.getByText('Character level', { exact: true })).toBeVisible()
      await wizard.getByRole('button', { name: 'Apply level' }).click()
      await expect(wizard).toBeHidden()

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
      await expect(
        page.getByRole('region', { name: 'Character overview' }).getByText(/\bLevel 2\b/),
      ).toBeVisible()

      await page.getByRole('banner').getByRole('button', { name: 'Save character' }).click()
      await expect(page.getByTestId('character-save-status')).toHaveText('Character saved')

      await page.reload()
      await page.getByRole('button', { name: 'Characters' }).click()
      await openCharacter(page, 'SRD Revised')
      await expect(
        page.getByRole('region', { name: 'Character overview' }).getByText(/\bLevel 2\b/),
      ).toBeVisible()
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
