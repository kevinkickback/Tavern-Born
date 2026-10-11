import { expect, test } from 'vitest'
import { normalizeClassChoices } from '@/lib/5etools/classChoiceNormalization'
import { buildClassLookup, buildGameDataLookups } from '@/lib/5etools/lookups'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import {
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import {
  readSheetExportPreferences,
  writeSheetExportPreferences,
} from '@/lib/storage/sheetExportPreferences'
import type { Class5e, ClassFeature, ClassFeatureReference } from '@/types/5etools'
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
