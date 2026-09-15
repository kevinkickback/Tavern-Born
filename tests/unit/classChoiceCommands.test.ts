import { describe, expect, test } from 'vitest'
import {
  applyClassChoiceSelectionCommand,
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelections,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { emptyProvenance } from '@/lib/character/createCharacter'
import type { NormalizedCharacterChoice } from '@/types/classRules'
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

  test('materializes feature selections with exact class-choice ownership', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Test Class', source: 'TEST', levels: 1 }],
      features: [],
    })
    const trainingPath = choice({
      id: 'class:test-class|test|choice:training-path|1',
      label: 'Training Path',
      kind: 'class-feature',
      owner: { type: 'class', name: 'Test Class', source: 'TEST' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [
        { entityType: 'classFeature', name: 'Guard Training', source: 'TEST' },
        { entityType: 'classFeature', name: 'Scholar Training', source: 'TEST' },
      ],
      optionFilter: undefined,
    })

    const first = applyClassChoiceSelectionWithGrantsCommand(
      character,
      emptyProvenance(),
      trainingPath,
      [{ entityType: 'classFeature', name: 'Guard Training', source: 'TEST' }],
    )
    expect(first.characterPatch.features).toEqual([
      expect.objectContaining({ name: 'Guard Training', source: 'TEST', level: 1 }),
    ])
    expect(first.provenanceUpdate.features['guard training']).toEqual([
      expect.objectContaining({
        sourceType: 'class',
        sourceName: 'Test Class',
        sourceRef: 'TEST',
        grantType: 'choice',
        grantVariant: trainingPath.id,
      }),
    ])

    const appliedCharacter = makeCharacterFixture({
      ...character,
      ...first.characterPatch,
      provenance: first.provenanceUpdate,
    })
    const replacement = applyClassChoiceSelectionWithGrantsCommand(
      appliedCharacter,
      first.provenanceUpdate,
      trainingPath,
      [{ entityType: 'classFeature', name: 'Scholar Training', source: 'TEST' }],
    )
    expect(replacement.characterPatch.features?.map((feature) => feature.name)).toEqual([
      'Scholar Training',
    ])
    expect(replacement.provenanceUpdate.features['guard training']).toBeUndefined()
    expect(replacement.provenanceUpdate.features['scholar training']).toHaveLength(1)
  })

  test('keeps item and feat choices source-qualified without inventing domain effects', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 1 }],
      features: [],
      feats: [],
      equipment: [],
    })
    const itemChoice = choice({
      id: 'class:fighter|xphb|choice:mastery|1',
      label: 'Mastery',
      kind: 'item',
      owner: { type: 'class', name: 'Fighter', source: 'XPHB' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [{ entityType: 'item', name: 'Training Weapon', source: 'TEST' }],
      optionFilter: undefined,
    })

    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      emptyProvenance(),
      itemChoice,
      itemChoice.options,
    )

    expect(result.characterPatch.classChoiceSelections?.[0]?.selected).toEqual([
      expect.objectContaining({
        entityType: 'item',
        name: 'Training Weapon',
        source: 'TEST',
      }),
    ])
    expect(result.characterPatch.features).toEqual([])
    expect(result.characterPatch.equipment).toBeUndefined()
    expect(result.provenanceUpdate.features).toEqual({})
    expect(result.provenanceUpdate.equipment).toEqual({})
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

  test('level-down reconciliation retracts generated features and their exact tags', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Test Class', source: 'TEST', levels: 10 }],
      features: [],
    })
    const trainingOptions = choice({
      id: 'class:test-class|test|choice:training-options|2',
      label: 'Training Options',
      owner: { type: 'class', name: 'Test Class', source: 'TEST' },
    })
    const applied = applyClassChoiceSelectionWithGrantsCommand(
      character,
      emptyProvenance(),
      trainingOptions,
      [
        { entityType: 'optionalFeature', name: 'Option A', source: 'TEST' },
        { entityType: 'optionalFeature', name: 'Option B', source: 'TEST' },
        { entityType: 'optionalFeature', name: 'Option C', source: 'TEST' },
        { entityType: 'optionalFeature', name: 'Option D', source: 'TEST' },
      ],
    )
    const appliedCharacter = makeCharacterFixture({
      ...character,
      ...applied.characterPatch,
      provenance: applied.provenanceUpdate,
    })
    const reconciled = applyClassProgressionUpdate(appliedCharacter, applied.provenanceUpdate, [
      { name: 'Test Class', source: 'TEST', levels: 2 },
    ])

    expect(reconciled.characterPatch.features?.map((feature) => feature.name)).toEqual([
      'Option A',
      'Option B',
    ])
    expect(reconciled.characterPatch.classChoiceSelections?.[0]?.selected).toHaveLength(2)
    expect(Object.keys(reconciled.provenanceUpdate.features).sort()).toEqual([
      'option a',
      'option b',
    ])
  })
})
