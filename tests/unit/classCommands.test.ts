import { describe, expect, test } from 'vitest'
import {
  addMulticlass,
  applyClassProgressionUpdate,
  removeMulticlass,
  selectBaseClass,
  selectSubclass,
  updateCharacterLevel,
} from '@/lib/character/commands/classCommands'
import { makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
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

    expect(result.characterUpdate.class).toBe('Wizard')
    expect(result.characterUpdate.classProgression?.[0]?.name).toBe('Wizard')
  })

  test('selectSubclass updates subclass fields', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()

    const result = selectSubclass(character, ledger, 'Evocation', 'PHB')
    expect(result.characterUpdate.subclass).toBe('Evocation')
    expect(result.characterUpdate.subclassSource).toBe('PHB')
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

    expect(result.characterUpdate.classProgression?.[1]?.subclass).toBe('Battle Master')
    expect(result.characterUpdate.classProgression?.[1]?.subclassSource).toBe('PHB')
    expect(result.characterUpdate.subclass).toBeUndefined()
    expect(result.characterUpdate.subclassSource).toBeUndefined()
  })

  test('updateCharacterLevel updates primary class level', () => {
    const character = makeCharacterFixture({
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = updateCharacterLevel(character, ledger, 4)

    expect(result.characterUpdate.level).toBe(4)
    expect(result.characterUpdate.classProgression?.[0]?.levels).toBe(4)
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

    expect(result.characterUpdate.classProgression).toHaveLength(2)
    expect(result.characterUpdate.classProgression?.[1]?.name).toBe('Fighter')
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

    expect(result.characterUpdate.classProgression).toHaveLength(1)
    expect(result.characterUpdate.classProgression?.[0]?.name).toBe('Wizard')
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

    expect(result.characterUpdate.level).toBe(4)
    expect(result.characterUpdate.class).toBe('Wizard')
    expect(result.characterUpdate.classSource).toBe('PHB')
    expect(result.characterUpdate.classProgression).toHaveLength(2)
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
})
