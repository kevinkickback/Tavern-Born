import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { getExpertiseSlotsFromClasses } from '@/lib/calculations/skills'
import { resolveClassProficiencyOptions } from '@/lib/character/classProficiencyOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  applyProficiency,
  expertiseOption,
  makeClassProficiencyFixture,
} from '../fixtures/classProficiencyFixtures'

test.each([
  [
    'Bard',
    'PHB',
    10,
    [
      [3, 2],
      [10, 2],
    ],
  ],
  [
    'Bard',
    'XPHB',
    9,
    [
      [2, 2],
      [9, 2],
    ],
  ],
  [
    'Expert Sidekick',
    'TCE',
    15,
    [
      [3, 2],
      [15, 2],
    ],
  ],
  ['Wizard', 'XPHB', 2, [[2, 1]]],
] as const)('%s %s gains retain independent quotas, pending state and strict reopen', (name, source, level, expected) => {
  const f = makeClassProficiencyFixture(name, source, level)
  expect(f.choices.map((row) => [row.level, row.maximumSelections])).toEqual(expected)
  expect(getExpertiseSlotsFromClasses(f.character.classProgression, { selected: f.cls })).toBe(0)
  const blank = { ...f.character, proficiencies: { ...f.character.proficiencies, skills: [] } }
  expect(
    getClassProficiencyWorkflow(blank, f.data.classes, f.catalogs).every(
      (row) => row.options.length === 0,
    ),
  ).toBe(true)
  const saved = applyProficiency(f, f.choices[0], [expertiseOption('Arcana')])
  expect(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(saved.proficiencies.skills).toEqual(f.character.proficiencies.skills)
  const model = getSkillExpertiseChoices(saved, {
    classes: f.data.classes,
    feats: [],
    catalogs: f.catalogs,
  })
  expect(model.remaining).toBe(expected.reduce((sum, row) => sum + row[1], 0) - 1)
  expect(
    model.rows.some(
      (row) =>
        row.category === 'Expertise' && row.itemName === 'Arcana' && row.attribution === 'class',
    ),
  ).toBe(true)
  const missing = { ...f.catalogs, classFeatures: [], classFeatureCandidates: new Map() }
  const suspended = refreshClassProficiencyState(saved, f.data.classes, missing)
  expect(suspended.proficiencies.expertise).toEqual([])
  expect(suspended.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(refreshClassProficiencyState(suspended, f.data.classes, f.catalogs).proficiencies).toEqual(
    saved.proficiencies,
  )
  expect(applyProficiency(f, f.choices[0], [], saved).proficiencies.expertise).toEqual([])
})

test('Scholar allows only its tagged proficient skill pool and strict admission rejects a forged off-pool relation', () => {
  const f = makeClassProficiencyFixture('Wizard', 'XPHB', 2)
  const choice = f.choices[0]
  f.character.proficiencies.skills.push('athletics', 'medicine')
  expect(
    resolveClassProficiencyOptions(choice, f.catalogs, [], f.character).map((row) =>
      row.reference.name.toLowerCase(),
    ),
  ).toEqual(['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'])
  expect(() => applyProficiency(f, choice, [expertiseOption('Athletics')])).toThrow(/eligibility/)
  const saved = applyProficiency(f, choice, [expertiseOption('Arcana')])
  const forged = {
    ...saved,
    proficiencies: { ...saved.proficiencies, expertise: [] },
    provenance: {
      ...saved.provenance,
      proficiencies: { ...saved.provenance.proficiencies, expertise: {} },
    },
    classChoiceSelections: [
      {
        ...saved.classChoiceSelections![0],
        selected: [{ ...expertiseOption('Athletics'), slotLevel: 2 }],
      },
    ],
  }
  expect(characterPersistenceSchema.safeParse(forged).success).toBe(false)
})

test('revised Ranger keeps separate Expertise and table-derived language allowances with optional features off', () => {
  const f = makeClassProficiencyFixture('Ranger', 'XPHB', 9)
  expect(f.character.variantRules?.optionalClassFeatures ?? false).toBe(false)
  expect(f.choices.map((row) => [row.level, row.proficiencyDomain, row.maximumSelections])).toEqual(
    [
      [2, 'expertise', 1],
      [2, 'languages', 2],
      [9, 'expertise', 2],
    ],
  )
  const expert = f.choices[0],
    languages = f.choices[1]
  const saved = applyProficiency(f, expert, [expertiseOption('Survival')])
  const picked = applyProficiency(
    f,
    languages,
    [getProficiencyOption('languages', 'Elvish'), getProficiencyOption('languages', 'Dwarvish')],
    saved,
  )
  expect(picked.proficiencies.expertise).toEqual(['survival'])
  expect(picked.proficiencies.languages).toEqual(expect.arrayContaining(['elvish', 'dwarvish']))
  const forged = {
    ...picked,
    classChoiceSelections: picked.classChoiceSelections!.map((row) =>
      row.choiceId === languages.id
        ? { ...row, selected: [{ ...getProficiencyOption('languages', 'Invented'), slotLevel: 2 }] }
        : row,
    ),
    proficiencies: { ...picked.proficiencies, languages: [] },
    provenance: {
      ...picked.provenance,
      proficiencies: { ...picked.provenance.proficiencies, languages: {} },
    },
  }
  expect(characterPersistenceSchema.safeParse(forged).success).toBe(false)
  const offTable = { ...f.catalogs, languages: [...f.catalogs.languages!, { name: 'Invented' }] }
  expect(
    resolveClassProficiencyOptions(languages, offTable, [], f.character).some(
      (row) => row.reference.name === 'Invented',
    ),
  ).toBe(false)
  const cleared = applyProficiency(f, expert, [], picked)
  expect(cleared.proficiencies.languages).toEqual(picked.proficiencies.languages)
  expect(cleared.classChoiceSelections?.some((row) => row.choiceId === languages.id)).toBe(true)
})
