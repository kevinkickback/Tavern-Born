// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import {
  decodeFavoredEnemyChoiceId,
  FAVORED_ENEMY_GRANTS,
  FAVORED_ENEMY_TARGET,
  favoredEnemyOption,
} from '@/lib/5etools/favoredEnemyIdentity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { projectOwnedProficiencies } from '@/lib/character/classProficiencyFoundation'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelections,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import { getFavoredEnemyAuthority } from '@/lib/character/favoredEnemyAuthority'
import {
  getFavoredEnemySelectionStates,
  isFavoredEnemySetupComplete,
} from '@/lib/character/favoredEnemySelections'
import {
  getFeatureOptionSelectionStates,
  summarizeFeatureOptionSelectionGroups,
} from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalClassAdoptionKey } from '@/lib/character/optionalClassFeatureIdentity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { withoutSheetDescriptions } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeFavoredEnemyFixture, selectFavoredEnemy } from '../fixtures/favoredEnemyFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

const states = (c: Character, f: ReturnType<typeof makeFavoredEnemyFixture>) =>
  getFavoredEnemySelectionStates(c, f.data.classes, f.catalogs)
const clear = (
  c: Character,
  f: ReturnType<typeof makeFavoredEnemyFixture>,
  id = c.classChoiceSelections![0].choiceId,
) => {
  const r = retainSavedFeatureOptionsCommand(c, c.provenance, id, [], {
    classes: f.data.classes,
    catalogs: f.catalogs,
  })
  return characterPersistenceSchema.parse({
    ...c,
    ...r.characterPatch,
    provenance: r.provenanceUpdate,
  })
}

test('actual source gains, source-derived type vocabulary and XPHB separation', () => {
  const f = makeFavoredEnemyFixture()
  expect(f.choices.map((c) => c.level)).toEqual([1, 6, 14])
  expect(f.choices[0].options.map((o) => o.name)).toEqual([
    'aberration',
    'beast',
    'celestial',
    'construct',
    'dragon',
    'elemental',
    'fey',
    'fiend',
    'giant',
    'monstrosity',
    'ooze',
    'plant',
    'undead',
  ])
  expect(
    f.data.classes
      .find((c) => c.source === 'XPHB')!
      .normalizedRules!.choices.some((c) => decodeFavoredEnemyChoiceId(c.id)),
  ).toBe(false)
})
test('partial mode, pair confirmation, language pending and explicit none strictly reopen distinctly', () => {
  const f = makeFavoredEnemyFixture()
  let c = selectFavoredEnemy(f, 1, [], { mode: 'humanoid-races' })
  expect(c.classChoiceSelections![0].selected).toEqual([])
  expect(states(c, f)[0].recovery).toBe(false)
  expect(isFavoredEnemySetupComplete(states(c, f)[0])).toBe(false)
  c = selectFavoredEnemy(f, 1, ['Gnoll'], { mode: 'humanoid-races' }, c)
  expect(states(c, f)[0].enemy!.complete).toBe(false)
  c = selectFavoredEnemy(
    f,
    1,
    ['Gnoll', 'Orc'],
    { mode: 'humanoid-races', humanoidsConfirmed: true },
    c,
  )
  expect(states(c, f)[0].enemy!.complete).toBe(true)
  expect(
    deriveConditionalProficiencyNotes(c, f.catalogs).some(
      (e) => e.label === 'Favored Enemy — Gnoll, Orc',
    ),
  ).toBe(true)
  expect(isFavoredEnemySetupComplete(states(c, f)[0])).toBe(false)
  c = selectFavoredEnemy(
    f,
    1,
    ['Gnoll', 'Orc'],
    { mode: 'humanoid-races', humanoidsConfirmed: true, language: { kind: 'none' } },
    c,
  )
  expect(isFavoredEnemySetupComplete(states(c, f)[0])).toBe(true)
  expect(c.proficiencies.languages).toEqual(f.character.proficiencies.languages)
  const summaries = summarizeFeatureOptionSelectionGroups(
    getFeatureOptionSelectionStates(c, f.data.classes, f.catalogs),
  )
  expect(summaries[0].text).toContain('No spoken language (campaign-confirmed)')
  expect(clear(selectFavoredEnemy(f, 1, [], { mode: 'type' }), f).classChoiceSelections).toEqual([])
})
test('known language and repeated language have independent exact owners; clearing one preserves others', () => {
  const f = makeFavoredEnemyFixture()
  const base = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, languages: ['common'] },
  }
  let c = selectFavoredEnemy(
    f,
    1,
    ['beast'],
    { mode: 'type', language: { kind: 'spoken', name: 'common' } },
    base,
  )
  c = selectFavoredEnemy(
    f,
    6,
    ['Gnoll', 'Orc'],
    {
      mode: 'humanoid-races',
      humanoidsConfirmed: true,
      language: { kind: 'spoken', name: 'common' },
    },
    c,
  )
  expect(c.proficiencies.languages).toEqual(['common'])
  expect(c.provenance.proficiencies.languages.common).toHaveLength(3)
  const id1 = c.classChoiceSelections!.find((s) => s.classLevel === 1)!.choiceId
  c = clear(c, f, id1)
  expect(c.provenance.proficiencies.languages.common).toHaveLength(2)
  c = clear(c, f)
  expect(c.proficiencies.languages).toEqual(['common'])
  expect(c.provenance.proficiencies.languages.common).toHaveLength(1)
})
test('distinct enemies across gains; same language allowed; level removal retains empty earned partial', () => {
  const f = makeFavoredEnemyFixture()
  let c = selectFavoredEnemy(f)
  expect(() => selectFavoredEnemy(f, 6, ['BEAST'], { mode: 'type' }, c)).toThrow()
  c = selectFavoredEnemy(
    f,
    6,
    ['Gnoll', 'Orc'],
    {
      mode: 'humanoid-races',
      humanoidsConfirmed: true,
      language: { kind: 'spoken', name: 'common' },
    },
    c,
  )
  expect(() => selectFavoredEnemy(f, 14, ['orc'], { mode: 'humanoid-races' }, c)).toThrow()
  c = selectFavoredEnemy(f, 14, [], { mode: 'type' }, c)
  expect(
    reconcileClassChoiceSelections(c.classChoiceSelections, [
      { name: 'Ranger', source: 'PHB', levels: 14 },
    ]),
  ).toHaveLength(3)
  expect(
    reconcileClassChoiceSelections(c.classChoiceSelections, [
      { name: 'Ranger', source: 'PHB', levels: 5 },
    ]),
  ).toHaveLength(1)
})
test.each([
  FAVORED_ENEMY_TARGET,
  FAVORED_ENEMY_GRANTS[1].target,
])('exact source %s loss and restoration retain intent, suspend only dependent language', (target) => {
  const f = makeFavoredEnemyFixture()
  let c = selectFavoredEnemy(f)
  c = selectFavoredEnemy(
    f,
    6,
    ['fey'],
    { mode: 'type', language: { kind: 'spoken', name: 'sylvan' } },
    c,
  )
  const catalogs = {
    ...f.catalogs,
    classFeatures: f.catalogs.classFeatures.filter((x) => getClassFeatureIdentity(x) !== target),
    classFeatureCandidates: new Map(
      [...f.catalogs.classFeatureCandidates!].filter(([key]) => key !== target),
    ),
  }
  const suspended = refreshClassProficiencyState(c, f.data.classes, catalogs)
  expect(suspended.classChoiceSelections).toBe(c.classChoiceSelections)
  expect(suspended.proficiencies.languages).toEqual(
    target === FAVORED_ENEMY_TARGET ? [] : ['common'],
  )
  expect(
    refreshClassProficiencyState(suspended, f.data.classes, f.catalogs).proficiencies.languages,
  ).toEqual(['common', 'sylvan'])
  expect(characterPersistenceSchema.safeParse(suspended).success).toBe(true)
})
test('missing vocabulary is language-specific recovery, never no-language or lost enemy facts', () => {
  const f = makeFavoredEnemyFixture(),
    c = selectFavoredEnemy(f)
  const absent = { ...f.catalogs, languages: [] }
  const state = getFavoredEnemySelectionStates(c, f.data.classes, absent)[0]
  expect(state.enemy).toEqual({ complete: true, languageAvailable: false })
  expect(state.recovery).toBe(true)
  expect(state.selection.favoredEnemy!.language).toEqual({ kind: 'spoken', name: 'common' })
  expect(refreshClassProficiencyState(c, f.data.classes, absent).proficiencies.languages).toEqual(
    [],
  )
})
test('strict offline admission rejects forged branch/owner/dependency/tag relations without throwing', () => {
  const f = makeFavoredEnemyFixture(),
    c = selectFavoredEnemy(f)
  const mutate = [
    (s: any) => {
      s.favoredEnemy.mode = 'humanoid-races'
    },
    (s: any) => {
      s.classSource = 'XPHB'
    },
    (s: any) => {
      s.selected[0].slotLevel = 6
    },
    (s: any) => {
      delete s.favoredEnemy
    },
    (s: any) => {
      s.favoredEnemy.language = { kind: 'none', name: 'common' }
    },
    (s: any) => {
      s.choiceId = 'feature-literals:%not-json'
    },
    (s: any) => {
      s.favoredEnemy.humanoidsConfirmed = true
    },
  ]
  for (const change of mutate) {
    const bad = structuredClone(c)
    change(bad.classChoiceSelections![0])
    expect(() => characterPersistenceSchema.safeParse(bad)).not.toThrow()
    expect(characterPersistenceSchema.safeParse(bad).success).toBe(false)
  }
  const orphan = structuredClone(c)
  orphan.classChoiceSelections = []
  expect(characterPersistenceSchema.safeParse(orphan).success).toBe(false)
  const wrong = structuredClone(c)
  wrong.provenance.proficiencies.skills.common = wrong.provenance.proficiencies.languages.common
  expect(characterPersistenceSchema.safeParse(wrong).success).toBe(false)
})
test('changed/extra semantic bodies do not produce a supported pool; equivalent audited copies do', () => {
  for (const edit of [
    (d: any) =>
      d.classFeature
        .find((x: any) => x.name === 'Favored Enemy' && x.source === 'PHB')
        .entries.push('Changed rule.'),
    (d: any) =>
      (d.classFeature.find(
        (x: any) => x.name === 'Favored Enemy' && x.source === 'PHB',
      ).languageProficiencies = [{ anyStandard: 1 }]),
  ]) {
    const f = makeFavoredEnemyFixture(14, edit)
    expect(f.choices).toEqual([])
    expect(
      f.classData.normalizedRules!.choiceDiagnostics.some((d) => d.featureName === 'Favored Enemy'),
    ).toBe(true)
  }
  const f = makeFavoredEnemyFixture(14, (d) =>
    d.classFeature.push(
      structuredClone(
        d.classFeature.find((x) => x.name === 'Favored Enemy' && x.source === 'PHB')!,
      ),
    ),
  )
  expect(f.choices).toHaveLength(3)
})
test.runIf(existsSync('data/class/class-ranger.json'))(
  'permission alone preserves duty; adopted Favored Foe suppresses enemy and language, terrain independent',
  () => {
    const f = makeFavoredEnemyFixture(14, undefined, 'data/class/class-ranger.json')
    let c = selectFavoredEnemy(f)
    c = { ...c, variantRules: { ...c.variantRules, optionalClassFeatures: true } }
    expect(
      getCharacterClassChoices(
        f.classData,
        undefined,
        createOptionalClassFeatureActivity(c, f.catalogs),
        f.catalogs,
      ).filter((x) => x.label === 'Favored Enemy'),
    ).toHaveLength(3)
    // Actual adoption descriptor is obtained from the source activity roots below.
    const activity = createOptionalClassFeatureActivity(c, f.catalogs)
    const foe = activity.states.find((s) => s.root.name === 'Favored Foe')!
    const result = setOptionalClassAdoptionCommand(
      c,
      c.provenance,
      f.catalogs,
      foe.adoption,
      true,
      [],
    )
    c = { ...c, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(states(c, f).every((s) => s.selection.inactive && !s.recovery)).toBe(true)
    expect(c.proficiencies.languages).toEqual([])
    expect(
      getCharacterClassChoices(
        f.classData,
        undefined,
        createOptionalClassFeatureActivity(c, f.catalogs),
        f.catalogs,
      ).filter((x) => x.label === 'Natural Explorer'),
    ).toHaveLength(3)
  },
)
test.runIf(existsSync('data/class/class-ranger.json'))(
  'configured current Ranger producer yields three strict source-owned gains',
  () => {
    const f = makeFavoredEnemyFixture(14, undefined, 'data/class/class-ranger.json')
    expect(f.choices.map((c) => c.level)).toEqual([1, 6, 14])
    expect(characterPersistenceSchema.safeParse(selectFavoredEnemy(f)).success).toBe(true)
  },
)

test.each([
  0, 1, 3,
])('missing base has one distinct recovery/diagnostic per earned gain with %s saved allocations', (count) => {
  const f = makeFavoredEnemyFixture()
  let c = f.character
  for (const [gain, name] of [
    [1, 'beast'],
    [6, 'fey'],
    [14, 'fiend'],
  ] as const)
    if ((c.classChoiceSelections?.length ?? 0) < count)
      c = selectFavoredEnemy(f, gain, [name], { mode: 'type', language: { kind: 'none' } }, c)
  const missing = makeFavoredEnemyFixture(14, (d) => {
    d.classFeature = d.classFeature.filter(
      (x) => !(x.name === 'Favored Enemy' && x.source === 'PHB'),
    )
  })
  const issues = validateClassChoices(
    c,
    createCharacterCalculationContext(c, {
      ...missing.data.lookups!,
      classChoiceClasses: missing.data.classes,
      classChoiceFeatureCatalogs: missing.catalogs,
    }),
    missing.catalogs,
  ).filter((i) => i.title.includes('Favored Enemy'))
  expect(issues).toHaveLength(3)
  expect(new Set(issues.map((i) => i.id)).size).toBe(3)
  expect(issues.filter((i) => i.title === 'Restore or remove Favored Enemy')).toHaveLength(count)
})
test('actual independent declaring owners retain full target and separate same-language ownership', () => {
  const f = makeFavoredEnemyFixture(1, (d) => {
    const other = structuredClone(d.class.find((x) => x.source === 'PHB')!)
    other.source = 'OTHER'
    d.class.push(other)
  })
  let c = selectFavoredEnemy(f)
  c = {
    ...c,
    classProgression: [...c.classProgression, { name: 'Ranger', source: 'OTHER', levels: 1 }],
  }
  const other = f.data.classes.find((x) => x.source === 'OTHER')!
  const choice = getCharacterClassChoices(
    other,
    undefined,
    createOptionalClassFeatureActivity(c, f.catalogs),
    f.catalogs,
  ).find((x) => x.label === 'Favored Enemy')!
  const result = applyClassChoiceSelectionWithGrantsCommand(
    c,
    c.provenance,
    choice,
    [favoredEnemyOption('beast', 'type')],
    { classes: f.data.classes, catalogs: f.catalogs },
    { mode: 'type', language: { kind: 'spoken', name: 'common' } },
  )
  c = characterPersistenceSchema.parse({
    ...c,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(c.provenance.proficiencies.languages.common).toHaveLength(2)
  expect(decodeFavoredEnemyChoiceId(choice.id)!.pool).toBe(FAVORED_ENEMY_TARGET)
  c = clear(c, f, c.classChoiceSelections!.find((x) => x.classSource === 'PHB')!.choiceId)
  expect(c.provenance.proficiencies.languages.common).toHaveLength(1)
  expect(c.proficiencies.languages).toEqual(['common'])
})
test.runIf(existsSync('data/class/class-ranger.json'))(
  'adoption missing-source/OFF/ON/restoration/Clear preserves exact enemy intent and terrain independence',
  () => {
    const f = makeFavoredEnemyFixture(14, undefined, 'data/class/class-ranger.json')
    let c = selectFavoredEnemy(f)
    c = { ...c, variantRules: { ...c.variantRules, optionalClassFeatures: true } }
    const foe = createOptionalClassFeatureActivity(c, f.catalogs).states.find(
      (s) => s.root.name === 'Favored Foe',
    )!
    const adopt = setOptionalClassAdoptionCommand(
      c,
      c.provenance,
      f.catalogs,
      foe.adoption,
      true,
      [],
    )
    c = { ...c, ...adopt.characterPatch, provenance: adopt.provenanceUpdate }
    const missing = makeFavoredEnemyFixture(
      14,
      (d) => {
        d.classFeature = d.classFeature.filter((x) => !(x.name === 'Favored Foe' && x.level === 1))
      },
      'data/class/class-ranger.json',
    )
    expect(states(c, missing)[0].selection.inactive).toBe(true)
    expect(states(c, missing)[0].recovery).toBe(false)
    const toggle = (enabled: boolean) => {
      const r = reconcileOptionalClassFeatureChoicesCommand(
        c,
        c.provenance,
        {
          availableClasses: missing.data.classes,
          allClasses: f.data.classes,
          classChoiceFeatureCatalogs: missing.catalogs,
        },
        enabled,
      )
      c = {
        ...c,
        ...r.characterPatch,
        provenance: r.provenanceUpdate,
        variantRules: { ...c.variantRules, optionalClassFeatures: enabled },
      }
    }
    toggle(false)
    expect(states(c, missing)[0].selection.inactive).toBeFalsy()
    expect(c.proficiencies.languages).toContain('common')
    toggle(true)
    expect(c.proficiencies.languages).not.toContain('common')
    expect(states(c, f)[0].selection.inactive).toBe(true)
    const clearAdoption = setOptionalClassAdoptionCommand(
      c,
      c.provenance,
      missing.catalogs,
      foe.adoption,
      false,
      [getOptionalClassAdoptionKey(foe.adoption)],
    )
    c = { ...c, ...clearAdoption.characterPatch, provenance: clearAdoption.provenanceUpdate }
    expect(states(c, missing)[0].enemy!.complete).toBe(true)
    expect(c.proficiencies.languages).toContain('common')
  },
)
test('full/compact PDF and actual binary use current language and conditional context without a numerical or Actions grant', async () => {
  const f = makeFavoredEnemyFixture(1),
    c = selectFavoredEnemy(f)
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const before = JSON.stringify(c)
  const vm = createCurrentCharacterSheetViewModel(c, input),
    baseline = createCurrentCharacterSheetViewModel(f.character, input)
  expect(vm.featuresSummary).toContain('Favored Enemy: beast (level 1)')
  expect(vm.featuresSummary).toContain('Language: common (campaign-confirmed)')
  expect(vm.featuresSummary).toMatch(/advantage on Wisdom \(\s*Survival\s*\) checks to track/)
  expect(withoutSheetDescriptions(vm).featuresSummary).toContain(
    'Language: common (campaign-confirmed)',
  )
  expect(vm.proficienciesSummary).toContain('Languages: common')
  expect(vm.skillByName.get('survival')!.modifier).toBe(
    baseline.skillByName.get('survival')!.modifier,
  )
  expect(vm.actions).toEqual(baseline.actions)
  const form = (
    await PDFDocument.load(await generateTestCharacterSheet(vm, '2014-custom'))
  ).getForm()
  expect(form.getTextField('Language 1').getText()).toBe('common')
  const absent = createCurrentCharacterSheetViewModel(c, {
    ...input,
    classChoiceFeatureCatalogs: {
      ...f.catalogs,
      classFeatures: [],
      classFeatureCandidates: new Map(),
    },
  })
  expect(absent.proficienciesSummary).not.toContain('Languages: common')
  expect(absent.featuresSummary).toContain('rules unavailable')
  expect(JSON.stringify(c)).toBe(before)
})

test('stale whole-allocation confirmation and Clear cannot overwrite a newer saved relation', () => {
  const f = makeFavoredEnemyFixture(1),
    first = selectFavoredEnemy(f)
  const handle = getOptionalPoolSelectionHandle(first.classChoiceSelections![0])
  const newer = selectFavoredEnemy(
    f,
    1,
    ['fey'],
    { mode: 'type', language: { kind: 'spoken', name: 'sylvan' } },
    first,
  )
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      newer,
      newer.provenance,
      f.choices[0],
      [favoredEnemyOption('beast', 'type')],
      { classes: f.data.classes, catalogs: f.catalogs },
      { mode: 'type', language: { kind: 'spoken', name: 'common' } },
      handle,
    ),
  ).toThrow(/changed/)
  expect(() =>
    retainSavedFeatureOptionsCommand(
      newer,
      newer.provenance,
      f.choices[0].id,
      [],
      { classes: f.data.classes, catalogs: f.catalogs },
      handle,
    ),
  ).toThrow(/changed/)
})
test.each([
  'name',
  'className',
  'classSource',
  'source',
  'level',
] as const)('an explicit base target %s conflict never borrows the sole near match', (field) => {
  const f = makeFavoredEnemyFixture(14, (d) => {
    const base = d.classFeature.find((x) => x.name === 'Favored Enemy' && x.source === 'PHB')!
    if (field === 'level') base.level = 2
    else base[field] = 'OTHER'
  })
  expect(f.choices).toEqual([])
  expect(
    f.classData.normalizedRules!.choiceDiagnostics.filter((d) => d.featureName === 'Favored Enemy'),
  ).toHaveLength(3)
})

test('lower authority, presentation and proficiency projection agree on independent enemy/language axes', () => {
  const f = makeFavoredEnemyFixture(6)
  const complete = selectFavoredEnemy(f)
  const partial = selectFavoredEnemy(f, 1, [], { mode: 'humanoid-races' })
  const pending = selectFavoredEnemy(f, 1, ['beast'], { mode: 'type' })
  const unknown = structuredClone(complete)
  unknown.classChoiceSelections![0].selected = [
    { ...favoredEnemyOption('unknown type', 'type'), slotLevel: 1 },
  ]
  expect(characterPersistenceSchema.safeParse(unknown).success).toBe(true)
  for (const [c, catalogs, expected] of [
    [complete, f.catalogs, [true, true, false, ['common']]],
    [partial, f.catalogs, [false, false, false, []]],
    [pending, f.catalogs, [true, false, false, []]],
    [complete, { ...f.catalogs, languages: [] }, [true, false, true, []]],
    [unknown, f.catalogs, [false, true, true, []]],
    [
      complete,
      { ...f.catalogs, classFeatures: [], classFeatureCandidates: new Map() },
      [false, true, true, []],
    ],
  ] as const) {
    const lower = getFavoredEnemyAuthority(c, f.data.classes, catalogs)[0]
    const view = getFavoredEnemySelectionStates(c, f.data.classes, catalogs)[0]
    expect([
      lower.complete,
      lower.languageAvailable,
      lower.recovery,
      projectOwnedProficiencies(c, catalogs).effective.proficiencies.languages,
    ]).toEqual(expected)
    expect([view.enemy!.complete, view.enemy!.languageAvailable, view.recovery]).toEqual(
      expected.slice(0, 3),
    )
  }
})
test('explicit empty owner classes remain authoritative despite a populated supplied catalog', () => {
  const f = makeFavoredEnemyFixture(1),
    c = selectFavoredEnemy(f)
  expect(getFavoredEnemyAuthority(c, [], f.catalogs)[0]).toMatchObject({
    complete: false,
    recovery: true,
    choice: undefined,
  })
  expect(getFavoredEnemySelectionStates(c, [], f.catalogs)[0].enemy!.complete).toBe(false)
  expect(
    projectOwnedProficiencies(c, { ...f.catalogs, classes: [] }).effective.proficiencies.languages,
  ).toEqual([])
  expect(getFavoredEnemyAuthority(c, f.data.classes, f.catalogs)[0]).toMatchObject({
    complete: true,
    recovery: false,
  })
})

test.runIf(existsSync('data/class/class-ranger.json'))(
  'inactive retained details keep enemy/language and terrain families separate through OFF/ON and exact Clear',
  () => {
    const f = makeFavoredEnemyFixture(1, undefined, 'data/class/class-ranger.json')
    let c = selectFavoredEnemy(f)
    c = { ...c, variantRules: { ...c.variantRules, optionalClassFeatures: true } }
    const natural = getCharacterClassChoices(
      f.classData,
      undefined,
      createOptionalClassFeatureActivity(c, f.catalogs),
      f.catalogs,
    ).find((x) => x.label === 'Natural Explorer')!
    const terrain = applyClassChoiceSelectionWithGrantsCommand(
      c,
      c.provenance,
      natural,
      [natural.options.find((o) => o.name === 'Forest')!],
      { classes: f.data.classes, catalogs: f.catalogs },
    )
    c = { ...c, ...terrain.characterPatch, provenance: terrain.provenanceUpdate }
    const roots = createOptionalClassFeatureActivity(c, f.catalogs).states
    const foe = roots.find((x) => x.root.name === 'Favored Foe')!.adoption
    const deft = roots.find((x) => x.root.name === 'Deft Explorer')!.adoption
    const adoption = (request: typeof foe, on: boolean) => {
      const r = setOptionalClassAdoptionCommand(
        c,
        c.provenance,
        f.catalogs,
        request,
        on,
        on ? [] : [getOptionalClassAdoptionKey(request)],
      )
      c = { ...c, ...r.characterPatch, provenance: r.provenanceUpdate }
    }
    const details = (label: string) =>
      JSON.stringify(
        buildRetainedCharacterDetails(c, f.data, f.data).choiceDetailsById.get(
          c.classChoiceSelections!.find((s) => s.label === label)!.choiceId,
        ),
      )
    adoption(foe, true)
    expect(details('Favored Enemy')).toContain('Favored Foe replaces Favored Enemy')
    expect(details('Favored Enemy')).toContain('Language: common (campaign-confirmed)')
    expect(details('Favored Enemy')).not.toContain('Deft Explorer')
    expect(details('Natural Explorer')).not.toContain('Saved favored-terrain intent is inactive')
    adoption(deft, true)
    expect(details('Natural Explorer')).toContain('Deft Explorer replaces Natural Explorer')
    expect(details('Natural Explorer')).not.toContain('Favored Foe')
    const toggle = (enabled: boolean) => {
      const r = reconcileOptionalClassFeatureChoicesCommand(
        c,
        c.provenance,
        {
          availableClasses: f.data.classes,
          allClasses: f.data.classes,
          classChoiceFeatureCatalogs: f.catalogs,
        },
        enabled,
      )
      c = {
        ...c,
        ...r.characterPatch,
        provenance: r.provenanceUpdate,
        variantRules: { ...c.variantRules, optionalClassFeatures: enabled },
      }
    }
    toggle(false)
    expect(details('Favored Enemy')).not.toContain('intent is inactive')
    expect(details('Natural Explorer')).not.toContain('intent is inactive')
    expect(c.proficiencies.languages).toContain('common')
    toggle(true)
    expect(details('Favored Enemy')).toContain('Favored Foe replaces Favored Enemy')
    adoption(foe, false)
    expect(details('Favored Enemy')).not.toContain('intent is inactive')
    expect(details('Favored Enemy')).toContain('Language: common (campaign-confirmed)')
    expect(details('Natural Explorer')).toContain('Deft Explorer replaces Natural Explorer')
    adoption(deft, false)
    expect(details('Natural Explorer')).not.toContain('intent is inactive')
  },
)
