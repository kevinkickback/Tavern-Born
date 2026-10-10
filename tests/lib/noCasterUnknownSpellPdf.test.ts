import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  addSpellToCharacter,
  setClassSpellSelectionsAtLevel,
} from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { SheetExportReport } from '@/lib/pdf/types'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeClassFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

function noCaster(kind: 'bonus' | 'unavailable-class') {
  if (kind === 'bonus') {
    const initial = makeNativeRacialCharacter({ name: 'Human', source: 'PHB' } as Race5e)
    const special = initial.spells.spellProfiles.find((profile) => profile.type === 'special')!
    const result = addSpellToCharacter(
      initial,
      initial.provenance,
      'Bless|PHB',
      'spell',
      special.id,
    )
    return characterPersistenceSchema.parse({
      ...initial,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const wizard = makeClassFixture({ spellcastingAbility: 'int' })
  const initial = buildInitialCharacter(
    {
      initial: { name: 'Unavailable caster', originSystem: '2024' },
      race: { name: 'Human', source: 'XPHB' },
      classEntity: wizard,
      background: { name: 'Acolyte', source: 'XPHB' },
    },
    new Map(),
    () => [],
  )
  const result = setClassSpellSelectionsAtLevel(initial, initial.provenance, {
    className: 'Wizard',
    classSource: 'PHB',
    classLevel: 1,
    selections: [{ name: 'Shield|PHB', spellLevel: 1 }],
  })
  return characterPersistenceSchema.parse({
    ...initial,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

const exportCases = [
  ['2014-official', 'bonus', 'Bless'],
  ['2014-custom', 'bonus', 'Bless'],
  ['2024-official', 'bonus', 'Bless'],
  ['2024-custom', 'bonus', 'Bless'],
  ['2014-official', 'unavailable-class', 'Shield'],
  ['2014-custom', 'unavailable-class', 'Shield'],
  ['2024-official', 'unavailable-class', 'Shield'],
  ['2024-custom', 'unavailable-class', 'Shield'],
] as const

test.each(exportCases)(
  'actual %s retains unknown %s spell Notes without inventing a casting owner',
  async (id, kind, name) => {
    const character = noCaster(kind)
    const before = structuredClone(character)
    const vm = createCharacterSheetViewModel(character, {
      // Another printing cannot supply PHB's level or change its saved leveled kind.
      spellsByKey: buildSpellLookup([makeSpellFixture({ name, source: 'XPHB', level: 0 })]),
    })
    const vmBefore = structuredClone(vm)
    expect(vm.spellcastingSources).toEqual([])
    expect(vm.spellcastingPages).toEqual([])
    expect(vm.spellRows).toContainEqual(
      expect.objectContaining({ name, level: '?', prepared: kind === 'bonus' }),
    )
    const unknown = expect.objectContaining({
      title: 'Spells with unknown levels',
      text: `${name} — spell level unknown`,
    })
    expect(planSheetContent(vm, id).overflow).toContainEqual(unknown)
    expect(
      planSheetContent(vm, id, { spells: [] }).overflow.some((entry) =>
        entry.id.startsWith('unknown-spell-levels:'),
      ),
    ).toBe(false)
    expect(
      planSheetContent(vm, id, { spells: [`${name.toLowerCase()}|phb`] }).overflow,
    ).toContainEqual(unknown)
    expect(planSheetContent(vm, id, { spells: ['stale|phb'] }).overflow).toContainEqual(unknown)
    if (id.startsWith('2014'))
      expect(planSheetContent(vm, id, undefined, { spells: false }).overflow).toEqual([])

    let report: SheetExportReport | undefined
    const bytes = await generateTestCharacterSheet(vm, id, {
      onReport: (value) => {
        report = value
      },
    })
    expect(report!.preserved).toContainEqual(unknown)
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(form.getTextField('P5.ASnotes.Notes.Left').getText()).toContain(
      `${name} — spell level unknown`,
    )
    if (id.startsWith('2024')) {
      const plan = planSheetContent(vm, id)
      expect(plan.viewModel.spellRows.length).toBe(kind === 'bonus' ? 1 : 0)
    }
    expect(character).toEqual(before)
    expect(vm).toEqual(vmBefore)
  },
  30_000,
)

test.each(exportCases)(
  'actual %s reports unknown %s spell omission when Notes are disabled',
  async (id, kind, name) => {
    const character = noCaster(kind)
    const before = structuredClone(character)
    const vm = createCharacterSheetViewModel(character, {
      spellsByKey: buildSpellLookup([makeSpellFixture({ name, source: 'XPHB', level: 0 })]),
    })
    const vmBefore = structuredClone(vm)
    const unknown = expect.objectContaining({
      title: 'Spells with unknown levels',
      text: `${name} — spell level unknown`,
    })
    let report: SheetExportReport | undefined
    await generateTestCharacterSheet(vm, id, {
      pages: { notes: false },
      onReport: (value) => {
        report = value
      },
    })
    expect(report!.omitted).toContainEqual(unknown)
    expect(report!.preserved).not.toContainEqual(unknown)
    expect(character).toEqual(before)
    expect(vm).toEqual(vmBefore)
  },
  30_000,
)

test('known cantrip and exact restored leveled metadata need no fallback unknown explanation', () => {
  const character = noCaster('bonus')
  const special = character.spells.spellProfiles.find((profile) => profile.type === 'special')!
  const result = addSpellToCharacter(
    character,
    character.provenance,
    'Light|PHB',
    'cantrip',
    special.id,
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const lookups = {
    spellsByKey: buildSpellLookup([makeSpellFixture({ name: 'Bless', source: 'PHB', level: 1 })]),
  }
  const vm = createCharacterSheetViewModel(saved, lookups)
  expect(vm.spellRows.map((row) => [row.name, row.level])).toEqual([
    ['Light', 'C'],
    ['Bless', '1'],
  ])
  for (const id of ['2014-official', '2014-custom', '2024-official', '2024-custom'] as const)
    expect(
      planSheetContent(vm, id).overflow.some((entry) =>
        entry.id.startsWith('unknown-spell-levels:'),
      ),
    ).toBe(false)
})
