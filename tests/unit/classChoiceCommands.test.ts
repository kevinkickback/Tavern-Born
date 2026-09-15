import { describe, expect, test } from 'vitest'
import type { NormalizedCharacterChoice } from '@/lib/5etools/classChoiceNormalization'
import {
  applyClassChoiceSelectionCommand,
  reconcileClassChoiceSelections,
} from '@/lib/character/commands/classChoiceCommands'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function choice(overrides: Partial<NormalizedCharacterChoice> = {}): NormalizedCharacterChoice {
  return {
    id: 'class:sorcerer|xphb|choice:metamagic|2',
    label: 'Metamagic',
    kind: 'optional-feature',
    owner: { type: 'class', name: 'Sorcerer', source: 'XPHB', featureName: 'Metamagic' },
    level: 2,
    minimumSelections: 6,
    maximumSelections: 6,
    selectionCountByLevel: [0, 2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6],
    options: [],
    optionFilter: { entityType: 'optionalFeature', featureTypes: ['MM'] },
    repeatable: false,
    replacement: { cadence: 'class-level', maximumPerEvent: 1 },
    source: { kind: 'optional-feature-progression', field: 'optionalfeatureProgression[0]' },
    ...overrides,
  }
}

describe('class choice commands', () => {
  test('persists source-qualified selections with deterministic acquisition levels', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Sorcerer', source: 'XPHB', levels: 10 }],
    })
    const patch = applyClassChoiceSelectionCommand(character, choice(), [
      { entityType: 'optionalFeature', name: 'Careful Spell', source: 'XPHB' },
      { entityType: 'optionalFeature', name: 'Quickened Spell', source: 'XPHB' },
      { entityType: 'optionalFeature', name: 'Subtle Spell', source: 'XPHB' },
      { entityType: 'optionalFeature', name: 'Twinned Spell', source: 'XPHB' },
    ])

    expect(patch.classChoiceSelections?.[0]).toMatchObject({
      choiceId: 'class:sorcerer|xphb|choice:metamagic|2',
      className: 'Sorcerer',
      classSource: 'XPHB',
      selected: [
        { name: 'Careful Spell', source: 'XPHB', slotLevel: 2 },
        { name: 'Quickened Spell', source: 'XPHB', slotLevel: 2 },
        { name: 'Subtle Spell', source: 'XPHB', slotLevel: 10 },
        { name: 'Twinned Spell', source: 'XPHB', slotLevel: 10 },
      ],
    })
  })

  test('allows incomplete drafts but rejects excess and duplicate selections', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Sorcerer', source: 'XPHB', levels: 2 }],
    })
    expect(
      applyClassChoiceSelectionCommand(character, choice(), [
        { entityType: 'optionalFeature', name: 'Careful Spell', source: 'XPHB' },
      ]).classChoiceSelections?.[0]?.selected,
    ).toHaveLength(1)
    expect(() =>
      applyClassChoiceSelectionCommand(character, choice(), [
        { entityType: 'optionalFeature', name: 'A' },
        { entityType: 'optionalFeature', name: 'B' },
        { entityType: 'optionalFeature', name: 'C' },
      ]),
    ).toThrow(/allows 2 selections/i)
    expect(() =>
      applyClassChoiceSelectionCommand(character, choice(), [
        { entityType: 'optionalFeature', name: 'A' },
        { entityType: 'optionalFeature', name: 'A' },
      ]),
    ).toThrow(/duplicate/i)
  })

  test('validates explicit option references including source identity', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Cleric', source: 'XPHB', levels: 1 }],
    })
    const divineOrder = choice({
      id: 'class:cleric|xphb|choice:divine-order|1',
      label: 'Divine Order',
      kind: 'class-feature',
      owner: { type: 'class', name: 'Cleric', source: 'XPHB' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [
        { entityType: 'classFeature', name: 'Protector', source: 'XPHB' },
        { entityType: 'classFeature', name: 'Thaumaturge', source: 'XPHB' },
      ],
      optionFilter: undefined,
    })

    expect(() =>
      applyClassChoiceSelectionCommand(character, divineOrder, [
        { entityType: 'classFeature', name: 'Protector', source: 'HB' },
      ]),
    ).toThrow(/not available/i)
  })

  test('level-down and class removal retract only slots no longer owned', () => {
    const selections = applyClassChoiceSelectionCommand(
      makeCharacterFixture({
        classProgression: [
          { name: 'Sorcerer', source: 'XPHB', levels: 10 },
          { name: 'Fighter', source: 'PHB', levels: 1 },
        ],
      }),
      choice(),
      [
        { entityType: 'optionalFeature', name: 'A' },
        { entityType: 'optionalFeature', name: 'B' },
        { entityType: 'optionalFeature', name: 'C' },
        { entityType: 'optionalFeature', name: 'D' },
      ],
    ).classChoiceSelections

    const reduced = reconcileClassChoiceSelections(selections, [
      { name: 'Sorcerer', source: 'XPHB', levels: 2 },
      { name: 'Fighter', source: 'PHB', levels: 1 },
    ])
    expect(reduced[0]?.selected.map((option) => option.name)).toEqual(['A', 'B'])
    expect(
      reconcileClassChoiceSelections(reduced, [{ name: 'Fighter', source: 'PHB', levels: 1 }]),
    ).toEqual([])
  })
})
