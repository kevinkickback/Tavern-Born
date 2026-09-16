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
import { swapClassSpellAtLevel } from '@/lib/character/commands/spellCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('Class Commands', () => {
  test('selectBaseClass updates top-level class fields and progression', () => {
    const character = makeCharacterFixture({
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

    expect(result.characterPatch.classProgression?.[0]?.name).toBe('Wizard')
  })

  test('selectSubclass updates subclass fields', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()

    const result = selectSubclass(character, ledger, 'Evocation', 'PHB')
    expect(result.characterPatch.classProgression?.[0]?.subclass).toBe('Evocation')
    expect(result.characterPatch.classProgression?.[0]?.subclassSource).toBe('PHB')
  })

  test('selectSubclass updates viewing class entry in progression without overriding top-level subclass for other classes', () => {
    const character = makeCharacterFixture({
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
  })

  test('updateCharacterLevel updates primary class level', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = updateCharacterLevel(character, ledger, 4)

    expect(result.characterPatch.classProgression?.[0]?.levels).toBe(4)
  })

  test('level-down reverses a spell replacement earned at the removed level', () => {
    const base = makeCharacterFixture({
      classProgression: [{ name: 'Bard', source: 'PHB', levels: 3 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Bard|PHB',
            type: 'class',
            label: 'Bard (Lv 3)',
            className: 'Bard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Charm Person'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const bardTag = {
      sourceType: 'class' as const,
      sourceName: 'Bard',
      sourceRef: 'PHB',
      grantType: 'choice' as const,
      label: 'Bard',
      spellGrantedAtLevel: 1,
      spellAttributionMode: 'exact' as const,
    }
    const ledger = {
      ...(base.provenance ?? emptyProvenance()),
      spells: { 'charm person': [bardTag] },
    }
    const swapped = swapClassSpellAtLevel(base, ledger, {
      className: 'Bard',
      classSource: 'PHB',
      swapAtLevel: 3,
      removedName: 'Charm Person',
      addedName: 'Hold Person',
    })
    const character = {
      ...base,
      ...swapped.characterPatch,
      provenance: swapped.provenanceUpdate,
    }

    const result = applyClassProgressionUpdate(character, swapped.provenanceUpdate, [
      { name: 'Bard', source: 'PHB', levels: 2 },
    ])
    const profile = result.characterPatch.spells?.spellProfiles[0]

    expect(profile?.spellsKnown).toEqual(['Charm Person'])
    expect(profile?.spellSwaps).toBeUndefined()
    expect(result.provenanceUpdate.spells['charm person']?.[0]).toMatchObject({
      sourceName: 'Bard',
      spellGrantedAtLevel: 1,
    })
    expect(result.provenanceUpdate.spells['hold person']).toBeUndefined()
  })

  test('level-down reverses successive spell replacements in reverse order', () => {
    const base = makeCharacterFixture({
      classProgression: [{ name: 'Bard', source: 'PHB', levels: 5 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Bard|PHB',
            type: 'class',
            label: 'Bard (Lv 5)',
            className: 'Bard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Charm Person'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const bardTag = {
      sourceType: 'class' as const,
      sourceName: 'Bard',
      sourceRef: 'PHB',
      grantType: 'choice' as const,
      label: 'Bard',
      spellGrantedAtLevel: 1,
      spellAttributionMode: 'exact' as const,
    }
    const first = swapClassSpellAtLevel(
      base,
      { ...(base.provenance ?? emptyProvenance()), spells: { 'charm person': [bardTag] } },
      {
        className: 'Bard',
        classSource: 'PHB',
        swapAtLevel: 3,
        removedName: 'Charm Person',
        addedName: 'Hold Person',
      },
    )
    const afterFirst = { ...base, ...first.characterPatch, provenance: first.provenanceUpdate }
    const second = swapClassSpellAtLevel(afterFirst, first.provenanceUpdate, {
      className: 'Bard',
      classSource: 'PHB',
      swapAtLevel: 5,
      removedName: 'Hold Person',
      addedName: 'Hypnotic Pattern',
    })
    const character = {
      ...afterFirst,
      ...second.characterPatch,
      provenance: second.provenanceUpdate,
    }

    const result = applyClassProgressionUpdate(character, second.provenanceUpdate, [
      { name: 'Bard', source: 'PHB', levels: 2 },
    ])

    expect(result.characterPatch.spells?.spellProfiles[0]?.spellsKnown).toEqual(['Charm Person'])
    expect(result.characterPatch.spells?.spellProfiles[0]?.spellSwaps).toBeUndefined()
  })

  test('level-down does not restore a swapped spell learned above the retained level', () => {
    const base = makeCharacterFixture({
      classProgression: [{ name: 'Bard', source: 'PHB', levels: 5 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Bard|PHB',
            type: 'class',
            label: 'Bard (Lv 5)',
            className: 'Bard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Hold Person'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const bardTag = {
      sourceType: 'class' as const,
      sourceName: 'Bard',
      sourceRef: 'PHB',
      grantType: 'choice' as const,
      label: 'Bard',
      spellGrantedAtLevel: 3,
      spellAttributionMode: 'exact' as const,
    }
    const swapped = swapClassSpellAtLevel(
      base,
      { ...(base.provenance ?? emptyProvenance()), spells: { 'hold person': [bardTag] } },
      {
        className: 'Bard',
        classSource: 'PHB',
        swapAtLevel: 5,
        removedName: 'Hold Person',
        addedName: 'Hypnotic Pattern',
      },
    )
    const character = {
      ...base,
      ...swapped.characterPatch,
      provenance: swapped.provenanceUpdate,
    }

    const result = applyClassProgressionUpdate(character, swapped.provenanceUpdate, [
      { name: 'Bard', source: 'PHB', levels: 2 },
    ])

    expect(result.characterPatch.spells?.spellProfiles[0]?.spellsKnown).toEqual([])
    expect(result.provenanceUpdate.spells['hold person']).toBeUndefined()
    expect(result.provenanceUpdate.spells['hypnotic pattern']).toBeUndefined()
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

  test('removeMulticlass removes secondary class entry', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = removeMulticlass(character, ledger, 'Fighter', 'PHB')

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

  test('applyClassProgressionUpdate stores the canonical class progression', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })

    const ledger = character.provenance ?? emptyProvenance()
    const result = applyClassProgressionUpdate(character, ledger, [
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Fighter', source: 'PHB', levels: 1 },
    ])

    expect(result.characterPatch.classProgression).toHaveLength(2)
  })

  test('applyLevelUp records the raw die result with the progression update', () => {
    const character = makeCharacterFixture({
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

    expect(result.characterPatch.classProgression?.[0]?.levels).toBe(2)
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

  test('removing a class retracts its materialized proficiencies and spell profile', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
      proficiencies: {
        armor: ['shields'],
        weapons: [],
        tools: [],
        languages: ['Elvish'],
        skills: ['athletics'],
        savingThrows: [],
      },
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: 'class:Fighter|PHB',
            type: 'class',
            label: 'Fighter (Lv 1)',
            className: 'Fighter',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Shield'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const fighterTag = makeSourceTag('class', 'Fighter', 'fixed', 'PHB')
    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      proficiencies: {
        ...(character.provenance?.proficiencies ?? emptyProvenance().proficiencies),
        armor: { shields: [fighterTag] },
        skills: { athletics: [fighterTag] },
        languages: { elvish: [fighterTag] },
      },
      spells: { shield: [{ ...fighterTag, grantType: 'choice' as const }] },
    }

    const result = removeMulticlass(character, ledger, 'Fighter', 'PHB')

    expect(result.characterPatch.proficiencies?.armor).toEqual([])
    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.proficiencies?.languages).toEqual([])
    expect(result.characterPatch.spells?.spellProfiles.map((profile) => profile.id)).toEqual([
      'class:Wizard|PHB',
    ])
    expect(result.provenanceUpdate.spells.shield).toBeUndefined()
  })

  test('removing a class preserves a proficiency that another source still owns', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
      proficiencies: {
        armor: ['shields'],
        weapons: [],
        tools: [],
        languages: [],
        skills: [],
        savingThrows: [],
      },
    })
    const ledger = {
      ...(character.provenance ?? emptyProvenance()),
      proficiencies: {
        ...(character.provenance?.proficiencies ?? emptyProvenance().proficiencies),
        armor: {
          shields: [
            makeSourceTag('class', 'Fighter', 'fixed', 'PHB'),
            makeSourceTag('feat', 'Moderately Armored', 'fixed', 'PHB'),
          ],
        },
      },
    }

    const result = removeMulticlass(character, ledger, 'Fighter', 'PHB')

    expect(result.characterPatch.proficiencies?.armor).toEqual(['shields'])
    expect(result.provenanceUpdate.proficiencies.armor.shields).toHaveLength(1)
    expect(result.provenanceUpdate.proficiencies.armor.shields?.[0]?.sourceType).toBe('feat')
  })

  test('changing a class source retracts only choices owned by the replaced printing', () => {
    const replacedChoiceId = 'class:test-class|old|choice:path|1'
    const retainedChoiceId = 'class:other-class|same|choice:path|1'
    const character = makeCharacterFixture({
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
