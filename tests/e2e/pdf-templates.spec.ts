import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, type Page, test } from '@playwright/test'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import type { GameDataLookups } from '@/types/5etools'
import { makeClassFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'
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
      accessibleName: '5e (2014) Wizards of the Coast',
      expectedFileName: 'Full-Coverage Test Character (2014).pdf',
      expectedPageCount: 4,
    },
    {
      id: '2014-custom',
      accessibleName: '5e (2014) MorePurpleMoreBetter',
      expectedFileName: 'Full-Coverage Test Character (2014).pdf',
      expectedPageCount: 7,
    },
  ],
  '2024': [
    {
      id: '2024-official',
      accessibleName: '5.5e (2024) Wizards of the Coast',
      expectedFileName: 'Full-Coverage Test Character (2024).pdf',
      expectedPageCount: 2,
    },
    {
      id: '2024-custom',
      accessibleName: '5.5e (2024) Lost Loot',
      expectedFileName: 'Full-Coverage Test Character (2024).pdf',
      expectedPageCount: 2,
    },
  ],
}

async function exportTemplate(page: Page, template: TemplateCase, outputDirectory: string) {
  await page.getByRole('button', { name: 'Character Sheet' }).click()
  await page.getByRole('link', { name: template.accessibleName }).click()
  await expect(page).toHaveURL(new RegExp(`/character-sheet/${template.id.replace('-', '/')}$`))
  const creatorLabel = page
    .getByRole('link', { name: template.accessibleName })
    .locator('span.truncate')
  await expect(creatorLabel).toBeVisible()
  expect(await creatorLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  )

  const hint = page.getByRole('button', { name: 'Dismiss PDF options hint' })
  if (template.id === '2014-official') {
    await expect(hint).toBeVisible()
    await page.screenshot({
      path: path.join(outputDirectory, 'pages-hint.png'),
      animations: 'disabled',
    })
    await page.getByRole('button', { name: 'Optional Pages', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(hint).toHaveCount(0)
  } else {
    await expect(hint).toHaveCount(0)
  }

  await page.getByRole('button', { name: 'Customize PDF', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Customize PDF' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Customize PDF' })).toHaveCSS('opacity', '1')
  await expect(page.getByRole('combobox', { name: 'Long text & extra entries' })).toHaveText(
    'Shorten with ellipsis',
  )
  if (template.id === '2024-official') {
    await page.screenshot({
      path: path.join(outputDirectory, 'sheet-content.png'),
      animations: 'disabled',
    })
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: 900, height: 520 })
    const dialog = page.getByRole('dialog', { name: 'Customize PDF' })
    await dialog.getByRole('combobox', { name: 'Rules descriptions' }).click()
    await page.getByRole('option', { name: 'Names only', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Long text & extra entries' }).click()
    await page.getByRole('option', { name: 'Shorten with ellipsis', exact: true }).click()
    await dialog.getByRole('button', { name: /^Attacks/ }).click()
    await expect(dialog.getByRole('region', { name: 'Attacks' })).toBeVisible()
    await dialog.getByRole('button', { name: /^Spells/ }).click()
    await expect(dialog.getByRole('region', { name: 'Attacks' })).toHaveCount(0)
    await dialog.getByRole('button', { name: /^Spells/ }).click()
    await page.screenshot({
      path: path.join(outputDirectory, 'pdf-settings-compact.png'),
      animations: 'disabled',
    })
    const bounds = await dialog.boundingBox()
    expect(bounds?.y).toBeGreaterThanOrEqual(0)
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(520)
    await dialog.getByRole('combobox', { name: 'Rules descriptions' }).click()
    await page.getByRole('option', { name: 'Include descriptions', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Long text & extra entries' }).click()
    await page.getByRole('option', { name: 'Continue in notes', exact: true }).click()
    if (viewport) await page.setViewportSize(viewport)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({ timeout: 45_000 })
  await expect
    .poll(() => page.locator('canvas').count())
    .toBeGreaterThanOrEqual(template.expectedPageCount)
  await expect(page.getByText('Rendering preview…')).toHaveCount(0, { timeout: 45_000 })
  const generatedPageCount = await page.locator('canvas').count()
  if (template.id.startsWith('2024')) {
    for (const [index, canvas] of (await page.locator('canvas').all()).entries()) {
      const png = await canvas.evaluate(
        (element) => (element as HTMLCanvasElement).toDataURL('image/png').split(',')[1],
      )
      fs.writeFileSync(
        path.join(outputDirectory, `${template.id}-page-${index + 1}.png`),
        Buffer.from(png, 'base64'),
      )
    }
  }

  const originalViewport = page.viewportSize()
  if (template.id === '2024-official') {
    await page.setViewportSize({ width: 900, height: 420 })
  }
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const preflight = page.getByRole('alertdialog', { name: 'Before you download' })
  await expect(preflight).toBeVisible()
  if (template.id === '2024-official') {
    const issues = preflight.getByTestId('preflight-issues-scroll')
    await expect(issues).toBeVisible()
    for (const summary of await issues.locator('summary').all()) await summary.click()
    expect(await issues.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    )
    await issues.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(issues.locator('li').last()).toBeInViewport()
    await expect(preflight.getByRole('button', { name: 'Download PDF' })).toBeInViewport()
  }

  const downloadPromise = page.waitForEvent('download')
  await preflight.getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(template.expectedFileName)

  const outputPath = path.join(outputDirectory, `${template.id}-${template.expectedFileName}`)
  await download.saveAs(outputPath)
  const output = await PDFDocument.load(fs.readFileSync(outputPath))
  expect(output.getPageCount()).toBe(generatedPageCount)
  expect(output.getForm().getFields().length).toBeGreaterThan(0)
  if (template.id === '2014-official') {
    const emblem = output.getForm().getButton('Faction Symbol Image')
    expect(emblem.acroField.getWidgets()[0].getRectangle().width).toBe(0)
    expect(output.getForm().getTextField('Spellcasting Class 2').getText()).toBe('Wizard')
    expect(
      output
        .getForm()
        .getFields()
        .filter((field) => /SpellPage\d+__Spellcasting Class 2$/.test(field.getName()))
        .map((field) => output.getForm().getTextField(field.getName()).getText()),
    ).toContain('Cleric')
  }
  if (template.id === '2014-custom') {
    expect(output.getForm().getTextField('WotC__Spellcasting Class 2').getText()).toBe('Wizard')
    expect(
      output
        .getForm()
        .getFields()
        .filter((field) => /WotC__SpellPage\d+__Spellcasting Class 2$/.test(field.getName()))
        .map((field) => output.getForm().getTextField(field.getName()).getText()),
    ).toContain('Cleric')
  }
  if (originalViewport) await page.setViewportSize(originalViewport)
}

test('@focused exports every official and custom character-sheet template', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const pdfWarnings: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (/Unimplemented widget field type|Unknown command|Skipping command/.test(text)) {
      pdfWarnings.push(text)
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

  const gameData = {
    ...MINIMAL_GAME_DATA,
    classes: ['PHB', 'XPHB'].flatMap((source) => [
      makeClassFixture({ source, spellcastingAbility: 'int' }),
      makeClassFixture({ name: 'Cleric', source, spellcastingAbility: 'wis' }),
    ]),
    spells: ['PHB', 'XPHB'].flatMap((source) => [
      makeSpellFixture({ name: 'Light', source, level: 0 }),
      makeSpellFixture({ name: 'Detect Magic', source, level: 1 }),
      makeSpellFixture({ name: 'Bless', source, level: 1 }),
    ]),
    organizations: [
      {
        name: 'The Harpers',
        source: 'SCAG',
        description: 'A covert network.',
        imagePath: '/assets/images/factions/harpers-5e.webp',
      },
    ],
  }
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-pdf-templates',
    characters,
    gameData: {
      ...gameData,
      lookups: {
        classesByKey: buildClassLookup(gameData.classes),
        spellsByKey: buildSpellLookup(gameData.spells),
      } as GameDataLookups,
    },
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-pdf-templates')

  for (const [index, edition] of (['2014', '2024'] as const).entries()) {
    if (index > 0) await page.goto('/')
    const character = characters[index]
    await selectCharacterFromHome(page, String(character.name))

    for (const template of TEMPLATE_CASES[edition]) {
      await exportTemplate(page, template, testInfo.outputDir)
      if (template.id.startsWith('2024')) {
        const pagesBeforeCompanion = await page.locator('canvas').count()
        const usesNotesContinuation = template.id === '2024-official'
        const addedPages = usesNotesContinuation ? 1 : 2
        await page.getByRole('button', { name: 'Optional Pages', exact: true }).click()
        await expect(page.getByRole('menuitemcheckbox')).toHaveCount(2)
        await expect(
          page.getByRole('menuitemcheckbox', { name: 'Companion pages' }),
        ).toHaveAttribute('aria-checked', 'false')
        await expect(page.getByRole('menuitemcheckbox', { name: 'Notes page' })).toHaveAttribute(
          'aria-checked',
          String(usesNotesContinuation),
        )
        if (!usesNotesContinuation)
          await page.getByRole('menuitemcheckbox', { name: 'Notes page' }).click()
        await page.getByRole('menuitemcheckbox', { name: 'Companion pages' }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: 'Download PDF' })).toBeDisabled()
        await page.getByRole('button', { name: 'Generate Preview' }).click()
        await expect(page.locator('canvas')).toHaveCount(pagesBeforeCompanion + addedPages, {
          timeout: 45_000,
        })
        await page.getByRole('button', { name: 'Download PDF' }).click()
        const review = page.getByRole('alertdialog', { name: 'Before you download' })
        await expect(review).toBeVisible()
        expect(await review.textContent()).not.toMatch(/Text_\d+/)
        const downloadEvent = page.waitForEvent('download')
        await review.getByRole('button', { name: 'Download PDF' }).click()
        const download = await downloadEvent
        const outputPath = testInfo.outputPath(`${template.id}-optional-pages.pdf`)
        await download.saveAs(outputPath)
        const doc = await PDFDocument.load(fs.readFileSync(outputPath))
        expect(doc.getPageCount()).toBe(pagesBeforeCompanion + addedPages)
        expect(
          doc.getForm().getTextField('Companion1__companion name').acroField.getWidgets()[0].P(),
        ).toBe(doc.getPage(2).ref)
        expect(
          doc.getForm().getTextField('P5.ASnotes.Notes.Left').acroField.getWidgets()[0].P(),
        ).toBe(doc.getPage(3).ref)
      }
      if (template.id === '2014-official' || template.id === '2014-custom') {
        const official = template.id === '2014-official'
        await page.getByRole('button', { name: 'Optional Pages', exact: true }).click()
        if (!official)
          await expect(
            page.getByRole('menuitemcheckbox', { name: 'Companion page' }),
          ).toHaveAttribute('aria-checked', 'false')
        await page.screenshot({
          path: testInfo.outputPath(`${template.id}-page-menu.png`),
          animations: 'disabled',
        })
        await page
          .getByRole('menuitemcheckbox', { name: official ? 'Spellcasting pages' : 'Notes page' })
          .click()
        if (!official)
          await page.getByRole('menuitemcheckbox', { name: 'Spellcasting pages' }).click()
        else if (
          (await page
            .getByRole('menuitemcheckbox', { name: 'Notes page' })
            .getAttribute('aria-checked')) === 'true'
        )
          await page.getByRole('menuitemcheckbox', { name: 'Notes page' }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: 'Download PDF' })).toBeDisabled()
        await page.getByRole('button', { name: 'Generate Preview' }).click()
        await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({
          timeout: 45_000,
        })
        await expect(page.locator('canvas')).toHaveCount(official ? 2 : 4, { timeout: 45_000 })
        await page.getByRole('button', { name: 'Download PDF' }).click()
        const review = page.getByRole('alertdialog', { name: 'Before you download' })
        await expect(review.locator('details[open]')).toHaveCount(0)
        await review.screenshot({ path: testInfo.outputPath(`${template.id}-export-summary.png`) })
        const downloadEvent = page.waitForEvent('download')
        await review.getByRole('button', { name: 'Download PDF' }).click()
        const download = await downloadEvent
        const outputPath = testInfo.outputPath(`${template.id}-optional-pages.pdf`)
        await download.saveAs(outputPath)
        const output = await PDFDocument.load(fs.readFileSync(outputPath))
        expect(output.getPageCount()).toBe(official ? 2 : 4)
        expect(
          output
            .getForm()
            .getFields()
            .some((field) =>
              official
                ? field.getName().startsWith('Spellcasting') ||
                  field.getName().startsWith('SpellPage')
                : field.getName().startsWith('P4.AScomp.') ||
                  field.getName().startsWith('P5.ASnotes.'),
            ),
        ).toBe(false)
      }
    }
  }

  expect(pdfWarnings).toEqual([])
})
