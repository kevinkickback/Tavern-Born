import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const fixture = makeManagedClassSpellFixtures()
function savedCharacter() {
  let character = makeCharacterFixture({
    classProgression: [
      { name: 'Bard', source: 'PHB', levels: 1 },
      { name: 'Cleric', source: 'PHB', levels: 1 },
    ],
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  const selected = setManagedClassSpellChoicesCommand(
    character,
    character.provenance,
    [
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-known',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Healing Word', source: 'PHB' },
        policy: 'default',
      },
    ],
    fixture.context,
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
  })
  const daily = setDailyClassSpellPreparedCommand(
    character,
    character.provenance,
    'class:Cleric|PHB',
    'Bless|PHB',
    true,
    { ...fixture.context, abilityScores: character.abilityScores },
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...daily.characterPatch,
    provenance: daily.provenanceUpdate,
  })
}

test.each([
  ['2014-official', true],
  ['2014-official', false],
  ['2024-official', true],
  ['2024-official', false],
] as const)('actual %s PDF includes only current managed/daily spells, source visible=%s', async (id, visible) => {
  const saved = savedCharacter()
  const before = JSON.stringify(saved)
  const primary = { ...fixture.lookups, spellsByKey: visible ? fixture.lookups.spellsByKey : {} }
  const vm = createCharacterSheetViewModel(saved, fixture.lookups, primary)
  const expected = ['Light', 'Healing Word', 'Bless']
  for (const name of expected) expect(vm.spellRows.some((row) => row.name === name)).toBe(visible)
  const bytes = await generateTestCharacterSheet(vm, id)
  const form = (await PDFDocument.load(bytes)).getForm()
  const text = form
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  for (const name of expected) expect(text.includes(name)).toBe(visible)
  expect(JSON.stringify(saved)).toBe(before)
  expect(saved.managedClassSpellRevision).toBe(2)
  expect(saved.managedClassSpellChoices).toHaveLength(2)
  expect(
    saved.spells.spellProfiles.find((row) => row.className === 'Cleric')?.preparedSpells,
  ).toEqual(['Bless|PHB'])
})
