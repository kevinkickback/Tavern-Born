import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, type Page, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

interface TemplateCase {
  accessibleName: string
  expectedFileName: string
  expectedPageCount: number
  id: '2014-official' | '2014-custom' | '2024-official' | '2024-custom'
}

const TEMPLATE_CASES: Record<'2014' | '2024', readonly TemplateCase[]> = {
  '2014': [
    {
      id: '2014-official',
      accessibleName: '5e (2014) WotC Official',
      expectedFileName: 'Full-Coverage_Test_Character_2014__2014-official_character_sheet.pdf',
      expectedPageCount: 3,
    },
    {
      id: '2014-custom',
      accessibleName: '5e (2014) MPMB Custom',
      expectedFileName: 'Full-Coverage_Test_Character_2014__2014-custom_character_sheet.pdf',
      expectedPageCount: 6,
    },
  ],
  '2024': [
    {
      id: '2024-official',
      accessibleName: '5.5e (2024) WotC Official',
      expectedFileName: 'Full-Coverage_Test_Character_2024__2024-official_character_sheet.pdf',
      expectedPageCount: 2,
    },
    {
      id: '2024-custom',
      accessibleName: '5.5e (2024) Lost Loot Custom',
      expectedFileName: 'Full-Coverage_Test_Character_2024__2024-custom_character_sheet.pdf',
      expectedPageCount: 2,
    },
  ],
}

async function exportTemplate(page: Page, template: TemplateCase, outputDirectory: string) {
  await page.getByRole('button', { name: 'Character Sheet' }).click()
  await page.getByRole('link', { name: template.accessibleName }).click()
  await expect(page).toHaveURL(new RegExp(`/character-sheet/${template.id.replace('-', '/')}$`))

  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByText('Preview ready')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('canvas')).toHaveCount(template.expectedPageCount, { timeout: 45_000 })

  await page.getByRole('button', { name: 'Download PDF' }).click()
  const preflight = page.getByRole('alertdialog', { name: 'PDF export preflight' })
  await expect(preflight).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await preflight.getByRole('button', { name: /Download (PDF|with Warnings)/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(template.expectedFileName)

  const outputPath = path.join(outputDirectory, template.expectedFileName)
  await download.saveAs(outputPath)
  const output = await PDFDocument.load(fs.readFileSync(outputPath))
  expect(output.getForm().getFields().length).toBeGreaterThan(0)
}

test('@focused exports every official and custom character-sheet template', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const unsupportedWidgetWarnings: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('Unimplemented widget field type "null"')) {
      unsupportedWidgetWarnings.push(text)
    }
  })
  const characters = (['2014', '2024'] as const).map((edition) =>
    JSON.parse(
      fs.readFileSync(
        path.resolve(`tests/fixtures/full-coverage-character-${edition}.tbc`),
        'utf8',
      ),
    ),
  ) as Array<Record<string, unknown>>

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-pdf-templates',
    characters,
    gameData: MINIMAL_GAME_DATA,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-pdf-templates')

  for (const [index, edition] of (['2014', '2024'] as const).entries()) {
    if (index > 0) await page.goto('/')
    const character = characters[index]
    await selectCharacterFromHome(page, String(character.name))

    for (const template of TEMPLATE_CASES[edition]) {
      await exportTemplate(page, template, testInfo.outputDir)
    }
  }

  expect(unsupportedWidgetWarnings).toEqual([])
})
