import { expect, test } from 'vitest'
import {
  normalizeClassChoices,
  normalizeSubclassRules,
} from '@/lib/5etools/classChoiceNormalization'
import { DataFilter } from '@/lib/5etools/filters'
import { buildClassLookup, buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import {
  collectSubclassFeatures,
  getClassChoiceOptionKey,
  indexSubclassFeatureTargets,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import {
  readSheetExportPreferences,
  writeSheetExportPreferences,
} from '@/lib/storage/sheetExportPreferences'
import type {
  Class5e,
  ClassFeature,
  ClassFeatureReference,
  SubclassFeature,
  SubclassFeatureReference,
} from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

const beacon: ClassFeature = {
  name: 'Beacon',
  source: 'PHB',
  className: 'Wizard',
  classSource: 'PHB',
  level: 1,
  entries: ['As an action, light a beacon.'],
}
const catalogs = {
  classFeatures: [beacon],
  subclassFeatures: [],
  creatures: [],
  feats: [],
  items: [],
  itemsBase: [],
  itemMasteries: [],
  optionalFeatures: [],
  itemPropertyByAbbr: {},
  itemTypeByAbbr: {},
  weaponProficiencies: [],
}
function choice(owner = 'Wizard', id = `choice:${owner}`): NormalizedCharacterChoice {
  return {
    id,
    label: 'Beacon choice',
    kind: 'class-feature',
    owner: { type: 'class', name: owner, source: 'PHB' },
    level: 1,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array(20).fill(1),
    options: [
      { entityType: 'classFeature', name: 'Beacon', source: 'PHB', ref: 'Beacon|Wizard||1' },
    ],
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: 'test' },
  }
}
function apply(character: Character, descriptor: NormalizedCharacterChoice, clear = false) {
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance!,
    descriptor,
    clear ? [] : descriptor.options,
  )
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}
function reopen(character: Character) {
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
}
function observe(character: Character, classes: Class5e[], targets: ClassFeature[] = [beacon]) {
  const context = {
    classesByKey: buildClassLookup(classes),
    classFeaturesByKey: buildGameDataLookups(makeGameDataFixture({ classFeatures: targets }))
      .classFeaturesByKey,
  }
  const before = structuredClone({ character, classes, targets })
  const view = createCharacterSheetViewModel(character, context)
  expect(
    deriveCharacterActions(character, {
      classes,
      classesByKey: context.classesByKey,
      classFeaturesByKey: context.classFeaturesByKey,
      abilityModifiers: {
        strength: 0,
        dexterity: 0,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
    }),
  ).toEqual(view.actions)
  expect({ character, classes, targets }).toEqual(before)
  return view
}
function earned(feature = beacon): ClassFeatureReference {
  return {
    ref: `Beacon|Wizard||${feature.level}`,
    name: 'Beacon',
    className: 'Wizard',
    feature: structuredClone(feature),
  }
}
function configure(character: Character, id: string) {
  Object.assign(
    character,
    upsertManualActionCommand(character, {
      id,
      name: 'Configured Beacon',
      kind: 'action',
      description: 'Player configuration.',
      active: false,
      source: { kind: 'manual', name: 'Configured Beacon' },
    }),
  )
  Object.assign(
    character,
    upsertManualActionCommand(character, {
      id: 'independent-player-row',
      name: 'Independent',
      kind: 'action',
      description: 'Independent rule.',
      active: true,
      source: { kind: 'manual', name: 'Independent' },
    }),
  )
  writeSheetExportPreferences({
    [character.id]: { pages: {}, content: { action: [id, 'independent-player-row'] } },
  })
}
function expectConfigured(
  character: Character,
  classes: Class5e[],
  id: string,
  targets?: ClassFeature[],
) {
  const view = observe(reopen(character), classes, targets)
  expect(view.actions).toHaveLength(2)
  expect(view.actions.find((action) => action.id === id)).toMatchObject({
    name: 'Configured Beacon',
    active: false,
  })
  const choices = readSheetExportPreferences()[character.id].content
  expect(
    planSheetContent(view, '2014-custom', choices).groups.find((group) => group.id === 'action'),
  ).toMatchObject({
    automatic: false,
    selected: expect.arrayContaining([id, 'independent-player-row']),
  })
}

test('new complete choice IDs survive missing owner, earned restoration, save, Edit and Clear', () => {
  let character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  character = apply(character, choice())
  const id = observe(character, []).actions[0].id
  configure(character, id)
  expectConfigured(character, [], id)
  const classes = [makeClassFixture({ classFeatureRefs: [earned()] })]
  expectConfigured(character, classes, id)
  const refreshed = { ...beacon, entries: ['As a reaction, dismiss the beacon.'] }
  expect(
    observe(character, classes, [refreshed]).actions.some((action) => action.kind === 'reaction'),
  ).toBe(true)
  expectConfigured(character, [], id, [])
  expectConfigured(character, classes, id)
  Object.assign(character, removeManualActionCommand(character, id))
  expect(
    observe(reopen(character), classes).actions.find((action) => action.id === id),
  ).toMatchObject({ active: true, source: { kind: 'class' } })
  character = apply(character, choice(), true)
  expect(observe(character, []).actions).toMatchObject([{ id: 'independent-player-row' }])
  expect(observe(character, classes).actions.find((action) => action.id === id)).toBeDefined()
})

test('unresolved qualified choices never emit an opaque action before complete target restoration', () => {
  let character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  character = apply(character, choice())
  character.features[0].description = 'As an action, use a saved label.'
  expect(observe(reopen(character), [], []).actions).toEqual([])
  const id = observe(reopen(character), []).actions[0].id
  const classes = [makeClassFixture({ classFeatureRefs: [earned()] })]
  expect(observe(reopen(character), classes).actions).toMatchObject([{ id }])
  character.classChoiceSelections![0].selected[0].ref = undefined
  expect(observe(reopen(character), []).actions).toEqual([])
})

test.each([
  { entityType: 'classFeature' as const, classSource: 'PHB', targetSource: 'PHB' },
  { entityType: 'classFeature' as const, classSource: 'XPHB', targetSource: 'XPHB' },
  { entityType: 'classFeature' as const, classSource: 'PHB', targetSource: 'TCE' },
  { entityType: 'subclassFeature' as const, classSource: 'PHB', targetSource: 'PHB' },
  { entityType: 'subclassFeature' as const, classSource: 'XPHB', targetSource: 'TCE' },
])('complete $entityType UIDs own omitted source defaults ($targetSource)', ({
  entityType,
  classSource,
  targetSource,
}) => {
  const target = {
    ...beacon,
    source: entityType === 'classFeature' && targetSource !== classSource ? targetSource : '',
    classSource,
    ...(entityType === 'subclassFeature'
      ? { subclassShortName: 'School', subclassSource: targetSource }
      : {}),
  }
  const ref =
    entityType === 'classFeature'
      ? `Beacon|Wizard|${classSource}|1|${targetSource === classSource ? '' : targetSource}`
      : `Beacon|Wizard|${classSource}|School|${targetSource}|1`
  const classes = [
    makeClassFixture({
      source: classSource,
      classFeatureRefs: [],
      subclasses:
        entityType === 'subclassFeature'
          ? [
              {
                name: 'First School',
                shortName: 'School',
                source: targetSource,
                className: 'Wizard',
                classSource,
                subclassFeatures: [target],
              },
            ]
          : [],
    }),
  ]
  const targets = entityType === 'classFeature' ? [target] : []
  const choiceCatalogs = {
    ...catalogs,
    classFeatures: targets,
    subclassFeatures: entityType === 'subclassFeature' ? [target] : [],
    subclassTargets: indexSubclassFeatureTargets(classes),
  }
  const descriptor = {
    ...choice(),
    owner: { type: 'class' as const, name: 'Wizard', source: classSource },
    options: [{ entityType, name: 'Beacon', source: targetSource, ref }],
  }
  const [view] = resolveClassChoiceOptions(descriptor, choiceCatalogs)
  expect(view).toMatchObject({ availability: 'eligible', entries: beacon.entries })
  expect(view.reference.source).toBe(target.source || undefined)
  for (const source of [undefined, '', ' ', targetSource.toLowerCase()]) {
    const [resolved] = resolveClassChoiceOptions(
      { ...descriptor, options: [{ ...view.reference, source }] },
      choiceCatalogs,
    )
    expect(resolved).toMatchObject({ availability: 'eligible', entries: beacon.entries })
    expect(getClassChoiceOptionKey(resolved.reference)).toBe(
      getClassChoiceOptionKey(descriptor.options[0]),
    )
  }
  for (const conflict of [
    { source: 'OTHER' },
    { name: 'Other Beacon' },
    { ref: undefined, source: undefined },
  ]) {
    expect(
      resolveClassChoiceOptions(
        { ...descriptor, options: [{ ...view.reference, ...conflict }] },
        choiceCatalogs,
      ),
    ).toMatchObject([{ availability: 'retained', entries: [] }])
  }
  const initial = createEmptyCharacter({
    name: 'Defaulted target',
    originSystem: classSource === 'XPHB' ? '2024' : '2014',
    classProgression: [{ name: 'Wizard', source: classSource, levels: 1 }],
  })
  const result = applyClassChoiceSelectionWithGrantsCommand(
    initial,
    initial.provenance!,
    descriptor,
    [view.reference],
  )
  let character: Character = reopen({
    ...initial,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const actions = observe(character, classes, targets).actions
  expect(actions).toMatchObject([
    {
      kind: 'action',
      description: 'As an action, light a beacon.',
      source: { source: target.source || targetSource.toLowerCase() },
    },
  ])
  const data = makeGameDataFixture({ classes, classFeatures: targets })
  expect(characterUsesContentOutsideCatalog(character, createGameDataAvailabilityIndex(data))).toBe(
    false,
  )
  expect(
    buildRetainedCharacterDetails(character, data, null).choiceDetailsById.get(descriptor.id),
  ).toEqual([{ availability: 'available', entries: beacon.entries }])
  expect(observe(character, [], []).actions).toEqual([])
  expect(observe(reopen(character), classes, targets).actions).toEqual(actions)
  character = apply(character, descriptor, true)
  expect(observe(reopen(character), classes, targets).actions).toEqual([])
})

test('restoring an earlier identical gain preserves an issued current ID and exact PDF/manual preferences', () => {
  const later = { ...beacon, level: 17 }
  const character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 17 }],
  })
  const classes = [makeClassFixture({ classFeatureRefs: [earned(later)] })]
  const id = observe(character, classes).actions[0].id
  configure(character, id)
  classes[0].classFeatureRefs!.unshift(earned())
  expectConfigured(character, classes, id)
  classes[0].classFeatureRefs!.pop()
  expectConfigured(character, classes, id)
  classes[0].classFeatureRefs![0].feature!.entries = ['As a reaction, dismiss a beacon.']
  expect(observe(character, classes).actions).toHaveLength(3)
})

test('independent choice owners survive removal and never bind to a competing earned class', () => {
  let character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: ['Wizard', 'Bard'].map((name) => ({ name, source: 'PHB', levels: 1 })),
  })
  character = apply(apply(character, choice()), choice('Bard'))
  expect(character.features).toHaveLength(2)
  const actions = observe(character, []).actions
  expect(actions).toHaveLength(2)
  expect(new Set(actions.map((action) => action.id)).size).toBe(2)
  const bardId = actions[1].id
  character = apply(character, choice(), true)
  expect(character.features).toHaveLength(1)
  expect(observe(character, []).actions).toMatchObject([{ id: bardId }])
  const classes = [makeClassFixture({ classFeatureRefs: [earned()] })]
  expect(observe(character, classes).actions).toHaveLength(2)
  expect(observe(character, classes).actions.some((action) => action.id === bardId)).toBe(true)
})

test('two choices granting the same owned target retain materialized/action IDs after either is cleared', () => {
  let character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  character = apply(apply(character, choice('Wizard', 'one')), choice('Wizard', 'two'))
  const featureId = character.features[0].id
  const actionId = observe(character, []).actions[0].id
  expect(character.features).toHaveLength(1)
  expect(character.provenance!.features.beacon).toHaveLength(2)
  character = apply(character, choice('Wizard', 'one'), true)
  expect(character.features).toMatchObject([{ id: featureId }])
  expect(character.provenance!.features.beacon).toHaveLength(1)
  expect(observe(character, []).actions).toMatchObject([{ id: actionId }])
  character = apply(character, choice('Wizard', 'two'), true)
  expect(character.features).toEqual([])
  expect(character.provenance!.features.beacon).toBeUndefined()
})

test('normalization and option views retain complete same-label targets through strict persistence', () => {
  const root: ClassFeatureReference = {
    ...earned(),
    feature: {
      ...beacon,
      entries: [
        {
          type: 'options',
          count: 2,
          entries: ['Wizard', 'Bard'].map((name) => ({
            type: 'refClassFeature',
            classFeature: `Beacon|${name}||1`,
          })),
        },
      ],
    },
  }
  const descriptor = normalizeClassChoices({ name: 'Wizard', source: 'PHB' }, [root]).choices[0]
  const views = resolveClassChoiceOptions(descriptor, {
    ...catalogs,
    classFeatures: [
      beacon,
      { ...beacon, className: 'Bard', entries: ['As a reaction, answer a beacon.'] },
    ],
  })
  expect(views).toHaveLength(2)
  expect(views.every((view) => view.availability === 'eligible')).toBe(true)
  expect(new Set(views.map((view) => getClassChoiceOptionKey(view.reference))).size).toBe(2)
  const initial = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  const result = applyClassChoiceSelectionWithGrantsCommand(
    initial,
    initial.provenance!,
    descriptor,
    views.map((view) => view.reference),
  )
  const saved = reopen({
    ...initial,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.classChoiceSelections![0].selected.map((option) => option.ref).sort()).toEqual([
    'beacon|bard|phb|1|phb',
    'beacon|wizard|phb|1|phb',
  ])
  expect(saved.features).toHaveLength(2)
  const wrong = resolveClassChoiceOptions(descriptor, {
    ...catalogs,
    classFeatures: [{ ...beacon, source: 'TCE' }],
  })
  expect(wrong.every((view) => view.availability === 'retained' && view.entries.length === 0)).toBe(
    true,
  )
})

test('full selected subclass names isolate same-short-name definitions and their overrides', () => {
  const character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 1, subclass: 'First School', subclassSource: 'PHB' },
    ],
  })
  const classes = [
    makeClassFixture({
      classFeatureRefs: [],
      subclasses: ['First School', 'Second School'].map((name) => ({
        name,
        shortName: 'School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatureRefs: [
          {
            ref: 'Beacon|Wizard||School||1',
            name: 'Beacon',
            className: 'Wizard',
            subclassShortName: 'School',
            feature: { ...beacon, subclassShortName: 'School', subclassSource: 'PHB' },
          },
        ],
      })),
    }),
  ]
  const first = observe(character, classes).actions[0].id
  configure(character, first)
  character.classProgression[0].subclass = 'Second School'
  const actions = observe(reopen(character), classes).actions
  expect(actions).toHaveLength(3)
  expect(actions.filter((action) => action.source.kind === 'subclass')[0]).toMatchObject({
    active: true,
  })
  expect(actions.find((action) => action.source.kind === 'subclass')!.id).not.toBe(first)
  character.classProgression[0].subclass = 'First School'
  expectConfigured(character, classes, first)
})

const schoolBeacon: SubclassFeature = {
  ...beacon,
  level: 3,
  subclassShortName: 'School',
  subclassSource: 'PHB',
}
const schoolOption = {
  type: 'refSubclassFeature',
  subclassFeature: 'Beacon|Wizard||School||3',
}
function schoolTraining(gain: string, numericLevel = 3): SubclassFeatureReference {
  return {
    ref: gain ? `Training|Wizard||School||${gain}` : '',
    name: 'Training',
    className: 'Wizard',
    classSource: 'PHB',
    subclassShortName: 'School',
    subclassSource: 'PHB',
    source: 'PHB',
    level: numericLevel,
    feature: {
      ...schoolBeacon,
      name: 'Training',
      level: numericLevel,
      entries: [{ type: 'options', count: 1, entries: [schoolOption] }],
    },
  }
}
function schoolChoice(name = 'First School', gain = '3', numericLevel = 3) {
  return normalizeSubclassRules({ name: 'Wizard', source: 'PHB' }, { name, source: 'PHB' }, [
    schoolTraining(gain, numericLevel),
  ]).choices
}
function schoolCharacter() {
  return createEmptyCharacter({
    name: 'Current School',
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 3, subclass: 'First School', subclassSource: 'PHB' },
    ],
  })
}

test.each([
  '3junk',
  '0',
  '3.5',
])('production parsing never admits a new subclass choice from malformed gain %s', (gain) => {
  const classes = parseClasses({
    class: [{ name: 'Wizard', source: 'PHB', classFeatures: [] }],
    subclass: [
      {
        name: 'First School',
        shortName: 'School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatures: [`Training|Wizard||School||${gain}`],
      },
    ],
    subclassFeature: [schoolTraining('3').feature, schoolBeacon],
  }) as Class5e[]
  expect(classes[0].subclasses![0].normalizedRules!.choices).toEqual([])
  expect(schoolChoice('First School', gain)).toEqual([])
  expect(observe(reopen(schoolCharacter()), classes, []).actions).toEqual([])
})

test('subclass choice eligibility honors encoded gain and rejects premature commands atomically', () => {
  const character = schoolCharacter()
  const before = structuredClone(character)
  const descriptor = schoolChoice('First School', '8', 3)[0]
  expect(descriptor.level).toBe(8)
  expect(() => apply(character, descriptor)).toThrow(/current class level/)
  expect(character).toEqual(before)
  expect(schoolChoice('First School', '', 0)).toEqual([])
  for (const gain of ['3', '']) {
    const available = schoolChoice('First School', gain)[0]
    const views = resolveClassChoiceOptions(available, {
      ...catalogs,
      subclassFeatures: [schoolBeacon],
    })
    expect(views).toMatchObject([{ availability: 'eligible' }])
    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance!,
      available,
      views.map((view) => view.reference),
    )
    const saved = reopen({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    expect(saved.classChoiceSelections![0].selected[0].ref).toBe(
      'beacon|wizard|phb|school|phb|3|phb',
    )
  }
})

test('subclass choice rules stay with the full selected owner through competition and absence', () => {
  let character = apply(schoolCharacter(), schoolChoice()[0])
  const classes = [
    makeClassFixture({
      classFeatureRefs: [],
      subclasses: ['First School', 'Second School'].map((name, index) => ({
        name,
        shortName: 'School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        normalizedRules: normalizeSubclassRules(
          { name: 'Wizard', source: 'PHB' },
          { name, source: 'PHB' },
          [schoolTraining('3')],
        ),
        subclassFeatureRefs: [
          {
            ref: 'Beacon|Wizard||School||3',
            name: 'Beacon',
            className: 'Wizard',
            subclassShortName: 'School',
            feature: {
              ...schoolBeacon,
              entries: index === 0 ? beacon.entries : ['As a reaction, dismiss a beacon.'],
            },
          },
        ],
      })),
    }),
  ]
  const initial = observe(reopen(character), classes).actions
  expect(initial).toMatchObject([{ kind: 'action' }])
  const id = initial[0].id
  classes[0].subclasses!.reverse()
  expect(observe(reopen(character), classes).actions).toEqual(initial)
  const readiness = (subclassFeatures = classes[0].subclasses!.flatMap(collectSubclassFeatures)) =>
    validateClassChoices(
      character,
      createCharacterCalculationContext(character, { classesByKey: buildClassLookup(classes) }),
      {
        ...catalogs,
        subclassFeatures,
      },
    ).map((issue) => issue.id)
  expect(readiness()).not.toContain(`class-choice:${schoolChoice()[0].id}`)
  expect(readiness([])).toContain(`class-choice:${schoolChoice()[0].id}`)
  const firstSchool = classes[0].subclasses![1]
  const savedRefs = firstSchool.subclassFeatureRefs
  firstSchool.subclassFeatureRefs = []
  expect(readiness()).toContain(`class-choice:${schoolChoice()[0].id}`)
  firstSchool.subclassFeatureRefs = savedRefs
  configure(character, id)
  character.classProgression[0].subclass = 'Second School'
  character = apply(character, schoolChoice('Second School')[0])
  const switched = observe(reopen(character), classes).actions
  expect(switched).toHaveLength(3)
  expect(switched.find((row) => row.source.kind === 'subclass')).toMatchObject({
    kind: 'reaction',
    active: true,
  })
  expect(switched.find((row) => row.source.kind === 'subclass')!.id).not.toBe(id)
  character = apply(character, schoolChoice('Second School')[0], true)
  character.classProgression[0].subclass = 'First School'
  expectConfigured(character, classes, id)
  const absent = [{ ...classes[0], subclasses: [classes[0].subclasses![0]] }]
  expect(absent[0].subclasses[0].name).toBe('Second School')
  expectConfigured(character, absent, id)
  expect(
    characterUsesContentOutsideCatalog(
      reopen(character),
      createGameDataAvailabilityIndex(makeGameDataFixture({ classes: absent })),
    ),
  ).toBe(true)
  expect(
    buildRetainedCharacterDetails(
      character,
      makeGameDataFixture({ classes: absent }),
      null,
    ).choiceDetailsById.get(character.classChoiceSelections![0].choiceId),
  ).toEqual([{ availability: 'missing', entries: [] }])
  expectConfigured(character, classes, id)
  Object.assign(character, removeManualActionCommand(character, id))
  expect(observe(reopen(character), absent).actions).toMatchObject([
    { id: 'independent-player-row' },
  ])
  expect(observe(reopen(character), classes).actions).toMatchObject([
    { id, kind: 'action' },
    { id: 'independent-player-row' },
  ])
})

test('availability and Overview recover the complete cross-parent target without borrowing its label', () => {
  const descriptor = choice()
  descriptor.options[0].ref = 'Beacon|Bard||1'
  const character = reopen(
    apply(
      createEmptyCharacter({
        name: 'Current Cross-parent',
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      }),
      descriptor,
    ),
  )
  const classes = [makeClassFixture({ classFeatureRefs: [] })]
  const exact = { ...beacon, className: 'Bard', entries: ['As a reaction, answer a beacon.'] }
  const competing = makeGameDataFixture({ classes, classFeatures: [beacon] })
  const restored = makeGameDataFixture({ classes, classFeatures: [beacon, exact] })
  expect(
    characterUsesContentOutsideCatalog(character, createGameDataAvailabilityIndex(competing)),
  ).toBe(true)
  expect(
    buildRetainedCharacterDetails(character, competing, null).choiceDetailsById.get(descriptor.id),
  ).toEqual([{ availability: 'missing', entries: [] }])
  expect(observe(character, classes, [beacon]).actions).toEqual([])
  expect(
    characterUsesContentOutsideCatalog(character, createGameDataAvailabilityIndex(restored)),
  ).toBe(false)
  expect(
    buildRetainedCharacterDetails(character, competing, restored).choiceDetailsById.get(
      descriptor.id,
    ),
  ).toEqual([{ availability: 'source-unavailable', entries: exact.entries }])
  expect(
    buildRetainedCharacterDetails(character, restored, competing).choiceDetailsById.get(
      descriptor.id,
    ),
  ).toEqual([{ availability: 'available', entries: exact.entries }])
  expect(observe(character, classes, [beacon, exact]).actions).toMatchObject([
    { kind: 'reaction', description: 'As a reaction, answer a beacon.' },
  ])
})

test('normal source filtering retains a class-owned subclass-target action and its exact details', () => {
  const raw = parseClasses({
    class: [{ name: 'Wizard', source: 'PHB', classFeatures: ['Training|Wizard||3'] }],
    classFeature: [
      {
        ...beacon,
        name: 'Training',
        level: 3,
        entries: [{ type: 'options', count: 1, entries: [schoolOption] }],
      },
    ],
    subclass: [
      {
        name: 'First School',
        shortName: 'School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatures: ['Beacon|Wizard||School||3'],
      },
    ],
    subclassFeature: [schoolBeacon],
  }) as Class5e[]
  const descriptor = raw[0].normalizedRules!.choices[0]
  const character = reopen(apply(schoolCharacter(), descriptor))
  const initial = observe(character, raw, []).actions
  expect(initial).toHaveLength(2)
  expect(initial.map((action) => action.source.kind).sort()).toEqual(['class', 'subclass'])
  const filtered = DataFilter.filterClasses(raw, { sources: ['PHB'] })
  expect(observe(character, filtered, []).actions).toEqual(initial)
  const options = (classes: Class5e[]) => ({
    ...catalogs,
    subclassFeatures: classes.flatMap(
      (classData) => classData.subclasses?.flatMap(collectSubclassFeatures) ?? [],
    ),
    subclassTargets: indexSubclassFeatureTargets(classes),
  })
  expect(resolveClassChoiceOptions(descriptor, options(filtered))).toMatchObject([
    { availability: 'eligible', entries: schoolBeacon.entries },
  ])
  const recovery = (classes: Class5e[]) =>
    validateClassChoices(
      character,
      createCharacterCalculationContext(character, { classesByKey: buildClassLookup(classes) }),
      options(classes),
    ).map((issue) => issue.id)
  expect(recovery(filtered)).not.toContain(`class-choice:${descriptor.id}`)
  const data = makeGameDataFixture({ classes: filtered })
  expect(characterUsesContentOutsideCatalog(character, createGameDataAvailabilityIndex(data))).toBe(
    false,
  )
  expect(
    buildRetainedCharacterDetails(character, data, null).choiceDetailsById.get(descriptor.id),
  ).toEqual([{ availability: 'available', entries: schoolBeacon.entries }])
  expect(
    buildRetainedCharacterDetails(character, makeGameDataFixture(), data).choiceDetailsById.get(
      descriptor.id,
    ),
  ).toEqual([{ availability: 'source-unavailable', entries: schoolBeacon.entries }])
  const competing = structuredClone(filtered)
  competing[0].subclasses!.push({
    ...competing[0].subclasses![0],
    name: 'Second School',
    subclassFeatureRefs: [
      {
        ...competing[0].subclasses![0].subclassFeatureRefs![0],
        feature: { ...schoolBeacon, entries: ['As a reaction, dismiss a beacon.'] },
      },
    ],
  })
  const ambiguous = makeGameDataFixture({ classes: competing })
  const actions = observe(character, competing, []).actions
  expect(actions).toMatchObject([{ source: { kind: 'subclass' }, kind: 'action' }])
  expect(
    characterUsesContentOutsideCatalog(character, createGameDataAvailabilityIndex(ambiguous)),
  ).toBe(true)
  expect(
    buildRetainedCharacterDetails(character, ambiguous, null).choiceDetailsById.get(descriptor.id),
  ).toEqual([{ availability: 'missing', entries: [] }])
  for (const reverse of [false, true]) {
    if (reverse) competing[0].subclasses!.reverse()
    expect(resolveClassChoiceOptions(descriptor, options(competing))).toMatchObject([
      { availability: 'retained', entries: [] },
    ])
    expect(recovery(competing)).toContain(`class-choice:${descriptor.id}`)
  }
  expect(observe(character, filtered, []).actions).toEqual(initial)
})
