// @vitest-environment jsdom
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getManagedSpellCastingNotes } from '@/lib/calculations/managedSpellCasting'
import { buildSpellProfileDisplayModels } from '@/lib/calculations/spellProfileDisplayModel'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  authorManagedClassSpellFixture,
  makeManagedClassSpellFixtures,
} from '../fixtures/managedClassSpellFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const fixture = makeManagedClassSpellFixtures()
const authored = (source: 'PHB' | 'XPHB') => {
  const owner = { name: 'Warlock', source, levels: 17 }
  return authorManagedClassSpellFixture(
    makeCharacterFixture({
      originSystem: source === 'PHB' ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [owner],
    }),
    fixture,
    [{ owner, domain: 'class-arcanum', gain: 11, targets: [{ name: 'Circle of Death', source }] }],
  )
}

test.each([
  'PHB',
  'XPHB',
] as const)('%s effective prerequisites, Actions, readiness and ordinary quota agree', (source) => {
  const saved = authored(source)
  for (const visible of [true, false, true]) {
    const primary = { ...fixture.lookups, spellsByKey: visible ? fixture.lookups.spellsByKey : {} }
    const calculation = createCharacterCalculationContext(saved, primary, fixture.lookups)
    const profile = calculation.character.spells.spellProfiles.find((row) => row.type === 'class')!
    const notes = getManagedSpellCastingNotes(
      calculation.managedClassSpellStatuses,
      `Circle of Death|${source}`,
      profile,
    )
    expect(notes.length).toBe(visible ? 1 : 0)
    expect(
      calculation.classChoices.prerequisites.effectiveSpellProfiles?.some((row) =>
        row.spellsKnown.includes(`Circle of Death|${source}`),
      ),
    ).toBe(visible)
    const actions = deriveCharacterActions(calculation.character, {
      abilityModifiers: calculation.abilityScores.modifiers,
      proficiencyBonus: 6,
      classes: calculation.classes,
      effectiveSpellProfiles: calculation.character.spells.spellProfiles,
      managedClassSpellStatuses: calculation.managedClassSpellStatuses,
      spellsByKey: fixture.lookups.spellsByKey,
    })
    const action = actions.find((row) => row.name === 'Circle of Death')
    expect(!!action).toBe(visible)
    if (action) {
      expect(action.active).toBe(true)
      expect(action.description).toContain('once per long rest, without expending a spell slot')
    }
    const models = buildSpellProfileDisplayModels({
      spellProfiles: [profile],
      groupedItems: new Map(),
      detailsByProfileId: new Map(
        calculation.classCasting.details.map((row) => [row.profileId, row]),
      ),
      managedClassSpellStatuses: calculation.managedClassSpellStatuses,
    })
    expect(models[0].missingSpells).toBe(calculation.classCasting.details[0].knownSpellLimit)
    expect(
      Object.keys(calculation.classCasting.slots.mergedPactWithUsage)
        .map(Number)
        .every((level) => level <= 5),
    ).toBe(true)
    const issues = validateSpells(saved, calculation, primary.spellsByKey)
    expect(issues.filter((row) => row.title.includes('Mystic Arcanum'))).toHaveLength(
      visible ? 3 : 4,
    )
  }
})

test.each([
  ['2014-official', 'PHB'],
  ['2024-official', 'XPHB'],
] as const)(
  'actual %s full and names-only PDFs retain Arcanum use semantics and suspend unavailable benefits',
  async (id, source) => {
    const saved = authored(source)
    const before = JSON.stringify(saved)
    for (const visible of [true, false]) {
      const primary = {
        ...fixture.lookups,
        spellsByKey: visible ? fixture.lookups.spellsByKey : {},
      }
      const vm = createCharacterSheetViewModel(saved, fixture.lookups, primary)
      expect(vm.spellRows.some((row) => row.name === 'Circle of Death')).toBe(visible)
      expect(
        vm.spellRows
          .find((row) => row.name === 'Circle of Death')
          ?.notes.includes('without expending a spell slot'),
      ).toBe(visible ? true : undefined)
      for (const model of [vm, withoutSheetDescriptions(vm)]) {
        const bytes = await generateTestCharacterSheet(model, id)
        const text = (await PDFDocument.load(bytes))
          .getForm()
          .getFields()
          .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
          .join('\n')
        expect(text.includes('Circle of Death')).toBe(visible)
        expect(text.includes('without expending a spell slot')).toBe(visible)
        expect(text.includes('Uses are not tracked')).toBe(visible)
      }
    }
    expect(JSON.stringify(saved)).toBe(before)
  },
  30000,
)
