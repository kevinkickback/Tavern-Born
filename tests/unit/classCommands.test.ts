import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  addMulticlass,
  applyClassEquipmentChoiceCommand,
  applyClassProgressionUpdate,
  applyClassSelectionCommand,
  applyLevelUp,
  removeMulticlass,
  selectBaseClass,
  selectSubclass,
  updateCharacterLevel,
} from '@/lib/character/commands/classCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('Class Commands', () => {
  test('selectBaseClass updates top-level class fields and progression', () => {
    const character = makeCharacterFixture({
      class: '',
      classSource: '',
      classProgression: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
        skills: [],
        savingThrows: [],
      },
    })

    const ledger = character.provenance ?? emptyProvenance()

    const result = selectBaseClass(
      character,
      ledger,
      'Wizard',
      {
        name: 'Wizard',
        source: 'PHB',
        startingProficiencies: {
          armor: [],
          weapons: ['dagger'],
          tools: [],
          skills: [],
        },
      } as never,
      'PHB',
    )

    expect(result.characterPatch.class).toBe('Wizard')
    expect(result.characterPatch.classProgression?.[0]?.name).toBe('Wizard')
  })

  test('selectSubclass updates subclass fields', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()

    const result = selectSubclass(character, ledger, 'Evocation', 'PHB')
    expect(result.characterPatch.subclass).toBe('Evocation')
    expect(result.characterPatch.subclassSource).toBe('PHB')
  })

  test('selectSubclass updates viewing class entry in progression without overriding top-level subclass for other classes', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      subclass: 'Evocation',
      subclassSource: 'PHB',
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 5, subclass: 'Evocation', subclassSource: 'PHB' },
        { name: 'Fighter', source: 'PHB', levels: 3 },
      ],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const viewingEntry = character.classProgression![1]
    const result = selectSubclass(character, ledger, 'Battle Master', 'PHB', undefined, {
      classProgression: character.classProgression,
      viewingEntry,
    })

    expect(result.characterPatch.classProgression?.[1]?.subclass).toBe('Battle Master')
    expect(result.characterPatch.classProgression?.[1]?.subclassSource).toBe('PHB')
    expect(result.characterPatch.subclass).toBeUndefined()
    expect(result.characterPatch.subclassSource).toBeUndefined()
  })

  test('updateCharacterLevel updates primary class level', () => {
    const character = makeCharacterFixture({
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = updateCharacterLevel(character, ledger, 4)

    expect(result.characterPatch.level).toBe(4)
    expect(result.characterPatch.classProgression?.[0]?.levels).toBe(4)
  })

  test('addMulticlass adds a second class entry', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      proficiencies: {
        armor: [],
        weapons: ['dagger'],
        tools: [],
        languages: [],
        skills: [],
        savingThrows: [],
      },
    })

    const ledger = character.provenance ?? emptyProvenance()

    const result = addMulticlass(
      character,
      ledger,
      'Fighter',
      {
        name: 'Fighter',
        source: 'PHB',
        startingProficiencies: {
          armor: ['light armor'],
          weapons: ['simple weapons'],
          tools: [],
          skills: [],
        },
      } as never,
      'PHB',
      1,
    )

    expect(result.characterPatch.classProgression).toHaveLength(2)
    expect(result.characterPatch.classProgression?.[1]?.name).toBe('Fighter')
  })

  test('addMulticlass permits a source-distinct printing but rejects an exact duplicate', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })
    const ledger = character.provenance ?? emptyProvenance()
    const xphbWizard = { name: 'Wizard', source: 'XPHB' } as never

    const result = addMulticlass(character, ledger, 'Wizard', xphbWizard, 'XPHB')

    expect(result.characterPatch.classProgression).toEqual([
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Wizard', source: 'XPHB', levels: 1 },
    ])
    expect(() => addMulticlass(character, ledger, 'Wizard', xphbWizard, 'PHB')).toThrow(
      'Cannot add duplicate class',
    )
  })

  test('addMulticlass preserves an explicit empty source for progression and grants', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    })
    const ledger = character.provenance ?? emptyProvenance()
    const result = addMulticlass(
      character,
      ledger,
      'Wizard',
      {
        name: 'Wizard',
        source: 'XPHB',
        multiclassing: { proficienciesGained: { armor: ['light armor'] } },
      } as never,
      '',
    )

    expect(result.characterPatch.classProgression?.[1]?.source).toBe('')
    expect(result.provenanceUpdate.proficiencies.armor['light armor']?.[0]?.sourceRef).toBe('')
  })

  test('removeMulticlass removes secondary class entry', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = removeMulticlass(character, ledger, 'Fighter')

    expect(result.characterPatch.classProgression).toHaveLength(1)
    expect(result.characterPatch.classProgression?.[0]?.name).toBe('Wizard')
  })

  test('removeMulticlass removes only the requested source printing', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'XPHB', levels: 1 },
      ],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = removeMulticlass(character, ledger, 'Wizard', 'XPHB')

    expect(result.characterPatch.classProgression).toEqual([
      { name: 'Wizard', source: 'PHB', levels: 3 },
    ])
  })

  test('applyClassProgressionUpdate syncs total level and top-level class fields', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = applyClassProgressionUpdate(character, ledger, [
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Fighter', source: 'PHB', levels: 1 },
    ])

    expect(result.characterPatch.level).toBe(4)
    expect(result.characterPatch.class).toBe('Wizard')
    expect(result.characterPatch.classSource).toBe('PHB')
    expect(result.characterPatch.classProgression).toHaveLength(2)
  })

  test('applyLevelUp records the raw die result with the progression update', () => {
    const character = makeCharacterFixture({
      level: 1,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      hitPointGains: [],
    })
    const ledger = character.provenance ?? emptyProvenance()
    const result = applyLevelUp(
      character,
      ledger,
      [{ name: 'Fighter', source: 'PHB', levels: 2 }],
      {
        className: 'Fighter',
        classSource: 'PHB',
        classLevel: 2,
        hitDie: 10,
        dieResult: 7,
        method: 'manual',
      },
    )

    expect(result.characterPatch.level).toBe(2)
    expect(result.characterPatch.hitPointGains).toEqual([
      expect.objectContaining({
        className: 'Fighter',
        classLevel: 2,
        characterLevel: 2,
        dieResult: 7,
        method: 'manual',
      }),
    ])
  })

  test('level removal prunes its persisted hit-point gain', () => {
    const character = makeCharacterFixture({
      level: 2,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
      hitPointGains: [
        {
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: 2,
          characterLevel: 2,
          hitDie: 10,
          dieResult: 7,
          method: 'rolled',
        },
      ],
    })
    const result = applyClassProgressionUpdate(
      character,
      character.provenance ?? emptyProvenance(),
      [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    )

    expect(result.characterPatch.hitPointGains).toEqual([])
  })

  test('level removal retracts ASIs that are no longer earned', () => {
    const character = makeCharacterFixture({
      level: 4,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      asiChoices: [
        {
          id: 'wizard|PHB|4',
          level: 4,
          className: 'Wizard',
          classSource: 'PHB',
          abilityChanges: { intelligence: 2 },
        },
      ],
    })
    const result = applyClassProgressionUpdate(
      character,
      character.provenance ?? emptyProvenance(),
      [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    )

    expect(result.characterPatch.asiChoices).toEqual([])
    expect(result.provenanceUpdate.abilityBonuses).toEqual([])
  })

  test('level changes retain earned legacy ASIs without a class source', () => {
    const character = makeCharacterFixture({
      level: 4,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      asiChoices: [
        {
          id: 'wizard|4',
          level: 2,
          className: 'wizard',
          abilityChanges: { intelligence: 2 },
        },
      ],
    })
    const result = applyClassProgressionUpdate(
      character,
      character.provenance ?? emptyProvenance(),
      [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    )

    expect(result.characterPatch.asiChoices).toEqual(character.asiChoices)
    expect(result.provenanceUpdate.abilityBonuses).toHaveLength(1)
  })

  test('level removal retracts class-owned feat choices and their effects', () => {
    const choiceId = 'fighter|phb|epic boon|eb'
    const optionTag = {
      ...makeSourceTag('feat', 'Skill Expert', 'choice', 'PHB'),
      grantVariant: `class:${choiceId}`,
    }
    const featTag = {
      ...makeSourceTag('class', 'Fighter', 'choice', 'PHB'),
      grantVariant: choiceId,
    }
    const character = makeCharacterFixture({
      level: 4,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 4 }],
      classChoiceSelections: [
        {
          choiceId,
          label: 'Epic Boon',
          kind: 'feat',
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: 4,
          selected: [
            {
              entityType: 'feat',
              name: 'Skill Expert',
              source: 'PHB',
              slotLevel: 4,
            },
          ],
        },
      ],
      classFeatChoices: [
        {
          id: choiceId,
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Epic Boon',
          categories: ['EB'],
          feats: [
            {
              id: 'class-skill-expert',
              name: 'Skill Expert',
              source: 'PHB',
              description: '',
              className: 'Fighter',
              classSource: 'PHB',
              classLevel: 4,
              options: { skills: ['Arcana'] },
            },
          ],
        },
      ],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['arcana'],
        languages: [],
        savingThrows: [],
      },
      skills: { arcana: { proficient: true, expertise: false, bonus: 0 } },
    })
    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      proficiencies: {
        ...(character.provenance?.proficiencies ?? emptyProvenance().proficiencies),
        skills: { arcana: [optionTag] },
      },
      feats: { 'skill expert': [featTag] },
    }

    const result = applyClassProgressionUpdate(character, ledger, [
      { name: 'Fighter', source: 'PHB', levels: 3 },
    ])

    expect(result.characterPatch.classFeatChoices).toEqual([])
    expect(result.characterPatch.classChoiceSelections).toEqual([])
    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
    expect(result.provenanceUpdate.feats['skill expert']).toBeUndefined()
  })

  test('applyClassProgressionUpdate reconciles provenance for removed class entries', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
    })

    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      proficiencies: {
        ...(character.provenance?.proficiencies ?? emptyProvenance().proficiencies),
        armor: {
          shield: [makeSourceTag('class', 'Fighter', 'choice', 'PHB')],
        },
      },
    }

    const result = applyClassProgressionUpdate(character, ledger, [
      { name: 'Wizard', source: 'PHB', levels: 4 },
    ])

    expect(result.provenanceUpdate.proficiencies.armor.shield).toBeUndefined()
  })

  test('changing a class source retracts only choices owned by the replaced printing', () => {
    const replacedChoiceId = 'class:test-class|old|choice:path|1'
    const retainedChoiceId = 'class:other-class|same|choice:path|1'
    const character = makeCharacterFixture({
      level: 2,
      classProgression: [
        { name: 'Test Class', source: 'OLD', levels: 1 },
        { name: 'Other Class', source: 'SAME', levels: 1 },
      ],
      classChoiceSelections: [
        {
          choiceId: replacedChoiceId,
          label: 'Path',
          kind: 'class-feature',
          className: 'Test Class',
          classSource: 'OLD',
          classLevel: 1,
          selected: [{ entityType: 'classFeature', name: 'Old Path', source: 'OLD', slotLevel: 1 }],
        },
        {
          choiceId: retainedChoiceId,
          label: 'Path',
          kind: 'class-feature',
          className: 'Other Class',
          classSource: 'SAME',
          classLevel: 1,
          selected: [
            { entityType: 'classFeature', name: 'Kept Path', source: 'SAME', slotLevel: 1 },
          ],
        },
      ],
      features: [
        {
          id: `class-choice:${encodeURIComponent(replacedChoiceId)}:old`,
          name: 'Old Path',
          source: 'OLD',
          description: '',
        },
        {
          id: `class-choice:${encodeURIComponent(retainedChoiceId)}:kept`,
          name: 'Kept Path',
          source: 'SAME',
          description: '',
        },
      ],
    })
    let ledger = addGrant(emptyProvenance(), 'features', 'Old Path', {
      ...makeSourceTag('class', 'Test Class', 'choice', 'OLD'),
      grantVariant: replacedChoiceId,
    })
    ledger = addGrant(ledger, 'features', 'Kept Path', {
      ...makeSourceTag('class', 'Other Class', 'choice', 'SAME'),
      grantVariant: retainedChoiceId,
    })

    const result = applyClassSelectionCommand(
      character,
      ledger,
      { name: 'Test Class', source: 'NEW' },
      undefined,
      new Map(),
    )

    expect(result.characterPatch.classChoiceSelections).toEqual([
      expect.objectContaining({ choiceId: retainedChoiceId }),
    ])
    expect(result.characterPatch.features?.map((feature) => feature.name)).toEqual(['Kept Path'])
    expect(result.provenanceUpdate.features['old path']).toBeUndefined()
    expect(result.provenanceUpdate.features['kept path']).toHaveLength(1)
  })

  test('applies a class equipment choice as one character and provenance result', () => {
    const dagger = { name: 'Dagger', source: 'PHB', type: 'M' } as Item5e
    const shortbow = { name: 'Shortbow', source: 'PHB', type: 'R' } as Item5e
    const character = makeCharacterFixture({
      classEquipmentChoices: { 'Rogue|PHB': ['a'] },
      equipment: [
        {
          id: 'old-dagger',
          name: 'Dagger',
          source: 'PHB',
          type: 'M',
          quantity: 1,
          equipped: false,
        },
      ],
    })
    const classTag = makeSourceTag('class', 'Rogue', 'fixed', 'PHB')
    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      equipment: { dagger: [classTag] },
    }

    const result = applyClassEquipmentChoiceCommand(
      character,
      ledger,
      {
        name: 'Rogue',
        source: 'PHB',
        startingEquipment: { defaultData: [{ A: ['dagger|PHB'], B: ['shortbow|PHB'] }] },
      },
      0,
      'B',
      buildItemLookup([dagger, shortbow]),
    )

    expect(result.characterPatch.classEquipmentChoices?.['Rogue|PHB']).toEqual(['b'])
    expect(result.characterPatch.equipment?.map((entry) => entry.name)).toEqual(['Shortbow'])
    expect(result.provenanceUpdate.equipment.dagger).toBeUndefined()
    expect(result.provenanceUpdate.equipment.shortbow).toEqual([classTag])
  })

  test('preserves equipment that remains granted by another source', () => {
    const dagger = { name: 'Dagger', source: 'PHB', type: 'M' } as Item5e
    const shortbow = { name: 'Shortbow', source: 'PHB', type: 'R' } as Item5e
    const character = makeCharacterFixture({
      classEquipmentChoices: { 'Rogue|PHB': ['a'] },
      equipment: [
        {
          id: 'shared-dagger',
          name: 'Dagger',
          source: 'PHB',
          type: 'M',
          quantity: 1,
          equipped: false,
        },
      ],
    })
    const classTag = makeSourceTag('class', 'Rogue', 'fixed', 'PHB')
    const manualTag = makeSourceTag('manual', 'User Choice', 'choice')
    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      equipment: { dagger: [classTag, manualTag] },
    }

    const result = applyClassEquipmentChoiceCommand(
      character,
      ledger,
      {
        name: 'Rogue',
        source: 'PHB',
        startingEquipment: { defaultData: [{ A: ['dagger|PHB'], B: ['shortbow|PHB'] }] },
      },
      0,
      'B',
      buildItemLookup([dagger, shortbow]),
    )

    expect(result.characterPatch.equipment?.map((entry) => entry.name)).toEqual([
      'Dagger',
      'Shortbow',
    ])
    expect(result.provenanceUpdate.equipment.dagger).toEqual([manualTag])
    expect(result.provenanceUpdate.equipment.shortbow).toEqual([classTag])
  })
})
