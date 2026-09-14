import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from '@playwright/test'
import { asFieldWithInternals } from '@/lib/pdf/pdfFieldInternals'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('2014 PDF replaces the organization placeholder with the selected emblem', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  const fixture = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/pdf-kitchen-sink.tbc'), 'utf8'),
  ) as Record<string, unknown>
  const character = {
    ...fixture,
    details: {
      ...(fixture.details as Record<string, unknown>),
      organizationSelectionKey: 'Harpers|SCAG',
      organizationCustomImage: '',
    },
  }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-pdf-organization',
    characters: [character],
    gameData: {
      ...MINIMAL_GAME_DATA,
      organizations: [
        {
          name: 'Harpers',
          source: 'SCAG',
          description: 'A covert network.',
          imagePath: '/assets/images/factions/harpers-5e.webp',
        },
      ],
    },
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-pdf-organization')
  await selectCharacterFromHome(page, String(fixture.name))
  await page.getByRole('button', { name: 'Character Sheet' }).click()
  await page.getByRole('link', { name: '5e (2014)' }).click()

  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByText('Preview ready')).toBeVisible({ timeout: 30_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  const outputPath = testInfo.outputPath('2014-organization-icon.pdf')
  await download.saveAs(outputPath)

  const output = await PDFDocument.load(fs.readFileSync(outputPath))
  const symbol = asFieldWithInternals(output.getForm().getButton('Symbol'))
  expect(symbol?.acroField.getWidgets()[0]?.getRectangle().width).toBe(0)
  await testInfo.attach('2014 organization icon PDF', {
    path: outputPath,
    contentType: 'application/pdf',
  })
})
