import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import { getCurrentOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationSource'
import {
  optionalClassProficiencyRule,
  ownedClassProficiencyRule,
} from '@/lib/5etools/ownedClassProficiencyRules'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import { applySkillProficiencyActionCommand } from '@/lib/character/commands/skillProficiencyCommands'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import { withoutSheetDescriptions } from '@/lib/pdf/characterSheetViewModel'
import { applyClassGrants } from '@/lib/provenance/applyClassGrants'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'
import {
  chooseOptionalSkill,
  makeOptionalSkillFixture,
  PRIMAL_TARGET,
} from '../fixtures/optionalSkillFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

type Fixture = ReturnType<typeof makeOptionalSkillFixture>
const model = (f: Fixture, character = f.character) =>
  getSkillProficiencyChoices(character, f.authority)
const effective = (f: Fixture, character: Character) =>
  refreshClassProficiencyState(character, f.data.classes, f.catalogs)
test('actual certified skill pool/schedule creates separate gains with no historical answer or new root', () => {
  const f = makeOptionalSkillFixture()
  expect(classProficiencyRule(PRIMAL_TARGET)).toBeUndefined()
  expect(ownedClassProficiencyRule(PRIMAL_TARGET)).toBe(optionalClassProficiencyRule(PRIMAL_TARGET))
  const m = model(f)
  expect(m.remaining).toBe(2)
  expect(m.classOwners.map((row) => [row.level, row.choice?.maximumSelections])).toEqual([
    [3, 1],
    [10, 1],
  ])
  expect(Object.keys(m.actions).sort()).toEqual([
    'animal handling',
    'athletics',
    'intimidation',
    'nature',
    'perception',
    'survival',
  ])
  expect(m.classOwners.every((row) => row.id.includes(encodeURIComponent(PRIMAL_TARGET)))).toBe(
    true,
  )
  const saved = chooseOptionalSkill(f, f.character, 3, 'nature')
  expect(saved.classChoiceSelections![0].proficiencyAtGain).toBeUndefined()
  expect(saved.classChoiceSelections![0].selected[0].slotLevel).toBe(3)
  expect(saved.proficiencies.skills).toContain('nature')
  expect(saved.proficiencies.expertise).toEqual([])
  expect(saved.optionalClassFeatureAdoptions).toEqual(f.character.optionalClassFeatureAdoptions)
  expect(optionalClassProficiencyRule(PRIMAL_TARGET)?.digest).toBe(
    getCurrentOptionalDeclaration(f.catalogs, ['class', 'barbarian', 'phb'], PRIMAL_TARGET, 3)
      ?.certificate.certificate,
  )
})

test('latest supplied ledger excludes independently proficient skills from both offered and committed new picks', () => {
  const f = makeOptionalSkillFixture()
  const action = model(f).actions.nature.find((row) => row.adding)!
  const cls = f.data.classes.find((row) => row.name === 'Barbarian' && row.source === 'PHB')!
  const ledger = applyClassGrants(
    { name: cls.name, source: cls.source, startingProficiencies: cls.startingProficiencies },
    undefined,
    f.character.provenance,
  )
  const grant = resolveProficiencyChoiceCommand(
    f.character,
    ledger,
    'skills',
    'nature',
    true,
    undefined,
    f.catalogs,
  )
  const current = characterPersistenceSchema.parse({
    ...f.character,
    ...grant.characterPatch,
    provenance: grant.provenanceUpdate,
  })
  expect(current.proficiencies.skills).toContain('nature')
  expect(
    getSkillProficiencyChoices(current, f.authority).actions.nature?.some(
      (row) => row.kind === 'class' && row.adding,
    ),
  ).not.toBe(true)
  const result = applySkillProficiencyActionCommand(
    current,
    current.provenance,
    'nature',
    action.id,
    f.authority,
  )
  expect(result.characterPatch).toEqual({})
  expect(result.provenanceUpdate).toBe(current.provenance)
})
test('no adoption, OFF, unearned, empty/current conflicting authority make no new skill allowance', () => {
  const f = makeOptionalSkillFixture()
  for (const character of [
    { ...f.character, optionalClassFeatureAdoptions: [] },
    { ...f.character, variantRules: { optionalClassFeatures: false } },
    { ...f.character, classProgression: [{ name: 'Barbarian', source: 'PHB', levels: 2 }] },
  ])
    expect(model(f, character).remaining).toBe(0)
  expect(
    getSkillProficiencyChoices(f.character, {
      ...f.authority,
      catalogs: { ...f.catalogs, optionalClassFeatureSources: [] },
    }).remaining,
  ).toBe(0)
  expect(model(makeOptionalSkillFixture(3)).remaining).toBe(1)
  const noProof = { ...f.authority, catalogs: { ...f.catalogs, optionalClassFeatureSources: [] } }
  const oldAction = model(f).actions.nature[0].id
  expect(
    applySkillProficiencyActionCommand(
      f.character,
      f.character.provenance,
      'nature',
      oldAction,
      noProof,
    ).characterPatch,
  ).toEqual({})
})
test('strict admission rejects wrong gain/owner/slot/setup/pool and cross-gain duplicates in both directions', () => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(f, f.character, 3, 'nature')
  const row = saved.classChoiceSelections![0]
  for (const altered of [
    { ...row, classLevel: 10 },
    { ...row, className: 'Ranger' },
    { ...row, subclassName: 'Berserker', subclassSource: 'PHB' },
    { ...row, proficiencyAtGain: { name: 'persuasion', alreadyProficient: true } },
    { ...row, selected: [{ ...row.selected[0], slotLevel: 10 }] },
    { ...row, selected: [{ ...getProficiencyOption('skills', 'arcana'), slotLevel: 3 }] },
  ])
    expect(
      characterPersistenceSchema.safeParse({ ...saved, classChoiceSelections: [altered] }).success,
    ).toBe(false)
  const both = chooseOptionalSkill(f, saved, 10, 'survival')
  for (const level of [3, 10]) {
    const choice = model(f, both).classOwners.find((item) => item.level === level)!.choice!
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        both,
        both.provenance,
        choice,
        [getProficiencyOption('skills', level === 3 ? 'survival' : 'nature')],
        f.authority,
      ),
    ).toThrow()
  }
  const duplicate = both.classChoiceSelections!.map((selection) => ({
    ...selection,
    selected: [{ ...getProficiencyOption('skills', 'nature'), slotLevel: selection.classLevel }],
  }))
  expect(
    characterPersistenceSchema.safeParse({ ...both, classChoiceSelections: duplicate }).success,
  ).toBe(false)
})
test('established overlaps retain independent ownership; source loss/clear/restore does not resurrect', () => {
  const f = makeOptionalSkillFixture()
  let saved: Character = chooseOptionalSkill(f, f.character, 3, 'nature')
  saved = {
    ...saved,
    provenance: addGrant(
      saved.provenance,
      'skills',
      'nature',
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
  const absent = {
    ...f.authority,
    catalogs: { ...f.catalogs, classes: [], optionalClassFeatureSources: [] },
  }
  expect(getSkillProficiencyChoices(saved, absent).remaining).toBe(0)
  expect(
    getSkillProficiencyChoices(saved, absent).rows.some((row) => row.itemName.includes('retained')),
  ).toBe(true)
  const result = retainSavedFeatureOptionsCommand(
    saved,
    saved.provenance,
    saved.classChoiceSelections![0].choiceId,
    [],
    absent,
  )
  const cleared = characterPersistenceSchema.parse({
    ...saved,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(effective(f, cleared).proficiencies.skills).toContain('nature')
  expect(
    effective(f, cleared).provenance.proficiencies.skills.nature.map((tag) => tag.sourceType),
  ).toEqual(['manual'])
  expect(model(f, cleared).actions.nature).toBeUndefined()
  expect(cleared.classChoiceSelections).toEqual([])
})
test('OFF suspends benefits and exact restore rechecks intent without writes; progression removes only unearned gains', () => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(
    f,
    chooseOptionalSkill(f, f.character, 3, 'nature'),
    10,
    'survival',
  )
  const bytes = JSON.stringify(saved)
  const off = effective(f, { ...saved, variantRules: { optionalClassFeatures: false } })
  expect(off.proficiencies.skills).not.toContain('nature')
  expect(off.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(effective(f, saved).proficiencies.skills).toEqual(
    expect.arrayContaining(['nature', 'survival']),
  )
  expect(JSON.stringify(saved)).toBe(bytes)
  const lower = applyClassProgressionUpdate(
    saved,
    saved.provenance,
    [{ name: 'Barbarian', source: 'PHB', levels: 9 }],
    undefined,
    { classChoiceFeatureCatalogs: f.catalogs },
  )
  const next = characterPersistenceSchema.parse({
    ...saved,
    ...lower.characterPatch,
    provenance: lower.provenanceUpdate,
  })
  expect(next.classChoiceSelections!.map((row) => row.classLevel)).toEqual([3])
  expect(next.optionalClassFeatureAdoptions).toEqual(saved.optionalClassFeatureAdoptions)
  const removed = applyClassProgressionUpdate(
    saved,
    saved.provenance,
    [{ name: 'Barbarian', source: 'PHB', levels: 2 }],
    undefined,
    { classChoiceFeatureCatalogs: f.catalogs },
  )
  expect(removed.characterPatch.classChoiceSelections).toEqual([])
  expect(removed.characterPatch.optionalClassFeatureAdoptions).toEqual([])
})
test('shared workflow/calculation and both PDF descriptions use the same saved skill benefits', () => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(f, f.character, 3, 'nature')
  expect(
    getClassProficiencyWorkflow(saved, f.data.classes, f.catalogs).map((row) => row.level),
  ).toEqual([3, 10])
  const sheet = createCurrentCharacterSheetViewModel(saved, {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  })
  const compact = withoutSheetDescriptions(sheet)
  expect(sheet.skillByName.get('nature')?.proficient).toBe(true)
  expect(compact.skillByName).toEqual(sheet.skillByName)
})

test.each([
  'root text',
  'parent pool',
  'duplicate root',
] as const)('source %s drift suspends both gains and rejects a stale action; exact restore retains intent', (kind) => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(f, f.character, 3, 'nature')
  const action = model(f, saved).actions.survival.find((row) => row.adding)!
  const changed = makeOptionalSkillFixture(10, (document) => {
    const root = document.classFeature.find(
      (row) => row.name === 'Primal Knowledge' && row.source === 'TCE',
    )!
    if (kind === 'root text') root.entries = ['Changed rules']
    else if (kind === 'duplicate root') document.classFeature.push(structuredClone(root))
    else
      document.class.find((row) => row.source === 'PHB')!.startingProficiencies = {
        skills: [{ choose: { from: ['arcana'], count: 2 } }],
      }
  })
  expect(effective(changed, saved).proficiencies.skills).not.toContain('nature')
  expect(model(changed, saved).remaining).toBe(0)
  expect(
    applySkillProficiencyActionCommand(
      saved,
      saved.provenance,
      'survival',
      action.id,
      changed.authority,
    ).characterPatch,
  ).toEqual({})
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(effective(changed, saved))),
  )
  expect(effective(f, reopened).proficiencies.skills).toContain('nature')
  expect(reopened.classChoiceSelections).toEqual(saved.classChoiceSelections)
})

test('clearing root adoption keeps both setups dormant; source-absent progression removes only its owner', () => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(
    f,
    chooseOptionalSkill(f, f.character, 3, 'nature'),
    10,
    'survival',
  )
  const result = setOptionalClassAdoptionCommand(
    saved,
    saved.provenance,
    f.catalogs,
    saved.optionalClassFeatureAdoptions![0],
    false,
    getOptionalClassFamilyKeys(saved, saved.optionalClassFeatureAdoptions![0]),
  )
  const cleared = characterPersistenceSchema.parse({
    ...saved,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(cleared.classChoiceSelections?.map(({ inactive: _inactive, ...row }) => row)).toEqual(
    saved.classChoiceSelections,
  )
  expect(effective(f, cleared).proficiencies.skills).not.toContain('nature')
  const restore = setOptionalClassAdoptionCommand(
    cleared,
    cleared.provenance,
    f.catalogs,
    saved.optionalClassFeatureAdoptions![0],
    true,
    [],
  )
  const resumed = characterPersistenceSchema.parse({
    ...cleared,
    ...restore.characterPatch,
    provenance: restore.provenanceUpdate,
  })
  expect(effective(f, resumed).proficiencies.skills).toEqual(
    expect.arrayContaining(['nature', 'survival']),
  )
  const absent = { ...f.catalogs, classes: [], optionalClassFeatureSources: [] }
  const remove = applyClassProgressionUpdate(
    saved,
    saved.provenance,
    [{ name: 'Fighter', source: 'PHB', levels: 10 }],
    undefined,
    { classChoiceFeatureCatalogs: absent },
  )
  expect(remove.characterPatch.classChoiceSelections).toEqual([])
  expect(remove.characterPatch.optionalClassFeatureAdoptions).toEqual([])
})

test('Primal skill foundation qualifies independent Rogue Expertise; final foundation loss suspends only its benefit', () => {
  const f = makeOptionalSkillFixture(3)
  const rogue = makeClassProficiencyFixture('Rogue', 'PHB', 1)
  f.data.classes.push(rogue.cls)
  f.data.classFeatures.push(...rogue.data.classFeatures)
  f.catalogs = buildClassChoiceFeatureCatalogs(f.data)
  f.authority = { ...f.authority, classes: f.data.classes, catalogs: f.catalogs }
  const saved = chooseOptionalSkill(
    f,
    {
      ...f.character,
      classProgression: [
        ...f.character.classProgression,
        { name: 'Rogue', source: 'PHB', levels: 1 },
      ],
    },
    3,
    'nature',
  )
  const action = getSkillExpertiseChoices(saved, f.authority).actions.nature.find(
    (row) => row.adding,
  )!
  const result = applySkillExpertiseActionCommand(saved, 'nature', action.id, f.authority)
  const expert = characterPersistenceSchema.parse({
    ...saved,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(effective(f, expert).proficiencies.expertise).toContain('nature')
  const off = { ...expert, variantRules: { optionalClassFeatures: false } }
  expect(effective(f, off).proficiencies.expertise).not.toContain('nature')
  expect(off.classChoiceSelections).toEqual(expert.classChoiceSelections)
  const cls = f.data.classes.find((row) => row.name === 'Barbarian' && row.source === 'PHB')!
  const ledger = applyClassGrants(
    { name: cls.name, source: cls.source, startingProficiencies: cls.startingProficiencies },
    undefined,
    off.provenance,
  )
  const independent = resolveProficiencyChoiceCommand(
    off,
    ledger,
    'skills',
    'nature',
    true,
    undefined,
    f.catalogs,
  )
  const preserved = characterPersistenceSchema.parse({
    ...off,
    ...independent.characterPatch,
    provenance: independent.provenanceUpdate,
  })
  expect(effective(f, preserved).proficiencies.expertise).toContain('nature')
})
