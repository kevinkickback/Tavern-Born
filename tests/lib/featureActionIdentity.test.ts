import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveCharacterActions, deriveRulesTextActions } from '@/lib/calculations/actions'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { Class5e, ClassFeatureReference } from '@/types/5etools'
import { characterSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function reference(owner: string, level: number, description: string): ClassFeatureReference {
  return {
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
  }
}

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
      levels: classes.length > 1 ? 2 : 17,
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

describe('automatic feature action ownership', () => {
  test('bundled Fighter repeated Action Surge gains project once and retract below eligibility', () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'resources/srd/core/data/class/class-fighter.json'),
        'utf8',
      ),
    )
    const fighter = (parseClasses(raw) as Class5e[]).find(
      (entry) => entry.name === 'Fighter' && entry.source === 'XPHB',
    )!
    const gains = fighter.classFeatureRefs!.filter((ref) => ref.name === 'Action Surge')
    expect(gains.map((ref) => ref.level)).toEqual([2, 17])
    const character = makeCharacterFixture({
      features: [],
      classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 17 }],
    })
    const context = { classesByKey: buildClassLookup([fighter]) }
    const actions = createCharacterSheetViewModel(character, context).actions.filter(
      (action) => action.name === 'Action Surge',
    )
    expect(actions).toHaveLength(1)
    expect(actions[0].id).toBe(`class-feature:${encodeURIComponent(gains[0].ref)}`)
    const group = planSheetContent(
      createCharacterSheetViewModel(character, context),
      '2014-custom',
      {
        action: [`class-feature:${encodeURIComponent(gains[1].ref)}`],
      },
    ).groups.find((entry) => entry.id === 'action')!
    expect(group.automatic).toBe(false)
    expect(group.selected).toEqual([actions[0].id])
    character.classProgression![0].levels = 1
    expect(
      createCharacterSheetViewModel(character, context).actions.some(
        (action) => action.name === 'Action Surge',
      ),
    ).toBe(false)
  })
  function aliasFixture() {
    const first = reference('Wizard', 1, 'As an action, use the shared training.')
    const alias = {
      ...first,
      ref: ' shared | WIZARD | phb | 1 | PHB | Display alias',
      feature: { ...first.feature!, name: ' shared ', source: 'phb' },
    }
    const classes = [makeClassFixture({ classFeatureRefs: [first, alias] })]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    return { first, alias, classes, character }
  }
  test('complete UID casing, defaults and display aliases collapse to one compatible action', () => {
    const { first, classes, character } = aliasFixture()
    const actions = deriveRulesTextActions(character, undefined, { classes })
    expect(actions).toHaveLength(1)
    expect(actions[0].id).toBe(`class-feature:${encodeURIComponent(first.ref)}`)
  })
  test('a manual override referring to a non-first canonical alias overrides the one derived action', () => {
    const { alias, classes, character } = aliasFixture()
    character.manualActions = [
      {
        id: `class-feature:${encodeURIComponent(alias.ref)}`,
        name: 'My shared training',
        kind: 'reaction',
        description: 'My override.',
        source: { kind: 'manual', name: 'My shared training' },
        active: true,
      },
    ]
    const actions = deriveCharacterActions(character, {
      classes,
      abilityModifiers: {
        strength: 0,
        dexterity: 0,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
    })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject(character.manualActions[0])
    expect(
      createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
    ).toEqual(actions)
  })
  test('a PDF choice referring to the non-first canonical alias remains an explicit selection', () => {
    const { alias, classes, character } = aliasFixture()
    const vm = createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) })
    const plan = planSheetContent(vm, '2014-custom', {
      action: [`class-feature:${encodeURIComponent(alias.ref)}`],
    })
    const group = plan.groups.find((entry) => entry.id === 'action')!
    expect(group.automatic).toBe(false)
    expect(group.selected).toHaveLength(1)
  })

  test('a complete saved alias still resolves after the catalog changes its UID spelling', () => {
    const { classes, character } = aliasFixture()
    classes[0].classFeatureRefs = classes[0].classFeatureRefs!.slice(0, 1)
    const savedId = `class-feature:${encodeURIComponent(' shared | WIZARD | PHB | 1 | | Old display')}`
    const vm = createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) })
    const group = planSheetContent(vm, '2014-custom', { action: [savedId] }).groups.find(
      (entry) => entry.id === 'action',
    )!
    expect(group.automatic).toBe(false)
    expect(group.selected).toEqual([vm.actions[0].id])
    character.manualActions = [
      {
        id: savedId,
        name: 'Saved override',
        kind: 'action',
        description: 'Override rules.',
        source: { kind: 'manual', name: 'Saved override' },
        active: false,
      },
    ]
    expect(
      createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
    ).toMatchObject([{ id: savedId, active: false, name: 'Saved override' }])
  })

  test('override edits and Clear survive strict reopen, unavailable data and restoration', () => {
    const { alias, classes, character } = aliasFixture()
    Object.assign(
      character,
      upsertManualActionCommand(character, {
        id: `class-feature:${encodeURIComponent(alias.ref)}`,
        name: 'My training',
        kind: 'action',
        description: 'Override.',
        source: { kind: 'manual', name: 'My training' },
        active: false,
      }),
    )
    const reopened = characterSchema.parse(JSON.parse(JSON.stringify(character)))
    const missing = createCharacterSheetViewModel(reopened, {}).actions
    expect(missing).toMatchObject([{ name: 'My training', active: false }])
    const restored = createCharacterSheetViewModel(reopened, {
      classesByKey: buildClassLookup(classes),
    }).actions
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ name: 'My training', active: false })
    Object.assign(reopened, removeManualActionCommand(reopened, restored[0].id))
    const cleared = characterSchema.parse(JSON.parse(JSON.stringify(reopened)))
    expect(
      createCharacterSheetViewModel(cleared, { classesByKey: buildClassLookup(classes) }).actions,
    ).toMatchObject([{ name: 'Shared', active: true, source: { kind: 'class' } }])
    expect(character).not.toHaveProperty('featureIdentities')
  })

  test('ambiguous legacy IDs neither override nor select one of multiple no-UID owners', () => {
    const classes = ['Wizard', 'Bard'].map((owner) => {
      const ref = reference(owner, 1, 'As an action, use this training.')
      ref.ref = ''
      return makeClassFixture({ name: owner, classFeatureRefs: [ref] })
    })
    const character = makeCharacterFixture({
      features: [],
      classProgression: classes.map((entry) => ({
        name: entry.name,
        source: entry.source,
        levels: 1,
      })),
    })
    const context = { classesByKey: buildClassLookup(classes) }
    const vm = createCharacterSheetViewModel(character, context)
    expect(vm.actions).toHaveLength(2)
    expect(new Set(vm.actions.map((action) => action.id)).size).toBe(2)
    const legacyId = 'class-feature:Shared%7CPHB'
    const group = planSheetContent(vm, '2014-custom', { action: [legacyId] }).groups.find(
      (entry) => entry.id === 'action',
    )!
    expect(group.automatic).toBe(true)
    character.manualActions = [
      {
        id: legacyId,
        name: 'Ambiguous manual entry',
        kind: 'reaction',
        description: 'Manual rules.',
        source: { kind: 'manual', name: 'Ambiguous manual entry' },
        active: true,
      },
    ]
    expect(createCharacterSheetViewModel(character, context).actions).toHaveLength(3)
  })

  test.each([
    '',
    undefined,
  ])('keeps a unique no-UID ID when the materialized source is defaulted: %j', (source) => {
    const ref = reference('Wizard', 1, 'As an action, use this training.')
    ref.ref = ''
    ref.feature!.source = source as string
    const actions = observe([makeClassFixture({ classFeatureRefs: [ref] })])
    expect(actions).toMatchObject([{ id: 'class-feature:Shared%7C', source: { source: 'PHB' } }])
  })

  test.each([
    false,
    true,
  ])('a unique saved action retains earned overrides across handoff (override first: %s)', (overrideFirst) => {
    const { first, character, classes } = aliasFixture()
    const context = { classesByKey: buildClassLookup(classes) }
    const issued = `class-feature:${encodeURIComponent(first.ref)}`
    const manual = {
      id: issued,
      name: 'My training',
      kind: 'action' as const,
      description: 'Player rules.',
      source: { kind: 'manual' as const, name: 'My training' },
      active: false,
    }
    if (overrideFirst) Object.assign(character, upsertManualActionCommand(character, manual))
    character.features = [
      {
        id: 'saved-shared',
        name: 'Shared',
        source: 'PHB',
        description: 'As an action, use saved training.',
      },
    ]
    if (!overrideFirst) {
      const vm = createCharacterSheetViewModel(character, context)
      expect(
        planSheetContent(vm, '2014-custom', { action: [issued] }).groups.find(
          (entry) => entry.id === 'action',
        )?.automatic,
      ).toBe(false)
      Object.assign(character, upsertManualActionCommand(character, manual))
    }
    const reopened = characterSchema.parse(JSON.parse(JSON.stringify(character)))
    expect(createCharacterSheetViewModel(reopened, context).actions).toMatchObject([
      { id: issued, active: false },
    ])
    reopened.features = []
    expect(createCharacterSheetViewModel(reopened, context).actions).toMatchObject([
      { id: issued, active: false },
    ])
    Object.assign(reopened, removeManualActionCommand(reopened, issued))
    expect(createCharacterSheetViewModel(reopened, context).actions).toMatchObject([
      { active: true, source: { kind: 'class' } },
    ])
  })

  test('multiple saved actions cannot assign an earned UID override to an arbitrary saved row', () => {
    const { first, character, classes } = aliasFixture()
    character.features = ['one', 'two'].map((id) => ({
      id,
      name: 'Shared',
      source: 'PHB',
      description: 'As an action, use saved training.',
    }))
    const issued = `class-feature:${encodeURIComponent(first.ref)}`
    character.manualActions = [
      {
        id: issued,
        name: 'Unassigned override',
        kind: 'action',
        description: 'Manual rules.',
        source: { kind: 'manual', name: 'Unassigned override' },
        active: false,
      },
    ]
    const vm = createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) })
    expect(vm.actions.map((action) => action.active)).toEqual([true, true, false])
    expect(vm.actions.map((action) => action.id)).toEqual(['feature:one', 'feature:two', issued])
  })

  test('qualified copied-subclass IDs survive canonical owner short-name refresh', () => {
    const { character, classes, context } = collidingFixture('subclass')
    const issued = createCharacterSheetViewModel(character, context).actions[0].id
    classes[0].subclasses![0].shortName = ' school '
    const vm = createCharacterSheetViewModel(character, context)
    expect(vm.actions).toHaveLength(2)
    expect(
      planSheetContent(vm, '2014-custom', { action: [issued] }).groups.find(
        (entry) => entry.id === 'action',
      )?.automatic,
    ).toBe(false)
    character.manualActions = [
      {
        id: issued,
        name: 'My school',
        kind: 'action',
        description: 'Player rules.',
        source: { kind: 'manual', name: 'My school' },
        active: false,
      },
    ]
    const after = createCharacterSheetViewModel(
      characterSchema.parse(JSON.parse(JSON.stringify(character))),
      context,
    ).actions
    expect(after).toHaveLength(2)
    expect(after[0]).toMatchObject({ id: issued, active: false })
  })

  function collidingFixture(kind: 'owner' | 'gain' | 'subclass') {
    const first = reference('Wizard', 1, 'As an action, light a beacon.')
    const other = reference(kind === 'gain' ? 'Wizard' : 'Bard', 2, 'As an action, open a gate.')
    first.ref = ''
    other.ref = ''
    const classes =
      kind === 'subclass'
        ? (parseClasses({
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
                entries: ['As an action, use the school.'],
              },
            ],
          }) as Class5e[])
        : kind === 'owner'
          ? [
              makeClassFixture({ classFeatureRefs: [first] }),
              makeClassFixture({ name: 'Bard', classFeatureRefs: [other] }),
            ]
          : [makeClassFixture({ classFeatureRefs: [first, other] })]
    const character = makeCharacterFixture({
      features: [],
      classProgression: classes.map((entry) => ({
        name: entry.name,
        source: entry.source,
        levels: 2,
        ...(kind === 'subclass' ? { subclass: 'School', subclassSource: 'TCE' } : {}),
      })),
    })
    return { character, classes, context: { classesByKey: buildClassLookup(classes) } }
  }

  test.each([
    'owner',
    'gain',
    'subclass',
  ] as const)('issued qualified IDs survive competing %s removal in overrides and PDF choices', (competitor) => {
    const { character, context } = collidingFixture(competitor)
    const before = createCharacterSheetViewModel(character, context)
    expect(before.actions).toHaveLength(2)
    const issued = before.actions[0].id
    if (competitor === 'gain') character.classProgression![0].levels = 1
    else character.classProgression = character.classProgression!.slice(0, 1)
    const vm = createCharacterSheetViewModel(character, context)
    const group = planSheetContent(vm, '2014-custom', { action: [issued] }).groups.find(
      (entry) => entry.id === 'action',
    )!
    expect(group.automatic).toBe(false)
    expect(group.selected).toEqual([vm.actions[0].id])
    Object.assign(
      character,
      upsertManualActionCommand(character, {
        id: issued,
        name: 'My training',
        kind: 'action',
        description: 'Player rules.',
        source: { kind: 'manual', name: 'My training' },
        active: false,
      }),
    )
    const reopened = characterSchema.parse(JSON.parse(JSON.stringify(character)))
    expect(createCharacterSheetViewModel(reopened, context).actions).toMatchObject([
      { id: issued, active: false },
    ])
    Object.assign(reopened, removeManualActionCommand(reopened, issued))
    expect(createCharacterSheetViewModel(reopened, context).actions).toMatchObject([
      { active: true },
    ])
  })

  test('a qualified override for a removed owner cannot hide the surviving owner', () => {
    const { character, context } = collidingFixture('owner')
    const issued = createCharacterSheetViewModel(character, context).actions[0].id
    character.manualActions = [
      {
        id: issued,
        name: 'Removed owner override',
        kind: 'action',
        description: 'Manual rules.',
        source: { kind: 'manual', name: 'Removed owner override' },
        active: false,
      },
    ]
    character.classProgression = character.classProgression!.slice(1)
    expect(
      createCharacterSheetViewModel(
        characterSchema.parse(JSON.parse(JSON.stringify(character))),
        context,
      ).actions,
    ).toMatchObject([
      { active: true, source: { kind: 'class' } },
      { id: issued, active: false },
    ])
  })

  test('a unique no-UID override and PDF choice survive canonical materialized spelling refresh', () => {
    const ref = reference('Wizard', 1, 'As an action, use the training.')
    ref.ref = ''
    const classes = [makeClassFixture({ classFeatureRefs: [ref] })]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    const context = { classesByKey: buildClassLookup(classes) }
    const issued = createCharacterSheetViewModel(character, context).actions[0].id
    ref.feature!.name = ' shared '
    ref.feature!.source = 'phb'
    const vm = createCharacterSheetViewModel(character, context)
    expect(
      planSheetContent(vm, '2014-custom', { action: [issued] }).groups.find(
        (entry) => entry.id === 'action',
      )?.automatic,
    ).toBe(false)
    character.manualActions = [
      {
        id: issued,
        name: 'My training',
        kind: 'action',
        description: 'Manual rules.',
        source: { kind: 'manual', name: 'My training' },
        active: false,
      },
    ]
    expect(
      createCharacterSheetViewModel(
        characterSchema.parse(JSON.parse(JSON.stringify(character))),
        context,
      ).actions,
    ).toMatchObject([{ id: issued, active: false }])
  })

  test('a later repeated gain override and PDF selection address the same one action', () => {
    const entries = 'As an action, use this training. At level 17 you can use it twice.'
    const classes = [
      makeClassFixture({
        classFeatureRefs: [reference('Wizard', 1, entries), reference('Wizard', 17, entries)],
      }),
    ]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 17 }],
    })
    const context = { classesByKey: buildClassLookup(classes) }
    const laterId = `class-feature:${encodeURIComponent('Shared|Wizard||17')}`
    const vm = createCharacterSheetViewModel(character, context)
    const group = planSheetContent(vm, '2014-custom', { action: [laterId] }).groups.find(
      (entry) => entry.id === 'action',
    )!
    expect(group.automatic).toBe(false)
    expect(group.selected).toHaveLength(1)
    character.manualActions = [
      {
        id: laterId,
        name: 'Repeated override',
        kind: 'action',
        description: 'Override rules.',
        source: { kind: 'manual', name: 'Repeated override' },
        active: true,
      },
    ]
    expect(createCharacterSheetViewModel(character, context).actions).toMatchObject([
      { id: laterId },
    ])
    character.classProgression![0].levels = 1
    expect(createCharacterSheetViewModel(character, context).actions).toHaveLength(2)
  })

  test('class and selected subclass actions with the same name keep separate identities', () => {
    const feature = reference('Wizard', 1, 'As an action, use the class training.')
    const classes = [
      makeClassFixture({
        classFeatureRefs: [feature],
        subclasses: [
          {
            name: 'School',
            shortName: 'School',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            subclassFeatureRefs: [
              {
                ...feature,
                ref: 'Shared|Wizard||School||1',
                subclassShortName: 'School',
                subclassSource: 'PHB',
                feature: {
                  ...feature.feature!,
                  entries: ['As a reaction, use the school training.'],
                },
              },
            ],
          },
        ],
      }),
    ]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 1, subclass: 'School', subclassSource: 'PHB' },
      ],
    })
    expect(
      deriveRulesTextActions(character, undefined, { classes }).map((action) => action.kind),
    ).toEqual(['action', 'reaction'])
    character.classProgression![0].subclass = undefined
    expect(deriveRulesTextActions(character, undefined, { classes })).toHaveLength(1)
  })

  test('different feature printings remain independent even with identical entries', () => {
    const first = reference('Wizard', 1, 'As an action, use this training.')
    const second = {
      ...first,
      ref: 'Shared|Wizard||1|TCE',
      source: 'TCE',
      feature: { ...first.feature!, source: 'TCE' },
    }
    expect(
      observe([makeClassFixture({ classFeatureRefs: [first, second] })]).map(
        (action) => action.source.source,
      ),
    ).toEqual(['PHB', 'TCE'])
  })

  test('copied subclasses retain their original class-printing feature UID', () => {
    const classes = parseClasses({
      class: [{ name: 'Wizard', source: 'XPHB', classFeatures: [] }],
      subclass: [
        {
          name: 'School',
          shortName: 'School',
          source: 'TCE',
          className: 'Wizard',
          classSource: 'XPHB',
          subclassFeatures: ['School training|Wizard||School|TCE|1'],
        },
      ],
      subclassFeature: [
        {
          name: 'School training',
          source: 'TCE',
          className: 'Wizard',
          classSource: 'PHB',
          subclassShortName: 'School',
          subclassSource: 'TCE',
          level: 1,
          entries: ['As a reaction, use the school training.'],
        },
      ],
    }) as Class5e[]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [
        { name: 'Wizard', source: 'XPHB', levels: 1, subclass: 'School', subclassSource: 'TCE' },
      ],
    })
    expect(deriveRulesTextActions(character, undefined, { classes })).toMatchObject([
      { kind: 'reaction', source: { source: 'TCE' } },
    ])
  })
  test('an earlier passive reference cannot hide different later action mechanics', () => {
    const actions = observe([
      makeClassFixture({
        classFeatureRefs: [
          reference('Wizard', 1, 'A passive benefit.'),
          reference('Wizard', 2, 'As an action, open a gate.'),
        ],
      }),
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0].description).toBe('As an action, open a gate.')
  })
  test.each([
    { encoded: '8', metadata: 1, current: 1, count: 0 },
    { encoded: '1', metadata: 8, current: 1, count: 1 },
    { encoded: '8junk', metadata: 1, current: 1, count: 0 },
    { encoded: '8', metadata: 8, current: 8, count: 1 },
  ])('subclass gain identity uses its complete encoded layout: %j', ({
    encoded,
    metadata,
    current,
    count,
  }) => {
    const classes = [
      makeClassFixture({
        classFeatureRefs: [],
        subclasses: [
          {
            name: 'School',
            shortName: 'School',
            source: 'TCE',
            className: 'Wizard',
            classSource: 'PHB',
            subclassFeatureRefs: [
              {
                ref: `Shared|Wizard||School|TCE|${encoded}|TCE`,
                name: 'Shared',
                source: 'TCE',
                className: 'Wizard',
                classSource: 'PHB',
                subclassShortName: 'School',
                subclassSource: 'TCE',
                level: metadata,
                feature: {
                  name: 'Shared',
                  source: 'TCE',
                  level: metadata,
                  entries: ['As a reaction, use the school.'],
                },
              },
            ],
          },
        ],
      }),
    ]
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Wizard',
          source: 'PHB',
          levels: current,
          subclass: 'School',
          subclassSource: 'TCE',
        },
      ],
    })
    const before = structuredClone({ character, classes })
    const actions = deriveRulesTextActions(character, undefined, { classes })
    expect(
      createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
    ).toEqual(actions)
    expect({ character, classes }).toEqual(before)
    expect(actions).toHaveLength(count)
  })
  test('distinct class owners retain independently earned action and reaction', () => {
    const actions = observe([
      makeClassFixture({
        name: 'Wizard',
        classFeatureRefs: [reference('Wizard', 1, 'As an action, use Wizard training.')],
      }),
      makeClassFixture({
        name: 'Bard',
        classFeatureRefs: [reference('Bard', 1, 'As a reaction, use Bard training.')],
      }),
    ])
    expect(actions.map((action) => action.kind)).toEqual(['action', 'reaction'])
  })
  test('different gain-level mechanics remain independent', () => {
    const actions = observe([
      makeClassFixture({
        classFeatureRefs: [
          reference('Wizard', 1, 'As an action, light the first beacon.'),
          reference('Wizard', 2, 'As an action, open the second gate.'),
        ],
      }),
    ])
    expect(actions).toHaveLength(2)
  })
  test('ambiguous stored name does not hide every complete earned owner', () => {
    const actions = observe(
      [
        makeClassFixture({
          name: 'Wizard',
          classFeatureRefs: [reference('Wizard', 1, 'As an action, use Wizard training.')],
        }),
        makeClassFixture({
          name: 'Bard',
          classFeatureRefs: [reference('Bard', 1, 'As a reaction, use Bard training.')],
        }),
      ],
      true,
    )
    expect(actions.map((action) => action.kind)).toEqual(['bonus-action', 'action', 'reaction'])
  })
  test('identical parsed action mechanics repeated at a later level keep one compatible action ID', () => {
    const description = 'As an action, open the gate. At level 17, you can use this twice.'
    const actions = observe([
      makeClassFixture({
        classFeatureRefs: [
          reference('Wizard', 1, description),
          reference('Wizard', 17, description),
        ],
      }),
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0].id).toBe(`class-feature:${encodeURIComponent('Shared|Wizard||1')}`)
  })
})
