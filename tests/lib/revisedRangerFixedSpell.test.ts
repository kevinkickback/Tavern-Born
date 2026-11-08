// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const fixture = makeManagedClassSpellFixtures()
const file = 'resources/srd/core/data/class/class-ranger.json'
const document = JSON.parse(readFileSync(file, 'utf8'))
const parsed = parseClassDocument(document, file)
const classes = parsed.classes as Class5e[]
const classFeatures = parsed.classFeatures as ClassFeature[]
const catalogs = buildClassChoiceFeatureCatalogs({
  classes,
  classFeatures,
  classCastingSources: parsed.classCastingSources,
})
const lookups = {
  ...fixture.lookups,
  classChoiceClasses: classes,
  classChoiceFeatureCatalogs: catalogs,
}
const profileId = 'class:Ranger|XPHB'
const mark = "Hunter's Mark|XPHB"
const actor = makeCharacterFixture({
  originSystem: '2024',
  allowedSources: ['XPHB'],
  classProgression: [{ name: 'Ranger', source: 'XPHB', levels: 1 }],
})
const current = {
  catalogs,
  spellsByKey: fixture.context.spellsByKey,
  abilityScores: actor.abilityScores,
}
const readProfile = (character: Character) =>
  character.spells.spellProfiles.find((row) => row.id === profileId)
const prepare = (character: Character, reference: string, rules = current, desired = true) => {
  const change = setDailyClassSpellPreparedCommand(
    character,
    character.provenance,
    profileId,
    reference,
    desired,
    rules,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...change.characterPatch,
    provenance: change.provenanceUpdate,
  })
}

test('revised Favored Enemy grants exact Mark outside ordinary quota through Actions and PDF', async () => {
  expect(readProfile(actor)).toBeUndefined()
  expect(() => prepare(actor, mark)).toThrow(/already always prepared/)
  const saved = prepare(prepare(actor, 'Goodberry|XPHB'), 'Alarm|XPHB')
  expect(() => prepare(saved, 'Cure Wounds|XPHB')).toThrow(/limit/)
  expect(readProfile(saved)?.preparedSpells).toEqual(['Goodberry|XPHB', 'Alarm|XPHB'])
  const calculation = createCharacterCalculationContext(saved, lookups)
  const effective = readProfile(calculation.character)!
  expect(effective.alwaysPreparedSpells).toEqual([mark])
  expect(effective.fixedSpells).toEqual([mark])
  expect(calculation.classCasting.details[0].preparedSpellLimit).toBe(2)
  expect(getSpellProfileSelectionCounts(effective).prepared).toBe(2)
  expect(calculation.character.provenance.spells["hunter's mark"]).toContainEqual(
    expect.objectContaining({
      sourceType: 'class',
      sourceName: 'Ranger',
      sourceRef: 'XPHB',
      grantType: 'fixed',
      grantSource: 'XPHB',
      label: 'Favored Enemy',
    }),
  )
  const spells = fixture.context.spellsByKey
  expect(
    deriveSpellActions(calculation.character, spells, {
      effectiveSpellProfiles: calculation.character.spells.spellProfiles,
    }),
  ).toContainEqual(
    expect.objectContaining({
      name: "Hunter's Mark",
      active: true,
      source: { kind: 'spell', name: "Hunter's Mark", source: 'XPHB' },
    }),
  )
  const vm = createCharacterSheetViewModel(saved, lookups, lookups)
  const pdf = await PDFDocument.load(await generateTestCharacterSheet(vm, '2024-official'))
  const text = pdf
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  expect(text).toContain("Hunter's Mark")
})

test("Foe Slayer attaches the earned Hunter's Mark die to the existing prepared spell", () => {
  const note = (levels: number, inputs = lookups) =>
    createCharacterSheetViewModel(
      { ...actor, classProgression: [{ ...actor.classProgression[0], levels }] },
      inputs,
      inputs,
    ).spellRows.find((spell) => spell.name === "Hunter's Mark")?.castingNote
  expect(note(19)).toBe('')
  expect(note(20)).toContain('d10')
  const edited = structuredClone(document)
  const feature = edited.classFeature.find(
    (row: { name: string; source: string }) => row.name === 'Foe Slayer' && row.source === 'XPHB',
  )
  feature.entries[0] = feature.entries[0].replace('d10', 'd12')
  const changed = parseClassDocument(edited, file)
  const changedClasses = changed.classes as Class5e[]
  const changedLookups = {
    ...lookups,
    classChoiceClasses: changedClasses,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({
      classes: changedClasses,
      classFeatures: changed.classFeatures as ClassFeature[],
      classCastingSources: changed.classCastingSources,
    }),
  }
  expect(note(20, changedLookups)).toContain('d12')
})

test('source loss and restoration preserve a previously chosen independent daily Mark', () => {
  const missingFeature = {
    ...current,
    catalogs: {
      ...catalogs,
      classFeatures: classFeatures.filter((feature) => feature.name !== 'Favored Enemy'),
    },
  }
  const saved = prepare(actor, mark, missingFeature)
  const snapshot = JSON.stringify(saved)
  for (const rules of [current, missingFeature, current]) {
    const view = projectManagedClassSpellState(saved, rules)
    expect(readProfile(view.character)?.preparedSpells).toEqual([mark])
    expect(readProfile(view.character)?.alwaysPreparedSpells ?? []).toEqual(
      rules === current ? [mark] : [],
    )
    expect(getSpellProfileSelectionCounts(readProfile(view.character)!).prepared).toBe(
      rules === current ? 0 : 1,
    )
  }
  expect(JSON.stringify(saved)).toBe(snapshot)
  expect(readProfile(prepare(saved, mark, missingFeature, false))?.preparedSpells).toEqual([])
  const missingSpell = { ...lookups, spellsByKey: {} }
  const hidden = createCharacterCalculationContext(saved, missingSpell, lookups)
  expect(readProfile(hidden.character)?.fixedSpells ?? []).toEqual([])
  expect(validateSpells(saved, hidden, missingSpell.spellsByKey)).toContainEqual(
    expect.objectContaining({ title: `Restore Favored Enemy spell: ${mark}` }),
  )
  const legacy = makeCharacterFixture({
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 2 }],
  })
  expect(projectManagedClassSpellState(legacy, current).fixedClassSpellStatuses).toEqual([])
})

test('competing or stale parent and feature declarations cannot grant the spell', () => {
  const ranger = classes.find((row) => row.source === 'XPHB')!
  const spell = current.spellsByKey[mark]
  expect(spell).toBeDefined()
  for (const classes of [
    [ranger, ranger],
    [{ ...ranger, sourceIdentityConflict: true as const }],
    [{ ...ranger, classFeatures: [] }],
    [{ ...ranger, additionalSpells: [{ prepared: { 1: [mark, mark] } }] }],
  ]) {
    expect(
      projectManagedClassSpellState(actor, { ...current, catalogs: { ...catalogs, classes } })
        .fixedClassSpellStatuses,
    ).toEqual([])
  }
  expect(
    projectManagedClassSpellState(actor, { ...current, spellsByKey: { one: spell, two: spell } })
      .fixedClassSpellStatuses,
  ).toMatchObject([{ reference: mark, active: false }])
})
