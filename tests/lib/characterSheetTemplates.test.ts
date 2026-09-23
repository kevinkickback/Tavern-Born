import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  CHARACTER_SHEET_TEMPLATES,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

describe('character sheet template registry', () => {
  test('ships the four registered templates and the companion supplement', () => {
    expect(CHARACTER_SHEET_TEMPLATES.map((template) => template.id)).toEqual([
      '2014-official',
      '2014-custom',
      '2024-official',
      '2024-custom',
    ])
    expect(readdirSync(join(process.cwd(), 'public', 'pdf')).sort()).toEqual([
      '2014',
      '2024_Beaoudix_Character_Sheet.pdf',
      '2024_Official_Character_Sheet.pdf',
    ])
    expect(readdirSync('public/pdf/2014').sort()).toEqual([
      'mpmb-companion.pdf',
      'mpmb-main.pdf',
      'mpmb-notes.pdf',
      'wotc-companion.pdf',
      'wotc-main.pdf',
      'wotc-spells.pdf',
    ])
  })

  test.each([
    ['2014-official', 'CharacterName'],
    ['2024-official', 'Text_1'],
  ] as const)('fills and reopens the %s form', async (templateId, nameField) => {
    const character = makeCharacterFixture({ name: 'Official Form Test' })
    const viewModel = createCharacterSheetViewModel(character, {})
    const template = CHARACTER_SHEET_TEMPLATES.find((candidate) => candidate.id === templateId)
    if (!template) throw new Error(`Missing test template: ${templateId}`)
    const outputBytes = await generateTestCharacterSheet(viewModel, templateId)
    const output = await PDFDocument.load(outputBytes)

    expect(output.getForm().getTextField(nameField).getText()).toBe('Official Form Test')
  })
})
