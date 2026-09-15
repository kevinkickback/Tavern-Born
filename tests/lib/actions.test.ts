import { describe, expect, test } from 'vitest'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('character action projection', () => {
  test('derives an effect-aware weapon attack with proficiency, properties, and selected mastery', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: [],
        weapons: ['Test Weapon'],
        tools: [],
        skills: [],
        languages: [],
        savingThrows: [],
      },
      equipment: [
        {
          id: 'test-weapon',
          name: 'Test Weapon',
          source: 'TEST',
          type: 'M',
          quantity: 1,
          equipped: true,
          weaponCategory: 'test category',
          dmg1: '1d8',
          dmgType: 'test damage',
          properties: ['F'],
          range: 'test range',
        },
      ],
      classChoiceSelections: [
        {
          choiceId: 'test-choice',
          label: 'Test choice',
          kind: 'item',
          className: 'Test Class',
          classSource: 'TEST',
          classLevel: 1,
          selected: [
            {
              entityType: 'item',
              name: 'Test Weapon',
              source: 'TEST',
              slotLevel: 1,
            },
          ],
        },
      ],
      manualEffects: [
        {
          id: 'test-attack-effect',
          label: 'Test attack bonus',
          target: { kind: 'attack-roll' },
          operation: { kind: 'add', value: 1 },
          source: { kind: 'manual', name: 'Test attack bonus' },
        },
        {
          id: 'test-damage-effect',
          label: 'Test damage bonus',
          target: { kind: 'damage', attackId: 'test-weapon' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Test damage bonus' },
        },
      ],
    })

    const actions = deriveWeaponActions(character, {
      abilityModifiers: {
        strength: 0,
        dexterity: 3,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
      itemLookup: new Map([
        [
          'test',
          {
            name: 'Test Weapon',
            source: 'TEST',
            type: 'M',
            mastery: ['Test Mastery|TEST'],
          },
        ],
      ]),
      propertyLookup: { F: 'Test Property' },
      effects: character.manualEffects,
    })

    expect(actions).toEqual([
      expect.objectContaining({
        id: 'weapon:test-weapon',
        name: 'Test Weapon',
        kind: 'attack',
        active: true,
        ability: 'dexterity',
        proficient: true,
        attackBonus: 6,
        range: 'test range',
        damage: [{ dice: '1d8', bonus: 5, damageType: 'test damage' }],
        properties: ['Test Property'],
        mastery: [{ name: 'Test Mastery', source: 'TEST' }],
      }),
    ])
  })

  test('keeps unequipped attacks visible but marks them inactive', () => {
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'stored-weapon',
          name: 'Stored Weapon',
          type: 'R',
          quantity: 1,
          equipped: false,
          dmg1: '1d4',
        },
      ],
    })

    expect(
      deriveWeaponActions(character, {
        abilityModifiers: {
          strength: 0,
          dexterity: 0,
          constitution: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0,
        },
        proficiencyBonus: 2,
      })[0],
    ).toMatchObject({ active: false, inactiveReason: 'Not equipped' })
  })
})
