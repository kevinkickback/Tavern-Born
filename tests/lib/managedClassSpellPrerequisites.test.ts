import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseOptionalFeatures } from '@/lib/5etools/parsers'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  getClassChoiceCandidates,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

test('actual Agonizing Blast setup depends on independent current Eldritch Blast knowledge through save/source loss/restore', () => {
  const fixture = makeManagedClassSpellFixtures()
  const optionalfeatures = parseOptionalFeatures({
    optionalfeature: [
      JSON.parse(readFileSync('tests/fixtures/managedClassSpellGuardedFeature.json', 'utf8')),
    ],
  })
  const catalogs = buildClassChoiceFeatureCatalogs({ ...fixture.data, optionalfeatures })
  const context = { ...fixture.context, catalogs }
  const warlock = fixture.data.classes.find(
    (row) => row.name === 'Warlock' && row.source === 'PHB',
  )!
  const choice = getClassChoiceCandidates(warlock, undefined, catalogs).find(
    (row) => row.label === 'Eldritch Invocations',
  )!
  expect(choice).toBeDefined()
  const option = { entityType: 'optionalFeature' as const, name: 'Agonizing Blast', source: 'PHB' }
  const authority = { classes: fixture.data.classes, catalogs, spellContext: context }
  let saved = makeCharacterFixture({
    classProgression: [{ name: 'Warlock', source: 'PHB', levels: 2 }],
  })
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance,
      choice,
      [option],
      authority,
    ),
  ).toThrow()
  const learned = setManagedClassSpellChoiceCommand(
    saved,
    saved.provenance,
    {
      slot: [
        ['class', 'warlock', 'phb'],
        'class-cantrip',
        'class-feature|pact magic|warlock|phb|1|phb',
        1,
        0,
      ],
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Eldritch Blast', source: 'PHB' },
      policy: 'default',
    },
    context,
  )
  saved = characterPersistenceSchema.parse({
    ...saved,
    ...learned.characterPatch,
    provenance: learned.provenanceUpdate,
  })
  const chosen = applyClassChoiceSelectionWithGrantsCommand(
    saved,
    saved.provenance,
    choice,
    [option],
    authority,
  )
  saved = characterPersistenceSchema.parse({
    ...saved,
    ...chosen.characterPatch,
    provenance: chosen.provenanceUpdate,
  })
  expect(saved.features.some((row) => row.name === 'Agonizing Blast')).toBe(true)
  const before = JSON.stringify(saved)
  const raw = { ...fixture.lookups, classChoiceFeatureCatalogs: catalogs }
  for (const visible of [true, false, true]) {
    const primary = { ...raw, spellsByKey: visible ? raw.spellsByKey : {} }
    const current = createCharacterCalculationContext(saved, primary, raw)
    expect(current.managedClassSpellStatuses[0].active).toBe(visible)
    expect(current.character.features.some((row) => row.name === 'Agonizing Blast')).toBe(visible)
    const pdf = createCharacterSheetViewModel(saved, raw, primary)
    expect(pdf.character.features.some((row) => row.name === 'Agonizing Blast')).toBe(visible)
    expect(pdf.featuresSummary.includes('Agonizing Blast')).toBe(visible)
    expect(current.character.classChoiceSelections).toEqual(saved.classChoiceSelections)
  }
  expect(JSON.stringify(saved)).toBe(before)
})
