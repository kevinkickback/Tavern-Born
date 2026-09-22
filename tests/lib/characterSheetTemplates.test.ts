import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  CHARACTER_SHEET_TEMPLATES,
  createCharacterSheetViewModel,
  generateFilledCharacterSheetPdf,
} from '@/lib/pdf/characterSheetPdf'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('character sheet template registry', () => {
  test('ships exactly the four registered PDF assets', () => {
    expect(CHARACTER_SHEET_TEMPLATES.map((template) => template.id)).toEqual([
      '2014-official',
      '2014-custom',
      '2024-official',
      '2024-custom',
    ])
    expect(CHARACTER_SHEET_TEMPLATES.map((template) => template.fileName)).toEqual([
      '2014_Official_Character_Sheet.pdf',
      '2014_MPMB_Character_Sheet.pdf',
      '2024_Official_Character_Sheet.pdf',
      '2024_Beaoudix_Character_Sheet.pdf',
    ])
    expect(readdirSync(join(process.cwd(), 'public', 'pdf')).sort()).toEqual(
      CHARACTER_SHEET_TEMPLATES.map((template) => template.fileName).sort(),
    )
  })

  test.each([
    ['2014-official', 'CharacterName'],
    ['2024-official', 'Text_1'],
  ] as const)('fills and reopens the %s form', async (templateId, nameField) => {
    const character = makeCharacterFixture({ name: 'Official Form Test' })
    const viewModel = createCharacterSheetViewModel(character, {})
    const template = CHARACTER_SHEET_TEMPLATES.find((candidate) => candidate.id === templateId)
    if (!template) throw new Error(`Missing test template: ${templateId}`)
    const sourceBytes = new Uint8Array(
      readFileSync(join(process.cwd(), 'public', template.assetPath)),
    )

    const outputBytes = await generateFilledCharacterSheetPdf(viewModel, sourceBytes, templateId)
    const output = await PDFDocument.load(outputBytes)

    expect(output.getForm().getTextField(nameField).getText()).toBe('Official Form Test')
  })
})
