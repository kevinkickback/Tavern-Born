import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from '@playwright/test'
import type { Creature5e, GameData, GameDataLookups } from '@/types/5etools'
import { ensureStartupPromptResolved, MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

test('2014 MPMB export fills the active creature companion page', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const character = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/companion-choice-character-2014.tbc'), 'utf8'),
  ) as Record<string, unknown>
  const bestiary = JSON.parse(
    fs.readFileSync(path.resolve('data/bestiary/bestiary-tce.json'), 'utf8'),
  ) as { monster: Creature5e[] }
  const beast = bestiary.monster.find(
    (creature) => creature.name === 'Beast of the Land' && creature.source === 'TCE',
  )
  expect(beast).toBeDefined()
  const gameData: GameData = {
    ...MINIMAL_GAME_DATA,
    creatures: beast ? [beast] : [],
    lookups: {
      creaturesByKey: beast ? { 'Beast of the Land|TCE': beast } : {},
    } as GameDataLookups,
  }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-pdf-companion',
    characters: [character],
    gameData,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-pdf-companion')
  await page
    .locator('h3')
    .filter({ hasText: String(character.name) })
    .first()
    .click()
  await page.getByRole('button', { name: 'Character Sheet' }).click()
  await page.getByRole('link', { name: '5e (2014) MorePurpleMoreBetter' }).click()
  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({ timeout: 30_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  const outputPath = testInfo.outputPath('2014-companion.pdf')
  await download.saveAs(outputPath)

  const form = (await PDFDocument.load(fs.readFileSync(outputPath))).getForm()
  expect(form.getTextField('P4.AScomp.Comp.Desc.Name').getText()).toBe('Beast of the Land')
  expect(form.getTextField('P4.AScomp.Comp.Use.AC').getText()).toBe('15')
  expect(form.getTextField('P4.AScomp.Comp.Use.HP.Max').getText()).toBe('20')
  expect(form.getDropdown('P4.AScomp.Comp.Use.Attack.1.Weapon Selection').getSelected()).toEqual([
    'Maul',
  ])

  await page.getByRole('link', { name: '5e (2014) Wizards of the Coast' }).click()
  await page.getByRole('button', { name: 'Optional Pages', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Companion pages' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('menuitemcheckbox', { name: 'Notes page' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const officialDownloadPromise = page.waitForEvent('download')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Download PDF' }).click()
  const officialDownload = await officialDownloadPromise
  const officialPath = testInfo.outputPath('2014-official-companion-notes.pdf')
  await officialDownload.saveAs(officialPath)
  const officialDoc = await PDFDocument.load(fs.readFileSync(officialPath))
  expect(officialDoc.getPageCount()).toBe(5)
  const officialForm = officialDoc.getForm()
  expect(officialForm.getFields().some((field) => field.getName().includes('Continuation'))).toBe(
    false,
  )
  expect(officialForm.getTextField('Companion1__companion name').getText()).toBe(
    'Beast of the Land',
  )
  expect(officialForm.getTextField('Companion1__AC').getText()).toBe('15')
  expect(officialForm.getTextField('Companion1__MAX HP').getText()).toBe('20')
  expect(officialForm.getTextField('Companion1__Attacks.3').getText()).toContain('Maul')
  expect(officialForm.getTextField('P5.ASnotes.Notes.Left')).toBeDefined()
})
