import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCannyFixture, selectCanny } from '../fixtures/cannyFixtures'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

test.each([
  '2014-official',
  '2014-custom',
  '2024-official',
  '2024-custom',
] as const)('actual %s full/names binary includes adopted passive features and earned upgrades', async (template) => {
  const { data, catalogs } = makeOptionalClassSourceData()
  let character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 10 }],
    variantRules: { optionalClassFeatures: true },
  })
  for (const root of OPTIONAL_CLASS_FEATURE_RULES.roots) {
    const result = setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      catalogs,
      { owner: root.owner, target: root.target, earnedLevel: root.level },
      true,
      [],
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const before = JSON.stringify(character)
  const vm = createCharacterSheetViewModel(character, {
    ...data.lookups!,
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  })
  for (const descriptions of ['full', 'names'] as const) {
    const bytes = await generateTestCharacterSheet(vm, template, {
      text: { descriptions, overflow: 'notes' },
      pages: { notes: true },
    })
    const pdf = await PDFDocument.load(bytes)
    const text = pdf
      .getForm()
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join('\n')
      .replace(/\s+/gu, ' ')
    for (const name of [
      'Deft Explorer',
      'Favored Foe',
      'Spellcasting Focus',
      'Deft Explorer Improvement (Level 6)',
      'Deft Explorer Improvement (Level 10)',
    ])
      expect(text).toContain(name)
    if (descriptions === 'full') {
      expect(text).toContain('Roving')
      expect(text).toContain('Tireless')
    } else {
      expect(text).not.toContain('Roving')
      expect(text).not.toContain('Tireless')
    }
  }
  expect(JSON.stringify(character)).toBe(before)
})

const cases = (['2014-official', '2014-custom', '2024-official', '2024-custom'] as const).flatMap(
  (id) =>
    (['full', 'names'] as const).flatMap((descriptions) =>
      [true, false].map((available) => ({ id, descriptions, available })),
    ),
)

test.each(
  cases,
)('$id actual binary $descriptions export with current source $available uses effective grants', async ({
  id,
  descriptions,
  available,
}) => {
  const f = makeCannyFixture()
  const saved = selectCanny(
    f,
    'languages',
    ['Elvish', 'Dwarvish'],
    selectCanny(f, 'expertise', ['Survival']),
  )
  const before = JSON.stringify(saved)
  const inputs = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const catalogs = available
    ? f.catalogs
    : { ...f.catalogs, classFeatures: [], classFeatureCandidates: new Map() }
  const vm = createCharacterSheetViewModel(saved, {
    ...inputs,
    classChoiceFeatureCatalogs: catalogs,
  })
  const bytes = await generateTestCharacterSheet(vm, id, { text: { descriptions } })
  const form = (await PDFDocument.load(bytes)).getForm()
  const skillField = id === '2014-official' ? 'Survival' : id === '2014-custom' ? 'Sur' : 'Text_41'
  const languageField =
    id === '2014-official' ? 'ProficienciesLang' : id === '2014-custom' ? 'Language 1' : 'Text_91'
  const modifier = vm.skillByName.get('survival')!.modifier
  const expected = createCharacterSheetViewModel(f.character, inputs).skillByName.get(
    'survival',
  )!.modifier
  expect(modifier).toBe(expected + (available ? 2 : 0))
  expect(form.getTextField(skillField).getText()).toBe(
    modifier >= 0 ? `+${modifier}` : String(modifier),
  )
  const printed = form.getTextField(languageField).getText() ?? ''
  if (available) expect(printed.toLowerCase()).toContain('elvish')
  else expect(printed.toLowerCase()).not.toContain('elvish')
  expect(JSON.stringify(saved)).toBe(before)
})
