import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { calculateSkillModifier } from '@/lib/calculations/skills'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  getClassChoiceDiagnosticCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelectionGrants,
  reconcileClassChoiceSelections,
} from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { removeManualExpertiseCommand } from '@/lib/character/commands/expertiseCommands'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  resolveProficiencyChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { withoutSheetDescriptions } from '@/lib/pdf/characterSheetViewModel'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Feat5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { cannySource, makeCannyFixture, selectCanny } from '../fixtures/cannyFixtures'
import { manualExpertiseFixtureGrant } from '../fixtures/manualProficiency'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

type Fixture = ReturnType<typeof makeCannyFixture>
const authority = (f: Fixture) => ({ classes: f.data.classes, catalogs: f.catalogs })
const input = (f: Fixture) => ({
  ...f.data.lookups!,
  featExpertiseFeats: f.data.feats,
  classChoiceClasses: f.data.classes,
  classChoiceFeatureCatalogs: f.catalogs,
})
function provideSkillExpert(f: Fixture) {
  f.data.feats = (
    JSON.parse(readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8')) as Feat5e[]
  ).filter((feat) => feat.name === 'Skill Expert' && feat.source === 'TCE')
  f.data.lookups = buildGameDataLookups(f.data)
  f.catalogs.featExpertiseFeats = f.data.feats
}
const configured = (f: Fixture) =>
  selectCanny(f, 'languages', ['Elvish', 'Dwarvish'], selectCanny(f, 'expertise', ['Survival']))
const effective = (character: Character, f: Fixture) =>
  refreshClassProficiencyState(character, f.data.classes, f.catalogs)
const issues = (character: Character, f: Fixture) =>
  validateClassChoices(
    character,
    createCharacterCalculationContext(character, input(f)),
    f.catalogs,
  ).filter((row) => /Canny|Deft Explorer/.test(row.title))

test('real source declaration produces independent requirements and commands strictly reopen without granting base skills', () => {
  const f = makeCannyFixture()
  expect(f.choices.map((row) => [row.proficiencyDomain, row.minimumSelections, row.level])).toEqual(
    [
      ['expertise', 1, 1],
      ['languages', 2, 1],
    ],
  )
  expect(issues(f.character, f)).toHaveLength(2)
  const saved = configured(f)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
  expect(reopened.proficiencies.skills).toEqual(f.character.proficiencies.skills)
  expect(reopened.proficiencies.expertise).toEqual(['survival'])
  expect([...reopened.proficiencies.languages].sort()).toEqual(['dwarvish', 'elvish'])
  expect(issues(reopened, f)).toEqual([])
  expect(
    Object.values(reopened.provenance!.proficiencies.skills)
      .flat()
      .some((tag) => tag.grantVariant?.startsWith('feature-proficiencies:')),
  ).toBe(false)
  expect(effective(reopened, f)).toBe(reopened)
  const noop = applyClassChoiceSelectionWithGrantsCommand(
    reopened,
    reopened.provenance!,
    f.choices[0],
    [getProficiencyOption('expertise', 'Survival')],
    authority(f),
  )
  expect(noop.characterPatch).toEqual({})
  expect(noop.provenanceUpdate).toBe(reopened.provenance)
})

test('Canny rejects missing skill and new known languages, canonical duplicates and excess choices at command boundary', () => {
  const f = makeCannyFixture()
  expect(() => selectCanny(f, 'expertise', ['Arcana'])).toThrow(/eligibility/)
  const known = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, languages: ['elvish'] },
  }
  expect(() => selectCanny(f, 'languages', ['Elvish', 'Dwarvish'], known)).toThrow(/eligibility/)
  expect(() => selectCanny(f, 'languages', ['Elvish', ' elvish '])).toThrow()
  expect(() => selectCanny(f, 'languages', ['Elvish', 'Dwarvish', 'Giant'])).toThrow()
  expect(resolveClassChoiceOptions(f.choices[0], f.catalogs, [], 1)).toEqual([])
})

test('source and vocabulary loss suspends only owned benefits, preserves exact bytes and restores idempotently', () => {
  const f = makeCannyFixture(),
    saved = configured(f),
    bytes = JSON.stringify(saved)
  const missing = {
    ...f,
    catalogs: { ...f.catalogs, classFeatures: [], classFeatureCandidates: new Map() },
  }
  const absent = effective(saved, missing)
  expect(absent.proficiencies.expertise).toEqual([])
  expect(absent.proficiencies.languages).toEqual([])
  expect(absent.provenance!.proficiencies.expertise).toEqual({})
  expect(JSON.stringify(saved)).toBe(bytes)
  expect(effective(saved, f)).toBe(saved)
  const restored = effective(absent, f)
  expect(restored.proficiencies).toEqual(saved.proficiencies)
  expect(effective(restored, f)).toBe(restored)
  expect(
    issues(saved, missing).map(({ id, title, navigationTarget }) => ({
      id,
      title,
      navigationTarget,
    })),
  ).toEqual([
    {
      id:
        'optional-class-adoption:v1:' +
        encodeURIComponent(
          JSON.stringify([
            ['class', 'ranger', 'phb'],
            'class-feature|deft explorer|ranger|phb|1|tce',
            1,
          ]),
        ),
      title: 'Restore or clear Deft Explorer',
      navigationTarget: '/build/class?class=Ranger%7CPHB&level=1',
    },
  ])
  expect(
    effective(saved, { ...f, catalogs: { ...f.catalogs, languages: [] } }).proficiencies.languages,
  ).toEqual([])
  expect(
    effective(saved, { ...f, catalogs: { ...f.catalogs, skills: [] } }).proficiencies.expertise,
  ).toEqual([])
})

test('underlying skill loss retains intent and restores only Canny expertise from explicit selection', () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const noSkill = {
    ...saved,
    proficiencies: {
      ...saved.proficiencies,
      skills: saved.proficiencies.skills.filter((name) => name !== 'survival'),
    },
  }
  const absent = effective(noSkill, f)
  expect(absent.proficiencies.expertise).toEqual([])
  expect(absent.proficiencies.languages).toEqual(saved.proficiencies.languages)
  expect(absent.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(issues(absent, f).map((row) => row.title)).toEqual(['Finish Canny expertise'])
  const restored = effective(
    { ...absent, proficiencies: { ...absent.proficiencies, skills: saved.proficiencies.skills } },
    f,
  )
  expect(restored.proficiencies.expertise).toEqual(['survival'])
})

test('real base-skill removal and restoration suspend and restore Canny without self-support', () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const remove = resolveProficiencyChoiceCommand(
    saved,
    saved.provenance!,
    'skills',
    'survival',
    false,
  )
  const absent = { ...saved, ...remove.characterPatch, provenance: remove.provenanceUpdate }
  expect(effective(absent, f).proficiencies.expertise).toEqual([])
  expect(absent.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(characterPersistenceSchema.safeParse(absent).success).toBe(true)
  const add = resolveProficiencyChoiceCommand(absent, absent.provenance, 'skills', 'survival', true)
  const restored = { ...absent, ...add.characterPatch, provenance: add.provenanceUpdate }
  expect(effective(restored, f).proficiencies.expertise).toEqual(['survival'])
})

test('production class removal retracts Canny and expired expertise while independent language survives', () => {
  const f = makeCannyFixture()
  const manual = manualExpertiseFixtureGrant(f.character, f.character.provenance!, 'survival')
  const saved = configured({
    ...f,
    character: { ...f.character, ...manual.characterPatch, provenance: manual.provenanceUpdate },
  })
  const provenance = addGrant(
    saved.provenance!,
    'languages',
    'elvish',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  const removed = applyClassProgressionUpdate({ ...saved, provenance }, provenance, [])
  expect(removed.characterPatch.classChoiceSelections).toEqual([])
  expect(removed.characterPatch.proficiencies?.languages).toEqual(['elvish'])
  // Removal of the sole class also removes the underlying class skill, so its manual expertise expires.
  expect(removed.characterPatch.proficiencies?.expertise).toEqual([])
  expect(Object.values(removed.provenanceUpdate.proficiencies.expertise ?? {}).flat()).toEqual([])
  expect(
    characterPersistenceSchema.safeParse({
      ...saved,
      ...removed.characterPatch,
      provenance: removed.provenanceUpdate,
    }).success,
  ).toBe(true)
})

test('semantic language identities deduplicate printings and retain existing source overlap', () => {
  const f = makeCannyFixture()
  const catalogs = {
    ...f.catalogs,
    languages: [...f.catalogs.languages!, { name: ' ELVISH ', source: 'XPHB' }],
  }
  const choice = f.choices.find((row) => row.proficiencyDomain === 'languages')!
  const options = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    [],
    1,
    f.character,
  )
  expect(
    options.filter((row) => row.reference.name.trim().toLowerCase() === 'elvish'),
  ).toHaveLength(1)
  expect(options.find((row) => row.reference.name === 'Elvish')!.reference.source).toBeUndefined()
  const saved = configured(f)
  const provenance = addGrant(
    saved.provenance!,
    'languages',
    'elvish',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  const overlap = { ...saved, provenance }
  expect(issues(overlap, f)).toEqual([])
  expect(effective(overlap, f).proficiencies.languages).toEqual(saved.proficiencies.languages)
})

test('live authority replaces forged counts and domains and rejects a forged granting owner', () => {
  const f = makeCannyFixture(),
    choice = f.choices[0]
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      f.character,
      f.character.provenance!,
      { ...choice, minimumSelections: 10, maximumSelections: 10, proficiencyDomain: 'languages' },
      [getProficiencyOption('languages', 'Elvish')],
      authority(f),
    ),
  ).toThrow(/eligibility/)
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      f.character,
      f.character.provenance!,
      { ...choice, maximumSelections: 10 },
      [getProficiencyOption('expertise', 'Survival'), getProficiencyOption('expertise', 'Nature')],
      authority(f),
    ),
  ).toThrow()
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      f.character,
      f.character.provenance!,
      { ...choice, owner: { ...choice.owner, source: 'XPHB' } },
      [getProficiencyOption('expertise', 'Survival')],
      authority(f),
    ),
  ).toThrow(/source rules/)
})

test.each([
  false,
  true,
])('nested declaration honors enclosing gain and ignores unselected options %s', (options) => {
  const f = makeCannyFixture(3, (doc) => {
    const cls = doc.class.find((row) => row.source === 'PHB')!
    cls.classFeatures = (cls.classFeatures as string[]).filter(
      (ref) =>
        getClassFeatureIdentity(
          decodeClassFeatureReference(
            typeof ref === 'string' ? ref : (ref as { classFeature: string }).classFeature,
          ),
        ) !== 'class-feature|deft explorer|ranger|phb|1|tce',
    )
    ;(cls.classFeatures as string[]).push('Canny Wrapper|Ranger|PHB|3|PHB')
    // Retained nested references need their resolved body, just like the existing declaration walker.
    const entry = {
      type: 'refClassFeature',
      classFeature: 'Deft Explorer|Ranger|PHB|1|TCE',
      feature: structuredClone(cannySource),
    }
    doc.classFeature.push({
      name: 'Canny Wrapper',
      className: 'Ranger',
      classSource: 'PHB',
      source: 'PHB',
      level: 3,
      entries: options ? [{ type: 'options', entries: [entry] }] : [entry],
    })
  })
  const candidates = getClassChoiceCandidates(f.classData, undefined, f.catalogs).filter(
    (choice) => choice.kind === 'proficiency',
  )
  expect(candidates.map((choice) => choice.level)).toEqual(options ? [] : [3, 3])
  expect(f.choices).toEqual([])
  expect(createOptionalClassFeatureActivity(f.character, f.catalogs).states[0].state).toBe(
    'unavailable',
  )
  expect(effective(f.character, f).proficiencies.expertise).toEqual([])
  const native = f.character.optionalClassFeatureAdoptions![0]
  expect(() =>
    setOptionalClassAdoptionCommand(
      { ...f.character, optionalClassFeatureAdoptions: [] },
      f.character.provenance!,
      f.catalogs,
      { ...native, earnedLevel: 3 },
      true,
      [],
    ),
  ).toThrow(/Invalid optional/)
  expect(JSON.stringify(f.character.optionalClassFeatureAdoptions)).toBe(JSON.stringify([native]))
})

test('already doubled skill stays x2; removing manual overlap frees its owner while Canny survives', () => {
  const f = makeCannyFixture()
  const manual = manualExpertiseFixtureGrant(f.character, f.character.provenance!, 'survival')
  const before = { ...f.character, ...manual.characterPatch, provenance: manual.provenanceUpdate }
  const saved = selectCanny(f, 'expertise', ['Survival'], before)
  expect(
    calculateSkillModifier(2, 2, true, saved.proficiencies.expertise.includes('survival')),
  ).toBe(6)
  expect(saved.provenance!.proficiencies.expertise!.survival).toHaveLength(2)
  const remove = removeManualExpertiseCommand(saved, saved.provenance!, 'survival')
  const after = { ...saved, ...remove.characterPatch, provenance: remove.provenanceUpdate }
  expect(after.proficiencies.expertise).toEqual(['survival'])
  expect(after.provenance!.proficiencies.expertise!.survival.map((tag) => tag.sourceType)).toEqual([
    'class',
  ])
  const cleared = selectCanny(f, 'expertise', [], after)
  expect(cleared.proficiencies.expertise).toEqual([])
})

test('clear one domain preserves sibling and independent expertise and language owners', () => {
  const f = makeCannyFixture(),
    saved = selectCanny(f, 'languages', ['Elvish', 'Dwarvish'])
  provideSkillExpert(f)
  const feat = replaceBonusFeatSelectionsCommand(saved, saved.provenance!, [
    { name: 'Skill Expert', source: 'TCE' },
  ])
  const selectedFeat = { ...saved, ...feat.characterPatch, provenance: feat.provenanceUpdate }
  const setup = commitFeatOptionsCommand(
    selectedFeat,
    selectedFeat.provenance,
    { name: 'Skill Expert', source: 'TCE', selectionKind: 'bonus' },
    { expertiseSkill: 'Survival' },
  )
  const provenance = addGrant(
    setup.provenanceUpdate,
    'languages',
    'elvish',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  const overlap = selectCanny(f, 'expertise', ['Survival'], {
    ...selectedFeat,
    ...setup.characterPatch,
    provenance,
  })
  expect(issues(overlap, f)).toEqual([])
  expect(effective(overlap, f).proficiencies.languages).toEqual(overlap.proficiencies.languages)
  const cleared = selectCanny(f, 'languages', [], selectCanny(f, 'expertise', [], overlap))
  expect(cleared.proficiencies.expertise).toEqual(['survival'])
  expect(cleared.proficiencies.languages).toEqual(['elvish'])
  expect(cleared.provenance!.proficiencies.languages.elvish[0].sourceType).toBe('manual')
})

test('clearing a configured normalized class feat preserves independent Canny ownership and its sibling domain', () => {
  const f = makeCannyFixture(),
    saved = selectCanny(f, 'languages', ['Elvish', 'Dwarvish'])
  provideSkillExpert(f)
  const choice: NormalizedCharacterChoice = {
    id: 'class:ranger|phb|choice:bonus-feat|1',
    label: 'Bonus Feat',
    kind: 'feat',
    owner: { type: 'class', name: 'Ranger', source: 'PHB' },
    level: 1,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, () => 1),
    options: [],
    optionFilter: { entityType: 'feat' },
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: 'entries' },
  }
  const selected = applyClassChoiceSelectionWithGrantsCommand(saved, saved.provenance!, choice, [
    { entityType: 'feat', name: 'Skill Expert', source: 'TCE' },
  ])
  const withFeat = { ...saved, ...selected.characterPatch, provenance: selected.provenanceUpdate }
  const setup = commitFeatOptionsCommand(
    withFeat,
    withFeat.provenance,
    { name: 'Skill Expert', source: 'TCE', classFeatChoiceId: choice.id },
    { expertiseSkill: 'Survival' },
  )
  const overlap = selectCanny(f, 'expertise', ['Survival'], {
    ...withFeat,
    ...setup.characterPatch,
    provenance: setup.provenanceUpdate,
  })
  expect(overlap.provenance.proficiencies.expertise!.survival).toHaveLength(2)
  const clear = applyClassChoiceSelectionWithGrantsCommand(overlap, overlap.provenance, choice, [])
  const after = { ...overlap, ...clear.characterPatch, provenance: clear.provenanceUpdate }
  expect(after.proficiencies.expertise).toEqual(['survival'])
  expect(after.provenance.proficiencies.expertise!.survival.map((tag) => tag.sourceType)).toEqual([
    'class',
  ])
  expect(after.proficiencies.languages).toEqual(saved.proficiencies.languages)
  expect(characterPersistenceSchema.safeParse(after).success).toBe(true)
  expect(selectCanny(f, 'expertise', [], after).proficiencies.expertise).toEqual([])
})

test('untracked expertise is captured only at real first-add boundary, never from stripped Canny', () => {
  const f = makeCannyFixture()
  const untracked = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, expertise: ['survival'] },
  }
  const saved = selectCanny(f, 'expertise', ['Survival'], untracked)
  expect(saved.provenance!.proficiencies.expertise!.survival.map((tag) => tag.sourceType)).toEqual([
    'manual',
    'class',
  ])
  expect(selectCanny(f, 'expertise', [], saved).proficiencies.expertise).toEqual(['survival'])
  const sole = selectCanny(f, 'expertise', ['Survival'])
  const absent = effective(sole, {
    ...f,
    catalogs: { ...f.catalogs, classFeatures: [], classFeatureCandidates: new Map() },
  })
  expect(absent.proficiencies.expertise).toEqual([])
  expect(absent.provenance!.proficiencies.expertise).toEqual({})
})

test.each([
  false,
  true,
])('requested optional toggle with full current catalogs preserves intent and independent Expertise=%s', (independent) => {
  const f = makeCannyFixture()
  let saved: Character = selectCanny(f, 'expertise', ['survival'])
  if (independent)
    saved = {
      ...saved,
      provenance: addGrant(
        saved.provenance,
        'expertise',
        'survival',
        makeSourceTag('background', 'Independent', 'fixed', 'PHB'),
      ),
    }
  const current = { ...f.catalogs, classes: f.data.classes }
  const inputs = {
    availableClasses: f.data.classes,
    allClasses: f.data.classes,
    classChoiceFeatureCatalogs: current,
  }
  const toggle = (before: Character, includeVariants: boolean, available = current) => {
    const result = reconcileOptionalClassFeatureChoicesCommand(
      before,
      before.provenance,
      { ...inputs, classChoiceFeatureCatalogs: available },
      includeVariants,
    )
    return characterPersistenceSchema.parse({
      ...before,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
      variantRules: { ...before.variantRules, optionalClassFeatures: includeVariants },
    })
  }
  const dormant = toggle(saved, false)
  expect(dormant.proficiencies.skills).toEqual(saved.proficiencies.skills)
  expect(dormant.proficiencies.expertise).toEqual(independent ? ['survival'] : [])
  expect(dormant.classChoiceSelections![0]).toMatchObject({
    selected: saved.classChoiceSelections![0].selected,
    inactive: true,
  })
  const absent = toggle(dormant, true, {
    ...current,
    classFeatures: [],
    classFeatureCandidates: new Map(),
  })
  expect(absent.proficiencies.expertise).toEqual(independent ? ['survival'] : [])
  const restored = toggle(absent, true)
  expect(restored.proficiencies).toEqual(saved.proficiencies)
  expect(restored.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(restored.provenance.proficiencies.expertise!.survival).toHaveLength(independent ? 2 : 1)
})
test('optional toggles preserve dormant intent and class/level removal retracts owned grants atomically', () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const catalogs = {
    availableClasses: f.data.classes,
    allClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const off = reconcileOptionalClassFeatureChoicesCommand(saved, saved.provenance!, catalogs, false)
  const dormant = {
    ...saved,
    ...off.characterPatch,
    provenance: off.provenanceUpdate,
    variantRules: { ...saved.variantRules, optionalClassFeatures: false },
  }
  expect(dormant.proficiencies.expertise).toEqual([])
  expect(dormant.proficiencies.languages).toEqual([])
  expect(dormant.classChoiceSelections!.every((selection) => selection.inactive)).toBe(true)
  const on = reconcileOptionalClassFeatureChoicesCommand(
    dormant,
    dormant.provenance!,
    catalogs,
    true,
  )
  expect(on.characterPatch.proficiencies).toEqual(saved.proficiencies)
  const selections = reconcileClassChoiceSelections(saved.classChoiceSelections, [])
  const removed = reconcileClassChoiceSelectionGrants(saved, saved.provenance!, selections)
  expect(removed.proficiencies.expertise).toEqual([])
  expect(removed.proficiencies.languages).toEqual([])
})

test.each([
  'name',
  'className',
  'classSource',
  'source',
  'level',
] as const)('each explicit target %s conflict blocks stale confirmation and effective benefits', (field) => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const candidates = f.data.classFeatures.map((feature) =>
    feature.source === 'TCE' && feature.name === 'Deft Explorer'
      ? { ...feature, [field]: field === 'level' ? 2 : 'Conflicting' }
      : feature,
  )
  const catalogs = { ...f.catalogs, classFeatures: candidates, classFeatureCandidates: undefined }
  expect(
    getClassChoiceCandidates(f.classData, undefined, catalogs).filter(
      (choice) => choice.kind === 'proficiency',
    ),
  ).toEqual([])
  expect(
    refreshClassProficiencyState(saved, f.data.classes, catalogs).proficiencies.expertise,
  ).toEqual([])
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance!,
      f.choices[0],
      [getProficiencyOption('expertise', 'Perception')],
      { classes: f.data.classes, catalogs },
    ),
  ).toThrow(/source rules/)
})

test('ambiguous, changed or option-only declarations stay unverified and cannot create new Canny choices', () => {
  for (const mode of ['duplicate', 'body', 'shape', 'declaration', 'options']) {
    const f = makeCannyFixture(1, (doc) => {
      const source = doc.classFeature.find(
        (row) => row.source === 'TCE' && row.name === 'Deft Explorer',
      )!
      if (mode === 'duplicate') doc.classFeature.push(structuredClone(source))
      if (mode === 'body') source.entries = [...(source.entries ?? []), 'Only outdoors.']
      if (mode === 'shape') (source as Record<string, unknown>).prerequisite = [{ level: 20 }]
      const cls = doc.class.find((row) => row.source === 'PHB')!
      if (mode === 'declaration')
        (cls.classFeatures as string[]).push('Deft Explorer|Ranger|PHB|1|TCE')
      if (mode === 'options')
        cls.classFeatures = (cls.classFeatures as string[]).filter(
          (ref) => ref !== 'Deft Explorer|Ranger||1|TCE',
        )
    })
    expect(f.choices, mode).toEqual([])
    if (mode !== 'options')
      expect(
        getClassChoiceDiagnosticCandidates(f.classData, undefined, f.catalogs).some(
          (diag) => diag.featureName === 'Deft Explorer',
        ),
        mode,
      ).toBe(true)
  }
})

test('offline admission rejects forged applied tags and relations but admits unavailable saved intent', () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const mutations: Array<(c: Character) => void> = [
    (c) => {
      c.classChoiceSelections![0].classSource = 'XPHB'
    },
    (c) => {
      c.classChoiceSelections![0].selected[0].slotLevel = 2
    },
    (c) => {
      c.classChoiceSelections![0].selected[0].source = 'TCE'
    },
    (c) => {
      c.classChoiceSelections![0].selected[0].name = 'Arcana'
    },
    (c) => {
      c.classChoiceSelections!.push(structuredClone(c.classChoiceSelections![0]))
    },
    (c) => {
      c.provenance!.proficiencies.skills.survival = [
        ...c.provenance!.proficiencies.expertise!.survival,
      ]
    },
    (c) => {
      c.provenance!.proficiencies.expertise!.survival[0].sourceName = 'Other'
    },
    (c) => {
      c.proficiencies.expertise = []
    },
    (c) => {
      c.classChoiceSelections = []
    },
  ]
  for (const mutate of mutations) {
    const invalid = structuredClone(saved)
    mutate(invalid)
    expect(characterPersistenceSchema.safeParse(invalid).success).toBe(false)
  }
  const intent = {
    ...saved,
    proficiencies: { ...saved.proficiencies, expertise: [], languages: [] },
    provenance: {
      ...saved.provenance!,
      proficiencies: { ...saved.provenance!.proficiencies, expertise: {}, languages: {} },
    },
  }
  expect(characterPersistenceSchema.safeParse(intent).success).toBe(true)
})

test('real PDF view model mechanical fields use effective proficiencies with descriptions enabled or omitted', () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const vm = createCurrentCharacterSheetViewModel(saved, input(f))
  expect(vm.character.proficiencies.expertise).toEqual(['survival'])
  expect(vm.character.proficiencies.languages).toEqual(saved.proficiencies.languages)
  const absent = {
    ...input(f),
    classChoiceFeatureCatalogs: {
      ...f.catalogs,
      classFeatures: [],
      classFeatureCandidates: new Map(),
    },
  }
  const missing = createCurrentCharacterSheetViewModel(saved, absent)
  expect(missing.character.proficiencies.expertise).toEqual([])
  expect(withoutSheetDescriptions(missing).character.proficiencies.languages).toEqual([])
})

test.skipIf(!existsSync('data/class/class-ranger.json'))(
  'committed exact source snapshot matches actual configured TCE producer',
  () => {
    const document = JSON.parse(readFileSync('data/class/class-ranger.json', 'utf8'))
    expect(
      document.classFeature.find(
        (feature: Record<string, unknown>) =>
          feature.name === 'Deft Explorer' && feature.source === 'TCE' && feature.level === 1,
      ),
    ).toEqual(cannySource)
  },
)
