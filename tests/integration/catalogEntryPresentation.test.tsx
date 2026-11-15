import { readFileSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { GameContent } from '@/components/editor/GameContent'
import { getItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

test('Included magic item roll cells and footnotes agree in the preview and exported PDF', async () => {
  const items = parseItems(
    JSON.parse(readFileSync('resources/srd/data/items.json', 'utf8')),
  ) as Item5e[]
  const deck = items.find(({ name, source }) => name === 'Mysterious Deck' && source === 'DMG')
  expect(deck).toBeDefined()
  const entries = getItemRulesEntries(deck)
  render(<GameContent entry={{ type: 'entries', entries }} />)
  const table = within(screen.getByRole('table'))
  expect(table.getByRole('columnheader', { name: 'Playing Card' })).toBeTruthy()
  expect(table.getByRole('cell', { name: 'Ace of hearts' })).toBeTruthy()
  expect(
    table.getByText('Found only in a deck with twenty-two cards', { exact: false }),
  ).toBeTruthy()

  const character = makeCharacterFixture({ originSystem: '2014', equipment: [] })
  const actor = applyCharacterCommandResult(
    character,
    addManualEquipmentBatchCommand(character, character.provenance, [deck!]),
  )
  const lookup = buildGameDataLookups(makeGameDataFixture({ items: [deck!] }))
  const view = createCurrentCharacterSheetViewModel(actor, lookup)
  const pdf = await PDFDocument.load(
    await generateTestCharacterSheet(view, '2014-custom', { text: { overflow: 'notes' } }),
  )
  const printed = pdf
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
  expect(printed).toContain('Playing Card Card Ace of diamonds Vizier*')
  expect(printed).toContain('Ace of hearts The Fates*')
  expect(printed).toContain('Found only in a deck with twenty-two cards')
}, 30_000)
