import { describe, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import {
  deriveRulesTextActions,
  deriveSpellActions,
  deriveWeaponActions,
} from '@/lib/calculations/actions'
import type { Race5e, Spell5e } from '@/types/5etools'
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

  test('uses structured spell timing and preserves unprepared spells as inactive actions', () => {
    const reactionSpell = {
      name: 'Test Reaction Spell',
      source: 'TEST',
      level: 0,
      school: 'T',
      time: [{ number: 1, unit: 'reaction' }],
      range: { type: 'point', distance: { type: 'feet', amount: 30 } },
      duration: [{ type: 'instant' }],
      entries: ['Test reaction rules.'],
    } as Spell5e
    const bonusSpell = {
      ...reactionSpell,
      name: 'Test Bonus Spell',
      level: 1,
      time: [{ number: 1, unit: 'bonus' }],
      entries: ['Test bonus rules.'],
    } as Spell5e
    const character = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'test-profile',
            type: 'class',
            label: 'Test profile',
            cantrips: [reactionSpell.name],
            spellsKnown: [bonusSpell.name],
            preparedSpells: [],
          },
        ],
      },
    })

    const actions = deriveSpellActions(character, buildSpellLookup([reactionSpell, bonusSpell]))

    expect(actions).toEqual([
      expect.objectContaining({
        name: reactionSpell.name,
        kind: 'reaction',
        active: true,
        description: 'Test reaction rules.',
      }),
      expect.objectContaining({
        name: bonusSpell.name,
        kind: 'bonus-action',
        active: false,
        inactiveReason: 'Not prepared',
      }),
    ])
  })

  test('keeps feature, feat, and structured species entries as unautomated rules text', () => {
    const character = makeCharacterFixture({
      features: [
        {
          id: 'test-feature',
          name: 'Test Feature',
          source: 'TEST',
          description: 'Test feature rules.',
        },
      ],
      feats: [
        {
          id: 'test-feat',
          name: 'Test Feat',
          source: 'TEST',
          description: 'Test feat rules.',
        },
      ],
    })
    const race = {
      name: 'Test Species',
      source: 'TEST',
      entries: [
        {
          type: 'entries',
          name: 'Test Trait',
          entries: ['Test trait rules.'],
        },
        'Unstructured top-level prose is not treated as an action.',
      ],
    } as Race5e

    expect(deriveRulesTextActions(character, race)).toEqual([
      expect.objectContaining({
        id: 'feature:test-feature',
        name: 'Test Feature',
        kind: 'special',
        description: 'Test feature rules.',
      }),
      expect.objectContaining({
        id: 'feat:test-feat',
        name: 'Test Feat',
        kind: 'special',
        description: 'Test feat rules.',
      }),
      expect.objectContaining({
        name: 'Test Trait',
        kind: 'special',
        description: 'Test trait rules.',
      }),
    ])
  })
})
