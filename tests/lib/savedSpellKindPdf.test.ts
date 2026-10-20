import { readFileSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { afterEach, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { SheetExportReport } from '@/lib/pdf/types'
import { useCharacterStore, validateCharacterData } from '@/store/characterStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { resetCharacterStore } from '../fixtures/characterStoreFixtures'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

afterEach(resetCharacterStore)

const tiefling = (
  JSON.parse(readFileSync('resources/srd/core/data/races.json', 'utf8')) as { race: Race5e[] }
).race.find((race) => race.name === 'Tiefling' && race.source === 'PHB')!
const templates = ['2014-official', '2014-custom', '2024-official', '2024-custom'] as const

function commit(
  character: Character,
  result: ReturnType<typeof selectBonusSpellFixture>,
): Character {
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }) as Character
}

// Current import admits independently saved kinds across owners; the ordinary bonus picker
// correctly prevents creating this overlap. The native owner itself remains strictly validated.
function savedNativeOverlap(reference = 'Hellish Rebuke|PHB') {
  const character = makeNativeRacialCharacter(tiefling, undefined, 3)
  return commit(character, selectBonusSpellFixture(character, reference, 'cantrip'))
}

test('actual strict current import preserves the native unknown contribution before first-page exact-row deduplication', async () => {
  const saved = savedNativeOverlap(),
    before = structuredClone(saved)
  const imported = (
    await useCharacterStore.getState().importCharacters([JSON.parse(JSON.stringify(saved))])
  )[0]
  expect(validateCharacterData(imported)).toBeNull()
  const native = imported.spells.spellProfiles.find((profile) => profile.type === 'racial')!
  expect(native.spellsKnown).toContain('hellish rebuke|PHB')
  expect(native.cantrips).not.toContain('hellish rebuke|PHB')
  expect(
    imported.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toContain('Hellish Rebuke|PHB')
  const vm = createCurrentCharacterSheetViewModel(imported, {})
  expect(vm.spellRows.filter((row) => row.id === 'hellish rebuke|phb')).toEqual([
    expect.objectContaining({ level: '?' }),
  ])
  expect(vm.spellcastingPages[0].spellRows).toContainEqual(
    expect.objectContaining({ id: 'hellish rebuke|phb', level: '?' }),
  )
  for (const id of templates) {
    expect(planSheetContent(vm, id).overflow).toContainEqual(
      expect.objectContaining({ text: 'Hellish Rebuke — spell level unknown' }),
    )
    expect(planSheetContent(vm, id, { spells: ['HELLISH REBUKE|phb'] }).overflow).toContainEqual(
      expect.objectContaining({ text: 'Hellish Rebuke — spell level unknown' }),
    )
    expect(planSheetContent(vm, id, { spells: ['stale|phb'] }).overflow).toContainEqual(
      expect.objectContaining({ text: 'Hellish Rebuke — spell level unknown' }),
    )
    expect(
      planSheetContent(vm, id, { spells: [] }).overflow.some((entry) =>
        entry.id.startsWith('unknown-spell-levels:'),
      ),
    ).toBe(false)
    if (id.startsWith('2014'))
      expect(planSheetContent(vm, id, undefined, { spells: false }).overflow).toEqual([])
  }
  expect(saved).toEqual(before)
})

test('other-printing cantrips and metadata remain isolated; loaded exact rank is authoritative', () => {
  const character = savedNativeOverlap('Hellish Rebuke|XPHB'),
    before = structuredClone(character)
  const vm = createCurrentCharacterSheetViewModel(character, {
    spellsByKey: buildSpellLookup([
      makeSpellFixture({ name: 'Hellish Rebuke', source: 'XPHB', level: 0 }),
    ]),
  })
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({ id: 'hellish rebuke|phb', level: '?' }),
  )
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({ id: 'hellish rebuke|xphb', level: 'C' }),
  )
  for (const id of templates)
    expect(
      planSheetContent(vm, id, { spells: ['hellish rebuke|xphb'] }).overflow.some((entry) =>
        entry.id.startsWith('unknown-spell-levels:'),
      ),
    ).toBe(false)
  const restored = createCurrentCharacterSheetViewModel(savedNativeOverlap(), {
    spellsByKey: buildSpellLookup([
      makeSpellFixture({ name: 'Hellish Rebuke', source: 'PHB', level: 1 }),
    ]),
  })
  expect(restored.spellRows).toContainEqual(
    expect.objectContaining({ id: 'hellish rebuke|phb', level: '1' }),
  )
  for (const id of templates)
    expect(
      planSheetContent(restored, id).overflow.some((entry) =>
        entry.id.startsWith('unknown-spell-levels:'),
      ),
    ).toBe(false)
  expect(character).toEqual(before)
})

test('same-kind overlap and a cantrip mirrored in fixed or prepared fields retain one cantrip row', () => {
  const character = savedNativeOverlap('Thaumaturgy|PHB')
  const before = structuredClone(character),
    vm = createCurrentCharacterSheetViewModel(character, {})
  expect(vm.spellRows.filter((row) => row.id === 'thaumaturgy|phb')).toEqual([
    expect.objectContaining({ level: 'C' }),
  ])
  expect(vm.spellcastingPages[0].spellRows.filter((row) => row.id === 'thaumaturgy|phb')).toEqual([
    expect.objectContaining({ level: 'C' }),
  ])
  expect(character).toEqual(before)
})

test.each(
  templates,
)('actual %s export preserves an independently saved native unknown contribution', async (id) => {
  const character = savedNativeOverlap(),
    before = structuredClone(character)
  const vm = createCurrentCharacterSheetViewModel(character, {}),
    vmBefore = structuredClone(vm)
  let report: SheetExportReport | undefined
  const bytes = await generateTestCharacterSheet(vm, id, {
    onReport: (value) => {
      report = value
    },
  })
  expect(report!.preserved).toContainEqual(
    expect.objectContaining({ text: 'Hellish Rebuke — spell level unknown' }),
  )
  expect(
    (await PDFDocument.load(bytes)).getForm().getTextField('P5.ASnotes.Notes.Left').getText(),
  ).toContain('Hellish Rebuke — spell level unknown')
  expect(character).toEqual(before)
  expect(vm).toEqual(vmBefore)
}, 30_000)

test.each(
  templates,
)('actual %s reports the independent unknown contribution omitted when Notes are disabled', async (id) => {
  const character = savedNativeOverlap()
  const before = structuredClone(character)
  const vm = createCurrentCharacterSheetViewModel(character, {})
  const vmBefore = structuredClone(vm)
  let report: SheetExportReport | undefined
  await generateTestCharacterSheet(vm, id, {
    pages: { notes: false },
    onReport: (value) => {
      report = value
    },
  })
  const unknown = expect.objectContaining({ text: 'Hellish Rebuke — spell level unknown' })
  expect(report!.omitted).toContainEqual(unknown)
  expect(report!.preserved).not.toContainEqual(unknown)
  expect(character).toEqual(before)
  expect(vm).toEqual(vmBefore)
}, 30_000)
