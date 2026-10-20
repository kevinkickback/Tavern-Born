import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { Creature5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeOptionalDeclarationCatalog } from '../fixtures/optionalClassDeclarationFixtures'
import { ensureStartupPromptResolved, seedAppState } from './helpers/startup'

test('2014 MPMB export fills the active creature companion page', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  test.skip(
    !fs.existsSync(path.resolve('data/bestiary/bestiary-tce.json')),
    'Requires the external 5etools corpus',
  )
  let character = characterPersistenceSchema.parse(
    JSON.parse(
      fs.readFileSync(path.resolve('tests/fixtures/companion-choice-character-2014.tbc'), 'utf8'),
    ),
  )
  const bestiary = JSON.parse(
    fs.readFileSync(path.resolve('data/bestiary/bestiary-tce.json'), 'utf8'),
  ) as { monster: Creature5e[] }
  const beast = bestiary.monster.find(
    (creature) => creature.name === 'Beast of the Land' && creature.source === 'TCE',
  )
  expect(beast).toBeDefined()
  const { data: gameData, catalogs } = makeOptionalDeclarationCatalog('class/class-ranger.json', [
    'subclass',
    'ranger',
    'phb',
    'beast master',
    'phb',
  ])
  gameData.creatures = beast ? [beast] : []
  gameData.lookups = buildGameDataLookups(gameData)
  const currentCatalogs = { ...createClassChoiceCatalogs(catalogs), creatures: gameData.creatures }
  // The shared fixture deliberately has no adoption. Establish this test's active companion
  // through the same source-qualified commands as Class, then strictly reopen the saved result.
  const adoption = setOptionalClassAdoptionCommand(
    character,
    character.provenance,
    currentCatalogs,
    {
      owner: ['subclass', 'ranger', 'phb', 'beast master', 'phb'],
      target: 'subclass-feature|primal companion|ranger|phb|beast master|phb|3|tce',
      earnedLevel: 3,
    },
    true,
    [],
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...adoption.characterPatch,
    provenance: adoption.provenanceUpdate,
  })
  const ranger = gameData.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
  const subclass = ranger.subclasses!.find(
    (row) => row.name === 'Beast Master' && row.source === 'PHB',
  )!
  const choice = getCharacterClassChoices(
    ranger,
    subclass,
    createOptionalClassFeatureActivity(character, currentCatalogs),
    currentCatalogs,
  ).find((row) => row.label === 'Primal Companion')!
  const option = resolveClassChoiceOptions(choice, currentCatalogs, [], 3, character).find(
    (row) =>
      row.reference.name === 'Beast of the Land' &&
      row.reference.source === 'TCE' &&
      row.availability === 'eligible',
  )!
  const selection = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    [option.reference],
    { classes: gameData.classes, catalogs: currentCatalogs },
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...selection.characterPatch,
    provenance: selection.provenanceUpdate,
  })

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-pdf-companion',
    characters: [character],
    // Playwright's argument transport does not preserve Maps. Rebuild runtime indexes in-app.
    gameData: { ...gameData, lookups: undefined },
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
  await expect(page.getByText('MorePurpleMoreBetter (2014)', { exact: true })).toBeVisible()
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
  await expect(page.getByText('Wizards of the Coast (2014)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Optional Pages', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Companion pages' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('menuitemcheckbox', { name: 'Notes page' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Generate Preview' }).click()
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled({ timeout: 30_000 })
  const officialDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Download PDF' }).click()
  const officialDownload = await officialDownloadPromise
  const officialPath = testInfo.outputPath('2014-official-companion-notes.pdf')
  await officialDownload.saveAs(officialPath)
  const officialDoc = await PDFDocument.load(fs.readFileSync(officialPath))
  // Core (2), companion, independent Ranger and High Elf spell pages, and notes.
  expect(officialDoc.getPageCount()).toBe(6)
  const officialForm = officialDoc.getForm()
  expect(officialForm.getTextField('Spellcasting Class 2').getText()).toBe('Ranger')
  expect(officialForm.getTextField('SpellcastingAbility 2').getText()).toBe('Wisdom')
  expect(officialForm.getTextField('SpellSaveDC  2').getText()).toBe('12')
  expect(officialForm.getTextField('SpellAtkBonus 2').getText()).toBe('+4')
  expect(officialForm.getTextField('SpellPage2__Spellcasting Class 2').getText()).toBe('Elf (High)')
  expect(officialForm.getTextField('SpellPage2__SpellcastingAbility 2').getText()).toBe(
    'Intelligence',
  )
  expect(officialForm.getTextField('SpellPage2__SpellSaveDC  2').getText()).toBe('10')
  expect(officialForm.getTextField('SpellPage2__SpellAtkBonus 2').getText()).toBe('+2')
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
