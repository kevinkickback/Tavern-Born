import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  getClassChoiceCandidates,
  getClassChoiceDiagnosticCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Feat5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  type knowledgeSources,
  makeKnowledgeFixture,
} from '../fixtures/knowledgeProficiencyFixtures'

test.each([
  ['PHB', 'PHB', 'Knowledge Domain', 1],
  ['PHB', 'PSA', 'Knowledge Domain (PSA)', 1],
  ['XPHB', 'PHB', 'Knowledge Domain', 3],
  ['XPHB', 'PSA', 'Knowledge Domain (PSA)', 3],
  ['XPHB', 'FRHoF', 'Knowledge Domain', 3],
])('actual %s/%s %s owns paired choices at %i', (parent, source, name, level) => {
  const f = makeKnowledgeFixture(parent, source, name)
  expect(f.choices.map((row) => [row.proficiencyDomain, row.maximumSelections, row.level])).toEqual(
    [
      ['expertise', 2, level],
      [source === 'FRHoF' ? 'tools' : 'languages', source === 'FRHoF' ? 1 : 2, level],
    ],
  )
  const choice = f.choices[0]
  expect(
    f.subclass.normalizedRules!.choices.filter((row) => row.kind === 'proficiency'),
  ).toHaveLength(2)
  const result = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    choice,
    [getProficiencyOption('expertise', 'Arcana')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const selected = characterPersistenceSchema.parse({
    ...f.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(selected.proficiencies.skills).toEqual(['arcana'])
  expect(selected.proficiencies.expertise).toEqual(['arcana'])
  for (const domain of ['skills', 'expertise'] as const)
    expect(selected.provenance.proficiencies[domain]?.arcana).toEqual([
      expect.objectContaining({
        sourceType: 'subclass',
        sourceName: name,
        sourceRef: source,
        grantVariant: choice.id,
      }),
    ])
  const lost = refreshClassProficiencyState(selected, f.data.classes, {
    ...f.catalogs,
    classes: [],
  })
  expect(lost.proficiencies.skills).toEqual([])
  expect(lost.proficiencies.expertise).toEqual([])
  expect(lost.classChoiceSelections).toEqual(selected.classChoiceSelections)
  expect(refreshClassProficiencyState(lost, f.data.classes, f.catalogs).proficiencies).toEqual(
    selected.proficiencies,
  )
  const clear = retainSavedFeatureOptionsCommand(selected, selected.provenance, choice.id, [], {
    classes: f.data.classes,
    catalogs: f.catalogs,
  })
  expect(clear.characterPatch.proficiencies?.skills).toEqual([])
  expect(clear.characterPatch.proficiencies?.expertise).toEqual([])
})

test.each([
  'PHB',
  'FRHoF',
])('%s paired skills allow existing proficiency and keep Expertise overlap rules separate', (printing) => {
  const f = makeKnowledgeFixture(printing === 'FRHoF' ? 'XPHB' : 'PHB', printing)
  const authority = { classes: f.data.classes, catalogs: f.catalogs, feats: [] }
  let character = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, skills: ['arcana'], expertise: ['arcana'] },
    provenance: addGrant(
      addGrant(
        f.character.provenance,
        'skills',
        'arcana',
        makeSourceTag('manual', 'User Choice', 'choice'),
      ),
      'expertise',
      'arcana',
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
  const options = resolveClassChoiceOptions(f.choices[0], f.catalogs, [], 3, character)
    .filter((row) => row.availability === 'eligible')
    .map((row) => row.reference.name.toLowerCase())
  expect(options.includes('arcana')).toBe(printing === 'PHB')
  expect(options).toEqual(
    printing === 'PHB'
      ? ['arcana', 'history', 'nature', 'religion']
      : ['history', 'nature', 'religion'],
  )
  // An independent proficiency does not exclude a new paired pick.
  character = {
    ...character,
    proficiencies: { ...character.proficiencies, expertise: [] },
    provenance: {
      ...character.provenance,
      proficiencies: { ...character.provenance.proficiencies, expertise: {} },
    },
  }
  const action = getSkillExpertiseChoices(character, authority).actions.arcana?.find(
    (row) => row.adding,
  )
  expect(action).toBeDefined()
  if (!action) throw new Error('Expected paired Expertise action.')
  const result = applySkillExpertiseActionCommand(character, 'arcana', action.id, authority)
  const selected = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(selected.provenance.proficiencies.skills.arcana).toHaveLength(2)
  const laterOverlap = {
    ...selected,
    provenance: addGrant(
      selected.provenance,
      'expertise',
      'arcana',
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
  const effective = refreshClassProficiencyState(laterOverlap, f.data.classes, f.catalogs)
  expect(effective.provenance.proficiencies.expertise!.arcana).toHaveLength(2)
  const clear = retainSavedFeatureOptionsCommand(
    effective,
    effective.provenance,
    f.choices[0].id,
    [],
    authority,
  )
  expect(clear.characterPatch.proficiencies?.skills).toEqual(['arcana'])
  expect(clear.characterPatch.proficiencies?.expertise).toEqual(['arcana'])
})

test('FRHoF artisan choices use live named members, allow independent proficiency, and suspend only the tool domain', () => {
  const f = makeKnowledgeFixture('XPHB', 'FRHoF')
  const paired = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Nature')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  let character = { ...f.character, ...paired.characterPatch, provenance: paired.provenanceUpdate }
  const tool = f.data.items[0].name.toLowerCase()
  character = {
    ...character,
    proficiencies: { ...character.proficiencies, tools: [tool] },
    provenance: addGrant(
      character.provenance,
      'tools',
      tool,
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
  const options = resolveClassChoiceOptions(f.choices[1], f.catalogs, [], 3, character)
  expect(options.filter((row) => row.availability === 'eligible')).toHaveLength(17)
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    f.choices[1],
    [getProficiencyOption('tools', tool)],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.provenance.proficiencies.tools[tool]).toHaveLength(2)
  const empty = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    proficiencyTools: [],
  })
  expect(empty.proficiencies.skills).toEqual(['nature'])
  expect(empty.proficiencies.expertise).toEqual(['nature'])
  expect(empty.provenance.proficiencies.tools[tool]).toHaveLength(1)
  expect(
    refreshClassProficiencyState(empty, f.data.classes, f.catalogs).provenance.proficiencies.tools[
      tool
    ],
  ).toHaveLength(2)
  const noSkills = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    skills: [],
  })
  expect(noSkills.proficiencies.skills).toEqual([])
  expect(noSkills.proficiencies.expertise).toEqual([])
  expect(noSkills.provenance.proficiencies.tools[tool]).toHaveLength(2)
  for (const invalid of [
    { ...f.data.items[0], items: [] },
    { ...f.data.items[0], type: 'GV' },
    { ...f.data.items[0], type: 'G' },
  ]) {
    const noConcrete = { ...f.catalogs, proficiencyTools: [invalid] }
    expect(
      refreshClassProficiencyState(saved, f.data.classes, noConcrete).provenance.proficiencies
        .tools[tool],
    ).toHaveLength(1)
  }
  const otherPrinting = { ...f.data.items[0], source: 'TST' }
  const oneEquivalent = { ...f.catalogs, proficiencyTools: [otherPrinting] }
  expect(
    refreshClassProficiencyState(saved, f.data.classes, oneEquivalent).provenance.proficiencies
      .tools[tool],
  ).toHaveLength(2)
})

test('strict offline admission rejects either half-pair and wrong domains but admits fully dormant intent', () => {
  const f = makeKnowledgeFixture()
  const result = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Religion')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const saved = characterPersistenceSchema.parse({
    ...f.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  for (const domain of ['skills', 'expertise'] as const) {
    const invalid = structuredClone(saved)
    delete invalid.provenance.proficiencies[domain]!.religion
    expect(characterPersistenceSchema.safeParse(invalid).success).toBe(false)
    const invalidValue = structuredClone(saved)
    invalidValue.proficiencies[domain] = []
    expect(characterPersistenceSchema.safeParse(invalidValue).success).toBe(false)
  }
  const dormant = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    classes: [],
  })
  expect(characterPersistenceSchema.safeParse(dormant).success).toBe(true)
  const wrong = structuredClone(saved)
  wrong.provenance.proficiencies.tools.religion = wrong.provenance.proficiencies.skills.religion
  expect(characterPersistenceSchema.safeParse(wrong).success).toBe(false)
})

test('current canonical parent/root duplicates and normalized quota mutation cannot lend authority', () => {
  const f = makeKnowledgeFixture()
  for (const mutation of ['parent', 'root', 'quota'] as const) {
    const data = structuredClone(f.data)
    const cls = data.classes.find((row) => row.source === 'PHB')!
    const subclass = cls.subclasses!.find((row) => row.source === 'PHB')!
    if (mutation === 'parent') data.classes.push({ ...structuredClone(cls), name: 'CLERIC' })
    if (mutation === 'root')
      cls.subclasses!.push({ ...structuredClone(subclass), name: 'KNOWLEDGE DOMAIN' })
    if (mutation === 'quota') subclass.normalizedRules!.choices[0].maximumSelections = 4
    expect(
      getClassChoiceCandidates(cls, subclass, buildClassChoiceFeatureCatalogs(data)).filter(
        (row) => row.kind === 'proficiency',
      ),
    ).toEqual([])
  }
  const canonical = {
    ...f.character,
    classProgression: f.character.classProgression.map((row) => ({
      ...row,
      name: ' CLERIC ',
      source: ' phb ',
    })),
  }
  expect(
    getSkillExpertiseChoices(canonical, {
      classes: f.data.classes,
      catalogs: f.catalogs,
      feats: [],
    }).remaining,
  ).toBe(2)
})

test('loss of the sole paired foundation removes retained dependent feat Expertise in one idempotent projection', () => {
  const f = makeKnowledgeFixture()
  const feats = (
    JSON.parse(readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8')) as Feat5e[]
  ).filter((row) => row.name === 'Skill Expert' && row.source === 'TCE')
  const catalogs = { ...f.catalogs, featExpertiseFeats: feats }
  const authority = { classes: f.data.classes, catalogs, feats }
  let character = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, skills: ['arcana'] },
    provenance: addGrant(
      f.character.provenance,
      'skills',
      'arcana',
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
  const selected = replaceBonusFeatSelectionsCommand(character, character.provenance, [
    { name: 'Skill Expert', source: 'TCE' },
  ])
  character = { ...character, ...selected.characterPatch, provenance: selected.provenanceUpdate }
  const setup = commitFeatOptionsCommand(
    character,
    character.provenance,
    { name: 'Skill Expert', source: 'TCE', selectionKind: 'bonus' },
    { skills: ['History'], expertiseSkill: 'Arcana' },
  )
  character = { ...character, ...setup.characterPatch, provenance: setup.provenanceUpdate }
  const paired = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Arcana')],
    authority,
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...paired.characterPatch,
    provenance: paired.provenanceUpdate,
  })
  expect(character.provenance.proficiencies.expertise!.arcana).toHaveLength(2)
  const sole = {
    ...character,
    provenance: {
      ...character.provenance,
      proficiencies: {
        ...character.provenance.proficiencies,
        skills: {
          ...character.provenance.proficiencies.skills,
          arcana: character.provenance.proficiencies.skills.arcana.filter(
            (tag) => tag.sourceType !== 'manual',
          ),
        },
      },
    },
  }
  const valid = refreshClassProficiencyState(sole, f.data.classes, catalogs)
  expect(valid.provenance.proficiencies.expertise!.arcana).toHaveLength(2)
  const missing = refreshClassProficiencyState(valid, f.data.classes, { ...catalogs, classes: [] })
  expect(missing.proficiencies.skills).toEqual(['history'])
  expect(missing.proficiencies.expertise).toEqual([])
  expect(missing.specialFeats![0].options?.expertiseSkill).toBe('Arcana')
  expect(missing.classChoiceSelections).toEqual(valid.classChoiceSelections)
  const restored = refreshClassProficiencyState(missing, f.data.classes, catalogs)
  expect(restored.provenance.proficiencies.expertise!.arcana).toHaveLength(2)
  expect(refreshClassProficiencyState(restored, f.data.classes, catalogs)).toBe(restored)
  const clear = retainSavedFeatureOptionsCommand(
    valid,
    valid.provenance,
    f.choices[0].id,
    [],
    authority,
  )
  expect(clear.characterPatch.proficiencies?.expertise).toEqual([])
  expect(clear.characterPatch.proficiencies?.skills).toEqual(['history'])
  const sourceFreeClear = retainSavedFeatureOptionsCommand(
    valid,
    valid.provenance,
    f.choices[0].id,
    [],
  )
  expect(sourceFreeClear.characterPatch.proficiencies?.expertise).toEqual([])
  expect(sourceFreeClear.provenanceUpdate.proficiencies.expertise?.arcana).toBeUndefined()
  for (const nextProgression of [
    [],
    valid.classProgression.map((row) => ({ ...row, subclass: 'Other', subclassSource: 'TST' })),
    valid.classProgression.map((row) => ({ ...row, levels: 0 })),
  ]) {
    const removed = applyClassProgressionUpdate(valid, valid.provenance, nextProgression)
    expect(removed.characterPatch.proficiencies?.expertise).toEqual([])
    expect(removed.characterPatch.classChoiceSelections).toEqual([])
    expect(removed.provenanceUpdate.proficiencies.expertise?.arcana).toBeUndefined()
  }
})

test.each([
  'shortName',
  'name',
])('canonical raw base duplication through %s suspends its copied owner', (field) => {
  const f = makeKnowledgeFixture('XPHB', 'PHB', 'Knowledge Domain', (doc) =>
    doc.subclass.push({
      ...structuredClone(doc.subclass[0]),
      [field]: field === 'name' ? 'KNOWLEDGE DOMAIN' : 'Other',
    }),
  )
  expect(f.choices).toEqual([])
})

test.each([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
])('a current explicit %s conflict cannot override the original UID', (field) => {
  const f = makeKnowledgeFixture()
  Object.assign(f.subclass.subclassFeatureRefs![0], { [field]: field === 'level' ? 4 : 'Other' })
  expect(
    getClassChoiceCandidates(f.cls, f.subclass, buildClassChoiceFeatureCatalogs(f.data)).filter(
      (row) => row.kind === 'proficiency',
    ),
  ).toEqual([])
})

test('unconfigured unavailable Knowledge blocks setup, and a saved recovery replaces the same exact-owner source warning', () => {
  const changed = makeKnowledgeFixture('PHB', 'PHB', 'Knowledge Domain', (doc) => {
    doc.subclass[0].eligibility = 'Only at night'
  })
  expect(changed.choices).toEqual([])
  const diagnostics = getClassChoiceDiagnosticCandidates(
    changed.cls,
    changed.subclass,
    changed.catalogs,
  )
  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]).toMatchObject({
    code: 'unverified-required-choice',
    subclassName: 'Knowledge Domain',
    subclassSource: 'PHB',
    level: 1,
    requiredChoice: {
      target: { entityType: 'subclassFeature', ref: 'Blessings of Knowledge|Cleric||Knowledge||1' },
    },
  })
  expect(changed.subclass.normalizedRules!.choiceDiagnostics).toEqual(diagnostics)
  const f = makeKnowledgeFixture()
  const selected = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Arcana')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const saved = {
    ...f.character,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
  }
  f.subclass.subclassFeatureRefs = []
  const catalogs = { ...f.catalogs, ...buildClassChoiceFeatureCatalogs(f.data) }
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const issues = validateClassChoices(
    saved,
    createCharacterCalculationContext(saved, input),
    catalogs,
  ).filter((issue) => issue.title.includes('Blessings of Knowledge'))
  expect(issues).toHaveLength(1)
  expect(issues[0].title).toBe('Restore or remove Blessings of Knowledge expertise')
  expect(issues[0].navigationTarget).toContain(encodeURIComponent(f.choices[0].id))
})

test.each([
  'expertise',
  'languages',
] as const)('source-free %s recovery removes intent without activating any suspended sibling', (domain) => {
  const f = makeKnowledgeFixture()
  const pair = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Arcana')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const partial = { ...f.character, ...pair.characterPatch, provenance: pair.provenanceUpdate }
  const language = applyClassChoiceSelectionWithGrantsCommand(
    partial,
    partial.provenance,
    f.choices[1],
    [getProficiencyOption('languages', 'Elvish')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const saved = { ...partial, ...language.characterPatch, provenance: language.provenanceUpdate }
  const suspended = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    classes: [],
  })
  const selected = suspended.classChoiceSelections!.find(
    (row) => row.choiceId === f.choices.find((choice) => choice.proficiencyDomain === domain)!.id,
  )!
  const clear = retainSavedFeatureOptionsCommand(
    suspended,
    suspended.provenance,
    selected.choiceId,
    [],
  )
  expect(clear.characterPatch.proficiencies?.skills).toEqual([])
  expect(clear.characterPatch.proficiencies?.expertise).toEqual([])
  expect(clear.characterPatch.proficiencies?.languages).toEqual([])
  const remaining = characterPersistenceSchema.parse({
    ...suspended,
    ...clear.characterPatch,
    provenance: clear.provenanceUpdate,
  })
  expect(remaining.classChoiceSelections).toHaveLength(1)
  const restored = refreshClassProficiencyState(remaining, f.data.classes, f.catalogs)
  expect(restored.proficiencies.skills).toEqual(domain === 'languages' ? ['arcana'] : [])
  expect(restored.proficiencies.languages).toEqual(domain === 'expertise' ? ['elvish'] : [])
})

test.each([
  'PHB',
  'FRHoF',
])('source-free %s progression preserves suspended survivors without replay, then exact source restoration reactivates only earned intent', (printing) => {
  const f = makeKnowledgeFixture(printing === 'PHB' ? 'PHB' : 'XPHB', printing)
  const pair = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Arcana')],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const partial = { ...f.character, ...pair.characterPatch, provenance: pair.provenanceUpdate }
  const sibling = applyClassChoiceSelectionWithGrantsCommand(
    partial,
    partial.provenance,
    f.choices[1],
    printing === 'PHB'
      ? [getProficiencyOption('languages', 'Elvish')]
      : [getProficiencyOption('tools', f.data.items[0].name)],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  const saved = { ...partial, ...sibling.characterPatch, provenance: sibling.provenanceUpdate }
  const suspended = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    classes: [],
  })
  const progression =
    printing === 'PHB'
      ? suspended.classProgression.map((row) => ({ ...row, levels: 2 }))
      : suspended.classProgression
  const result = applyClassProgressionUpdate(suspended, suspended.provenance, progression)
  expect(result.characterPatch.proficiencies?.skills).toEqual([])
  expect(result.characterPatch.proficiencies?.expertise).toEqual([])
  expect(result.characterPatch.proficiencies?.languages).toEqual([])
  expect(result.characterPatch.proficiencies?.tools).toEqual([])
  const updated = characterPersistenceSchema.parse({
    ...suspended,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(updated.classChoiceSelections).toEqual(suspended.classChoiceSelections)
  expect(refreshClassProficiencyState(updated, f.data.classes, f.catalogs).proficiencies).toEqual(
    saved.proficiencies,
  )
})

test('raw duplicate roots, leaf records, ancestors and copy bases cannot be hidden by first-match lookup', () => {
  for (const change of [
    (doc: typeof knowledgeSources.document) => doc.subclass.push(structuredClone(doc.subclass[0])),
    (doc: typeof knowledgeSources.document) =>
      doc.subclass.push({ ...structuredClone(doc.subclass[0]), shortName: 'Other' }),
    (doc: typeof knowledgeSources.document) =>
      doc.subclassFeature.push(structuredClone(doc.subclassFeature[1])),
    (doc: typeof knowledgeSources.document) =>
      doc.subclassFeature.push({
        ...structuredClone(doc.subclassFeature[1]),
        entries: ['Only at night.'],
      }),
    (doc: typeof knowledgeSources.document) => {
      doc.subclass[0].subclassFeatures = []
    },
    (doc: typeof knowledgeSources.document) => {
      doc.subclass[0].eligibility = { minimumLevel: 10 }
    },
  ]) {
    const f = makeKnowledgeFixture('PHB', 'PHB', 'Knowledge Domain', change)
    expect(f.choices).toEqual([])
  }
  expect(() =>
    makeKnowledgeFixture('PHB', 'PHB', 'Knowledge Domain', (doc) =>
      doc.subclassFeature.push(structuredClone(doc.subclassFeature[0])),
    ),
  ).toThrow(/ambiguous subclass-feature parent/)
  const f = makeKnowledgeFixture()
  f.cls.subclasses!.push(structuredClone(f.subclass))
  expect(
    getClassChoiceCandidates(f.cls, f.subclass, buildClassChoiceFeatureCatalogs(f.data)).filter(
      (row) => row.kind === 'proficiency',
    ),
  ).toEqual([])
})
