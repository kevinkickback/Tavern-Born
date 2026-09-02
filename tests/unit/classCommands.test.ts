import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  addMulticlass,
  applyClassEquipmentChoiceCommand,
  applyClassProgressionUpdate,
  removeMulticlass,
  selectBaseClass,
  selectSubclass,
  updateCharacterLevel,
} from '@/lib/character/commands/classCommands'
import { makeSourceTag } from '@/lib/provenance'
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
})
