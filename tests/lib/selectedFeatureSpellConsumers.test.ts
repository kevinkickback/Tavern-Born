// @vitest-environment jsdom
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'
import {
  applyWarriorResult,
  makeWarriorSpellFixtures,
  selectWarriorFixture,
} from '../fixtures/warriorSpellFixtures'

const fixture = makeWarriorSpellFixtures()
function selected(name: 'Paladin' | 'Ranger', source: 'PHB' | 'XPHB') {
  let { character } = selectWarriorFixture(fixture, name, source)
  character.abilityScores.wisdom = 16
  character.abilityScores.charisma = 16
  const slots = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)
  character = applyWarriorResult(
    character,
    setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      slots.map((slot, index) => ({
        slot,
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: index ? 'Resistance' : 'Guidance', source },
        policy: 'default',
      })),
      fixture.context,
    ),
  )
  return character
}

test.each([
  ['Ranger', 'PHB'],
  ['Paladin', 'XPHB'],
] as const)('%s %s shared consumers use the class-owned cantrips and source-qualified attribution', (name, source) => {
  const character = selected(name, source)
  const calculation = createCharacterCalculationContext(character, fixture.lookups, fixture.lookups)
  const detail = calculation.classCasting.details.find((row) => row.className === name)!
  expect(detail.spellSaveDC).toBe(13)
  expect(detail.spellAttackBonus).toBe(5)
  expect(detail.cantripLimit).toBeNull()
  expect(calculation.managedClassSpellStatuses.every((row) => row.active)).toBe(true)
  expect(
    buildPrerequisiteSnapshot({
      character,
      effectiveSpellProfiles: calculation.character.spells.spellProfiles,
    }).spells?.cantrips,
  ).toContain(`Guidance|${source}`)
  expect(
    deriveSpellActions(calculation.character, fixture.context.spellsByKey, {
      effectiveSpellProfiles: calculation.character.spells.spellProfiles,
    }).some((row) => row.name === 'Guidance'),
  ).toBe(true)
  const sources = buildSpellSelectionSourceMap({
    spellProfiles: calculation.character.spells.spellProfiles,
    ledger: calculation.character.provenance,
    choices: character.managedClassSpellChoices,
    classProgression: character.classProgression,
  })
  expect(
    [...sources.values()].some((text) =>
      text.includes(name === 'Ranger' ? 'Druidic Warrior' : 'Blessed Warrior'),
    ),
  ).toBe(true)
  expect(
    validateSpells(character, calculation, fixture.context.spellsByKey).some(
      (issue) => issue.id.includes('spells:managed:') && issue.title.includes('cantrip'),
    ),
  ).toBe(false)
  for (const model of [
    createCharacterSheetViewModel(character, fixture.lookups, fixture.lookups),
    withoutSheetDescriptions(
      createCharacterSheetViewModel(character, fixture.lookups, fixture.lookups),
    ),
  ])
    expect(model.spellRows.some((row) => row.name === 'Guidance')).toBe(true)
})

test.each([
  ['2014-official', false, 'Ranger', 'PHB'],
  ['2014-official', true, 'Ranger', 'PHB'],
  ['2024-official', false, 'Paladin', 'XPHB'],
  ['2024-official', true, 'Paladin', 'XPHB'],
] as const)('Warrior cantrips reach actual %s PDF, namesOnly=%s', async (template, namesOnly, name, source) => {
  const character = selected(name, source)
  const model = createCharacterSheetViewModel(character, fixture.lookups, fixture.lookups)
  const bytes = await generateTestCharacterSheet(
    namesOnly ? withoutSheetDescriptions(model) : model,
    template,
  )
  const text = (await PDFDocument.load(bytes))
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  expect(text).toContain('Guidance')
  expect(text).toContain('Resistance')
})
