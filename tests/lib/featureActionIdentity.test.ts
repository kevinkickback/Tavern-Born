import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { Class5e, ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function groupIdentity(id: string) {
  return JSON.parse(decodeURIComponent(id.slice(id.indexOf(':') + 1)))
}

const reference = (
  owner = 'Wizard',
  level = 1,
  description = 'As an action, light a beacon.',
): ClassFeatureReference => ({
  ref: `Shared|${owner}||${level}`,
  name: 'Shared',
  source: 'PHB',
  className: owner,
  classSource: 'PHB',
  level,
  feature: {
    name: 'Shared',
    source: 'PHB',
    className: owner,
    classSource: 'PHB',
    level,
    entries: [description],
  },
})
function observe(classes: Class5e[], stored = false) {
  const character = makeCharacterFixture({
    features: stored
      ? [
          {
            id: 'saved-shared',
            name: 'Shared',
            source: 'PHB',
            description: 'As a bonus action, use the saved feature.',
          },
        ]
      : [],
    classProgression: classes.map((entry) => ({
      name: entry.name,
      source: entry.source,
      levels: 17,
    })),
  })
  const before = structuredClone({ character, classes })
  const actions = deriveRulesTextActions(character, undefined, { classes })
  expect(
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
  ).toEqual(actions)
  expect({ character, classes }).toEqual(before)
  return actions
}

test('bundled Fighter repeated Action Surge gains use one canonical owned action', () => {
  const raw = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'resources/srd/core/data/class/class-fighter.json'),
      'utf8',
    ),
  )
  const fighter = (parseClasses(raw) as Class5e[]).find(
    (entry) => entry.name === 'Fighter' && entry.source === 'XPHB',
  )!
  const character = makeCharacterFixture({
    features: [],
    classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 17 }],
  })
  const context = { classesByKey: buildClassLookup([fighter]) }
  const vm = createCharacterSheetViewModel(character, context)
  const actions = vm.actions.filter((action) => action.name === 'Action Surge')
  expect(actions).toHaveLength(1)
  const id = actions[0].id
  expect(groupIdentity(id)).toEqual([
    JSON.stringify(['fighter|xphb']),
    ['class-feature', 'action surge', 'fighter', 'xphb', 'xphb'],
    expect.stringMatching(/^[a-f0-9]{64}$/),
  ])
  expect(
    planSheetContent(vm, '2014-custom', { action: [id] }).groups.find(
      (group) => group.id === 'action',
    ),
  ).toMatchObject({ automatic: false, selected: [id] })
  character.classProgression[0].levels = 1
  expect(
    createCharacterSheetViewModel(character, context).actions.some(
      (action) => action.name === 'Action Surge',
    ),
  ).toBe(false)
})

test('canonical UID casing, defaults and display aliases denote one complete owned target', () => {
  const first = reference()
  const alias = {
    ...first,
    ref: ' shared | WIZARD | phb | 1 | PHB | Display',
    feature: { ...first.feature!, name: ' shared ', source: 'phb' },
  }
  const actions = observe([makeClassFixture({ classFeatureRefs: [first, alias] })])
  expect(actions).toHaveLength(1)
  expect(groupIdentity(actions[0].id)).toEqual([
    JSON.stringify(['wizard|phb']),
    ['class-feature', 'shared', 'wizard', 'phb', 'phb'],
    expect.stringMatching(/^[a-f0-9]{64}$/),
  ])
  expect(actions[0]).not.toHaveProperty('idAliases')
  expect(actions[0]).not.toHaveProperty('featureIdentities')
})

test('distinct owners retain independently earned action and reaction', () => {
  const actions = observe([
    makeClassFixture({ classFeatureRefs: [reference()] }),
    makeClassFixture({
      name: 'Bard',
      classFeatureRefs: [reference('Bard', 1, 'As a reaction, open a gate.')],
    }),
  ])
  expect(actions.map((action) => action.kind)).toEqual(['action', 'reaction'])
  expect(new Set(actions.map((action) => action.id)).size).toBe(2)
})

test('different target printings remain independent under one actual owner', () => {
  const first = reference()
  const other = {
    ...first,
    ref: 'Shared|Wizard||1|TCE',
    feature: { ...first.feature!, source: 'TCE' },
  }
  const actions = observe([makeClassFixture({ classFeatureRefs: [first, other] })])
  expect(actions.map((action) => action.source.source)).toEqual(['PHB', 'TCE'])
  expect(new Set(actions.map((action) => action.id)).size).toBe(2)
})

test.each([
  'class',
  'subclass',
] as const)('missing %s reference fields retain complete materialized target identity', (kind) => {
  const references: SubclassFeatureReference[] = ['PHB', 'XPHB'].map((classSource) => ({
    ...reference(),
    ref: '',
    source: undefined,
    classSource: undefined,
    level: undefined,
    subclassShortName: 'School',
    subclassSource: undefined,
    feature: {
      ...reference().feature!,
      classSource,
      source: 'TCE',
      subclassShortName: 'School',
      subclassSource: 'TCE',
    },
  }))
  const classes = [
    makeClassFixture({
      classFeatureRefs: kind === 'class' ? references : [],
      subclasses: [
        {
          name: 'School',
          shortName: 'School',
          source: 'TCE',
          className: 'Wizard',
          classSource: 'PHB',
          subclassFeatureRefs: kind === 'subclass' ? references : [],
        },
      ],
    }),
  ]
  const character = makeCharacterFixture({
    features: [],
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 1, subclass: 'School', subclassSource: 'TCE' },
    ],
  })
  const view = () =>
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) })
  const owner = JSON.stringify(kind === 'class' ? ['wizard|phb'] : ['wizard|phb', 'school|tce'])
  const expectedId = (classSource: string) => [
    owner,
    kind === 'class'
      ? ['class-feature', 'shared', 'wizard', classSource, 'tce']
      : ['subclass-feature', 'shared', 'wizard', classSource, 'school', 'tce', 'tce'],
    expect.stringMatching(/^[a-f0-9]{64}$/),
  ]
  const before = structuredClone({ character, classes })
  const actions = view().actions
  expect(actions.map((action) => groupIdentity(action.id))).toEqual([
    expectedId('phb'),
    expectedId('xphb'),
  ])
  expect(deriveRulesTextActions(character, undefined, { classes })).toEqual(actions)
  expect({ character, classes }).toEqual(before)
  for (const action of actions) {
    expect(
      planSheetContent(view(), '2014-custom', { action: [action.id] }).groups.find(
        (group) => group.id === 'action',
      ),
    ).toMatchObject({ automatic: false, selected: [action.id] })
  }
  for (const ref of references) {
    delete ref.classSource
    delete ref.subclassSource
    delete ref.source
    delete ref.level
  }
  expect(view().actions).toEqual(actions)
  references[1].classSource = 'XGE'
  expect(view().actions.map((action) => groupIdentity(action.id))).toEqual([
    expectedId('phb'),
    expectedId('xge'),
  ])
})

test('different gain rules remain independent; passive earlier references never hide an action', () => {
  const classes = [
    makeClassFixture({
      classFeatureRefs: [reference(), reference('Wizard', 2, 'As an action, open a gate.')],
    }),
  ]
  expect(observe(classes)).toHaveLength(2)
  classes[0].classFeatureRefs![0].feature!.entries = ['Passive training.']
  expect(observe(classes)).toMatchObject([{ description: 'As an action, open a gate.' }])
})

test('structurally identical repeated gains retain their group when an earlier gain returns', () => {
  const first = reference()
  const later = reference('Wizard', 17)
  first.feature!.entries = [
    {
      type: 'entries',
      name: 'Beacon',
      entries: ['As an action, light a beacon.'],
      data: { a: 1, b: 2 },
    },
  ]
  later.feature!.entries = [
    {
      data: { b: 2, a: 1 },
      entries: ['As an action, light a beacon.'],
      name: 'Beacon',
      type: 'entries',
    },
  ]
  const classes = [makeClassFixture({ classFeatureRefs: [later] })]
  const actions = observe(classes)
  expect(actions).toHaveLength(1)
  classes[0].classFeatureRefs!.push(first)
  expect(observe(classes)).toEqual(actions)
  classes[0].classFeatureRefs!.reverse()
  expect(observe(classes)[0].id).toBe(actions[0].id)
})

test.each([
  'printing',
  'ordering',
] as const)('matching rendered text cannot collapse different parsed %s', (difference) => {
  const first = reference()
  const later = reference('Wizard', 2)
  const phb = 'As an action, cast {@spell Light|PHB}.'
  const xphb = 'As an action, cast {@spell Light|XPHB}.'
  first.feature!.entries = difference === 'printing' ? [phb] : [phb, xphb]
  later.feature!.entries = difference === 'printing' ? [xphb] : [xphb, phb]
  const actions = observe([makeClassFixture({ classFeatureRefs: [first, later] })])
  expect(actions).toHaveLength(2)
  expect(new Set(actions.map((action) => action.description)).size).toBe(1)
})

test('one unbound saved action retains its own ID when same-named earned rules resolve', () => {
  const classes = [makeClassFixture({ classFeatureRefs: [reference()] })]
  const canonical = observe(classes)[0].id
  const actions = observe(classes, true)
  expect(actions).toHaveLength(2)
  expect(actions[0]).toMatchObject({ id: 'feature:saved-shared', kind: 'bonus-action' })
  expect(actions[1]).toMatchObject({ id: canonical, kind: 'action' })
})

test('an ambiguous saved name hides neither independently earned owner', () => {
  const actions = observe(
    [
      makeClassFixture({ classFeatureRefs: [reference()] }),
      makeClassFixture({
        name: 'Bard',
        classFeatureRefs: [reference('Bard', 1, 'As a reaction, open a gate.')],
      }),
    ],
    true,
  )
  expect(actions.map((action) => action.kind)).toEqual(['bonus-action', 'action', 'reaction'])
})

test('multiple saved rows do not select an arbitrary canonical replacement', () => {
  const classes = [makeClassFixture({ classFeatureRefs: [reference()] })]
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    features: ['one', 'two'].map((id) => ({
      id,
      name: 'Shared',
      source: 'PHB',
      description: 'As an action, use training.',
    })),
  })
  const actions = createCharacterSheetViewModel(character, {
    classesByKey: buildClassLookup(classes),
  }).actions
  expect(actions.map((action) => action.id)).toEqual([
    'feature:one',
    'feature:two',
    observe(classes)[0].id,
  ])
})

test.each(['1', '8', '8junk', '0'])('subclass gains use the complete encoded level: %s', (gain) => {
  const classes = parseClasses({
    class: [{ name: 'Wizard', source: 'PHB', classFeatures: [] }],
    subclass: [
      {
        name: 'School',
        shortName: 'School',
        source: 'TCE',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatures: [`Shared|Wizard||School|TCE|${gain}`],
      },
    ],
    subclassFeature: [
      {
        name: 'Shared',
        source: 'TCE',
        className: 'Wizard',
        classSource: 'PHB',
        subclassShortName: 'School',
        subclassSource: 'TCE',
        level: 1,
        entries: ['As an action, use training.'],
      },
    ],
  }) as Class5e[]
  const character = makeCharacterFixture({
    features: [],
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 1, subclass: 'School', subclassSource: 'TCE' },
    ],
  })
  expect(
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
  ).toHaveLength(gain === '1' ? 1 : 0)
})

test('copied subclasses qualify identical encoded UIDs by their actual selected owner', () => {
  const classes = parseClasses({
    class: ['PHB', 'XPHB'].map((source) => ({ name: 'Wizard', source, classFeatures: [] })),
    subclass: ['PHB', 'XPHB'].map((classSource) => ({
      name: 'School',
      shortName: 'School',
      source: 'TCE',
      className: 'Wizard',
      classSource,
      subclassFeatures: ['Shared|Wizard||School|TCE|1'],
    })),
    subclassFeature: [
      {
        name: 'Shared',
        source: 'TCE',
        className: 'Wizard',
        classSource: 'PHB',
        subclassShortName: 'School',
        subclassSource: 'TCE',
        level: 1,
        entries: ['As an action, use training.'],
      },
    ],
  }) as Class5e[]
  const character = makeCharacterFixture({
    features: [],
    classProgression: classes.map((entry) => ({
      name: entry.name,
      source: entry.source,
      levels: 1,
      subclass: 'School',
      subclassSource: 'TCE',
    })),
  })
  const context = { classesByKey: buildClassLookup(classes) }
  const actions = createCharacterSheetViewModel(character, context).actions
  expect(actions).toHaveLength(2)
  expect(new Set(actions.map((action) => action.id)).size).toBe(2)
  expect(actions.map((action) => action.source.source)).toEqual(['TCE', 'TCE'])
  character.classProgression.pop()
  expect(createCharacterSheetViewModel(character, context).actions[0].id).toBe(actions[0].id)
})
