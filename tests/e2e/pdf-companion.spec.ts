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
  await page.getByRole('link', { name: '5e (2014) MPMB Custom' }).click()
  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByText('Preview ready')).toBeVisible({ timeout: 30_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  await page.getByRole('button', { name: /Download (PDF|with Warnings)/ }).click()
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
})
