import { describe, expect, test } from 'vitest'
import {
  applyClassChoiceSelectionCommand,
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelections,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { addGrant, makeSourceTag } from '@/lib/provenance'
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

  test('preserves Warlock invocation acquisition levels when later choices are catalog-sorted', () => {
    const invocations = choice({
      id: 'class:warlock|phb|choice:eldritch-invocations|2',
      label: 'Eldritch Invocations',
      owner: {
        type: 'class',
        name: 'Warlock',
        source: 'PHB',
        featureName: 'Eldritch Invocations',
      },
      selectionCountByLevel: [0, 2, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8],
    })
    const levelTwo = makeCharacterFixture({
      class: 'Warlock',
      classSource: 'PHB',
      level: 2,
      classProgression: [{ name: 'Warlock', source: 'PHB', levels: 2 }],
    })
    const earlySelections = applyClassChoiceSelectionCommand(levelTwo, invocations, [
      { entityType: 'optionalFeature', name: "Devil's Sight", source: 'PHB' },
      { entityType: 'optionalFeature', name: 'Repelling Blast', source: 'PHB' },
    ]).classChoiceSelections
    const levelFive = makeCharacterFixture({
      ...levelTwo,
      level: 5,
      classProgression: [{ name: 'Warlock', source: 'PHB', levels: 5 }],
      classChoiceSelections: earlySelections,
    })

    const laterSelections = applyClassChoiceSelectionCommand(levelFive, invocations, [
      { entityType: 'optionalFeature', name: 'Agonizing Blast', source: 'PHB' },
      { entityType: 'optionalFeature', name: "Devil's Sight", source: 'PHB' },
      { entityType: 'optionalFeature', name: 'Repelling Blast', source: 'PHB' },
    ]).classChoiceSelections

    expect(laterSelections?.[0]?.selected).toEqual([
      expect.objectContaining({ name: 'Agonizing Blast', slotLevel: 5 }),
      expect.objectContaining({ name: "Devil's Sight", slotLevel: 2 }),
      expect.objectContaining({ name: 'Repelling Blast', slotLevel: 2 }),
    ])
    expect(
      reconcileClassChoiceSelections(laterSelections, [
        { name: 'Warlock', source: 'PHB', levels: 2 },
      ])[0]?.selected.map((option) => option.name),
    ).toEqual(["Devil's Sight", 'Repelling Blast'])
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

  test('migrates only the legacy optional-feature pool being edited', () => {
    const optionalChoice = choice({
      id: 'class:test-class|test|choice:first-pool|1',
      label: 'First Pool',
      owner: { type: 'class', name: 'Test Class', source: 'TEST' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
    })
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Test Class', source: 'TEST', levels: 1 }],
      features: [
        { id: 'legacy-a', name: 'Legacy A', source: 'TEST', description: '' },
        { id: 'legacy-b', name: 'Legacy B', source: 'TEST', description: '' },
      ],
    })
    let ledger = addGrant(
      emptyProvenance(),
      'features',
      'Legacy A',
      makeSourceTag('class', 'Test Class', 'choice', 'TEST'),
    )
    ledger = addGrant(
      ledger,
      'features',
      'Legacy B',
      makeSourceTag('class', 'Test Class', 'choice', 'TEST'),
    )

    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      ledger,
      optionalChoice,
      [{ entityType: 'optionalFeature', name: 'Replacement A', source: 'TEST' }],
      [{ entityType: 'optionalFeature', name: 'Legacy A', source: 'TEST' }],
    )

    expect(result.characterPatch.features?.map((feature) => feature.name).sort()).toEqual([
      'Legacy B',
      'Replacement A',
    ])
    expect(result.provenanceUpdate.features['legacy a']).toBeUndefined()
    expect(result.provenanceUpdate.features['legacy b']).toHaveLength(1)
    expect(result.provenanceUpdate.features['replacement a']).toEqual([
      expect.objectContaining({ grantVariant: optionalChoice.id }),
    ])
  })

  test('migrates class-granted feats and preserves their option-compatible mirror', () => {
    const featChoice = choice({
      id: 'class:test-class|test|choice:style-training|1',
      label: 'Style Training',
      kind: 'feat',
      owner: { type: 'class', name: 'Test Class', source: 'TEST' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      optionFilter: { entityType: 'feat', categories: ['STYLE'] },
    })
    const legacyChoice = {
      id: 'legacy-style-choice',
      className: 'Test Class',
      classSource: 'TEST',
      progressionName: 'Style Training',
      categories: ['STYLE'],
      feats: [
        {
          id: 'legacy-style-feat',
          name: 'Old Style',
          source: 'TEST',
          description: '',
          className: 'Test Class',
          classSource: 'TEST',
          classLevel: 1,
        },
      ],
    }
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Test Class', source: 'TEST', levels: 1 }],
      classFeatChoices: [legacyChoice],
    })
    const ledger = addGrant(emptyProvenance(), 'feats', 'Old Style', {
      ...makeSourceTag('class', 'Test Class', 'choice', 'TEST'),
      grantVariant: legacyChoice.id,
    })

    const result = applyClassChoiceSelectionWithGrantsCommand(character, ledger, featChoice, [
      { entityType: 'feat', name: 'New Style', source: 'TEST' },
    ])

    expect(result.characterPatch.classChoiceSelections?.[0]?.selected).toEqual([
      expect.objectContaining({ name: 'New Style', source: 'TEST', slotLevel: 1 }),
    ])
    expect(result.characterPatch.classFeatChoices).toEqual([
      expect.objectContaining({
        id: featChoice.id,
        progressionName: 'Style Training',
        feats: [expect.objectContaining({ name: 'New Style', classLevel: 1 })],
      }),
    ])
    expect(result.provenanceUpdate.feats['old style']).toBeUndefined()
    expect(result.provenanceUpdate.feats['new style']).toEqual([
      expect.objectContaining({ grantVariant: featChoice.id }),
    ])
  })

  test('preserves configured feat effects when legacy ownership is normalized', () => {
    const featChoice = choice({
      id: 'class:test-class|test|choice:style-training|1',
      label: 'Style Training',
      kind: 'feat',
      owner: { type: 'class', name: 'Test Class', source: 'TEST' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      optionFilter: { entityType: 'feat', categories: ['STYLE'] },
    })
    const legacyChoiceId = 'legacy-style-choice'
    const optionTag = {
      ...makeSourceTag('feat', 'Configurable Style', 'choice', 'TEST'),
      grantVariant: `class:${legacyChoiceId}`,
    }
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Test Class', source: 'TEST', levels: 1 }],
      classFeatChoices: [
        {
          id: legacyChoiceId,
          className: 'Test Class',
          classSource: 'TEST',
          progressionName: 'Style Training',
          categories: ['STYLE'],
          feats: [
            {
              id: 'legacy-configurable-style',
              name: 'Configurable Style',
              source: 'TEST',
              description: '',
              options: { skills: ['Athletics'] },
              className: 'Test Class',
              classSource: 'TEST',
              classLevel: 1,
            },
          ],
        },
      ],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
        skills: ['athletics'],
        savingThrows: [],
      },
    })
    let ledger = addGrant(emptyProvenance(), 'feats', 'Configurable Style', {
      ...makeSourceTag('class', 'Test Class', 'choice', 'TEST'),
      grantVariant: legacyChoiceId,
    })
    ledger = addGrant(ledger, 'skills', 'Athletics', optionTag)

    const result = applyClassChoiceSelectionWithGrantsCommand(character, ledger, featChoice, [
      { entityType: 'feat', name: 'Configurable Style', source: 'TEST' },
    ])

    expect(result.characterPatch.classFeatChoices?.[0]?.feats[0]?.options).toEqual({
      skills: ['Athletics'],
    })
    expect(result.characterPatch.proficiencies?.skills).toEqual(['athletics'])
    expect(result.provenanceUpdate.feats['configurable style']).toEqual([
      expect.objectContaining({ grantVariant: featChoice.id }),
    ])
    expect(result.provenanceUpdate.proficiencies.skills.athletics).toEqual([
      expect.objectContaining({ grantVariant: `class:${featChoice.id}` }),
    ])
  })
})
