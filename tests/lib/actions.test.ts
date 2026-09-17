import { describe, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import {
  deriveCharacterActions,
  deriveRulesTextActions,
  deriveSpellActions,
  deriveWeaponActions,
  inferRulesTextActionKind,
} from '@/lib/calculations/actions'
import type { Class5e, ClassFeature, Feat5e, Race5e, Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('character action projection', () => {
  test('derives an effect-aware weapon attack with proficiency, properties, and selected mastery', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: [],
        weapons: ['Test Weapon'],
        tools: [],
        skills: [],
        expertise: [],
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

  test('keeps a 2014 Warlock known spell active without preparing it', () => {
    const spell = {
      name: 'Test Warlock Spell',
      source: 'TEST',
      level: 1,
      school: 'T',
      time: [{ number: 1, unit: 'bonus' }],
      range: { type: 'point', distance: { type: 'feet', amount: 30 } },
      duration: [{ type: 'instant' }],
      entries: ['Test warlock rules.'],
    } as Spell5e
    const warlock = {
      name: 'Warlock',
      source: 'PHB',
      spellcastingAbility: 'cha',
      casterProgression: 'pact',
      spellsKnownProgression: [2],
    } as Class5e
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Warlock', source: 'PHB', levels: 1 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Warlock|PHB',
            type: 'class',
            label: 'Warlock (Lv 1)',
            className: 'Warlock',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [spell.name],
            preparedSpells: [],
          },
        ],
      },
    })

    expect(
      deriveSpellActions(character, buildSpellLookup([spell]), { classes: [warlock] }),
    ).toEqual([
      expect.objectContaining({
        name: spell.name,
        active: true,
        inactiveReason: undefined,
      }),
    ])
  })

  test('still marks an unprepared spell inactive for a daily prepared caster', () => {
    const spell = {
      name: 'Test Prepared Spell',
      source: 'TEST',
      level: 1,
      school: 'T',
      time: [{ number: 1, unit: 'action' }],
      range: { type: 'self' },
      duration: [{ type: 'instant' }],
      entries: ['Test prepared-caster rules.'],
    } as Spell5e
    const cleric = {
      name: 'Cleric',
      source: 'PHB',
      spellcastingAbility: 'wis',
      casterProgression: 'full',
      preparedSpells: '<$level$> + <$wis_mod$>',
    } as Class5e
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Cleric', source: 'PHB', levels: 1 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Cleric|PHB',
            type: 'class',
            label: 'Cleric (Lv 1)',
            className: 'Cleric',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [spell.name],
            preparedSpells: [],
          },
        ],
      },
    })

    expect(
      deriveSpellActions(character, buildSpellLookup([spell]), { classes: [cleric] })[0],
    ).toMatchObject({ active: false, inactiveReason: 'Not prepared' })
  })

  test('classifies explicit action grants while excluding passive feature prose', () => {
    const character = makeCharacterFixture({
      features: [
        {
          id: 'test-action-feature',
          name: 'Test Action Feature',
          source: 'TEST',
          description: 'As an action, you can use this feature.',
        },
        {
          id: 'test-passive-feature',
          name: 'Test Passive Feature',
          source: 'TEST',
          description: 'You learn one additional language.',
        },
      ],
      feats: [
        {
          id: 'test-feat',
          name: 'Test Feat',
          source: 'TEST',
          description: 'When a creature moves, you can use your reaction to respond.',
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
          entries: ['As a Bonus Action, you can activate this trait.'],
        },
        {
          type: 'entries',
          name: 'Extra Language',
          entries: ['You can speak, read, and write one extra language.'],
        },
        'Unstructured top-level prose is not treated as an action.',
      ],
    } as Race5e

    expect(deriveRulesTextActions(character, race)).toEqual([
      expect.objectContaining({
        id: 'feature:test-action-feature',
        name: 'Test Action Feature',
        kind: 'action',
      }),
      expect.objectContaining({
        id: 'feat:test-feat',
        name: 'Test Feat',
        kind: 'reaction',
      }),
      expect.objectContaining({
        name: 'Test Trait',
        kind: 'bonus-action',
      }),
    ])
  })

  test('resolves selected feats and class features from canonical rules data', () => {
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Test Class',
          source: 'TEST',
          levels: 3,
          subclass: 'Test Subclass',
          subclassSource: 'TEST',
        },
      ],
      features: [
        { id: 'selected-feature', name: 'Selected Feature', source: 'TEST', description: '' },
      ],
      feats: [{ id: 'regular-feat', name: 'Regular Feat', source: 'TEST', description: '' }],
      specialFeats: [{ id: 'bonus-feat', name: 'Bonus Feat', source: 'TEST', description: '' }],
      classFeatChoices: [
        {
          id: 'class-feat-choice',
          className: 'Test Class',
          classSource: 'TEST',
          progressionName: 'Test progression',
          categories: [],
          feats: [{ id: 'class-feat', name: 'Class Feat', source: 'TEST', description: '' }],
        },
      ],
    })
    const feats: Feat5e[] = [
      {
        name: 'Regular Feat',
        source: 'TEST',
        entries: ['As an action, use the regular feat.'],
      },
      {
        name: 'Bonus Feat',
        source: 'TEST',
        entries: ['You can use your reaction to use the bonus feat.'],
      },
      {
        name: 'Class Feat',
        source: 'TEST',
        entries: ['As a bonus action, use the class feat.'],
      },
    ]
    const selectedFeature: ClassFeature = {
      name: 'Selected Feature',
      source: 'TEST',
      entries: ['As an action, use the selected feature.'],
    }
    const classData = {
      name: 'Test Class',
      source: 'TEST',
      classFeatureRefs: [
        {
          ref: 'Class Action|Test Class|TEST|2',
          name: 'Class Action',
          source: 'TEST',
          className: 'Test Class',
          classSource: 'TEST',
          level: 2,
          feature: {
            name: 'Class Action',
            source: 'TEST',
            level: 2,
            entries: ['As an action, use the class feature.'],
          },
        },
      ],
      subclasses: [
        {
          name: 'Test Subclass',
          shortName: 'Test Subclass',
          source: 'TEST',
          className: 'Test Class',
          classSource: 'TEST',
          subclassFeatureRefs: [
            {
              ref: 'Subclass Reaction|Test Class|TEST|Test Subclass|TEST|3',
              name: 'Subclass Reaction',
              source: 'TEST',
              className: 'Test Class',
              classSource: 'TEST',
              subclassShortName: 'Test Subclass',
              subclassSource: 'TEST',
              level: 3,
              feature: {
                name: 'Subclass Reaction',
                source: 'TEST',
                level: 3,
                entries: ['As a reaction, use the subclass feature.'],
              },
            },
          ],
        },
      ],
    } satisfies Class5e

    const actions = deriveRulesTextActions(character, undefined, {
      classes: [classData],
      feats,
      classFeaturesByKey: { 'Selected Feature|TEST': selectedFeature },
    })

    expect(actions.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'Selected Feature', kind: 'action' },
      { name: 'Class Action', kind: 'action' },
      { name: 'Subclass Reaction', kind: 'reaction' },
      { name: 'Regular Feat', kind: 'action' },
      { name: 'Bonus Feat', kind: 'reaction' },
      { name: 'Class Feat', kind: 'bonus-action' },
    ])
  })

  test('recognizes both legacy and revised action wording without catalog-specific names', () => {
    expect(inferRulesTextActionKind('You can use your action to activate this benefit.')).toBe(
      'action',
    )
    expect(
      inferRulesTextActionKind(
        'When you take the Attack action, you can replace one of your attacks with this benefit.',
      ),
    ).toBe('action')
    expect(inferRulesTextActionKind('As a Bonus Action, you can activate this benefit.')).toBe(
      'bonus-action',
    )
    expect(inferRulesTextActionKind('You gain proficiency in one additional skill.')).toBeNull()
  })

  test('combines source-backed and manual actions through one view-neutral projection', () => {
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'test-weapon',
          name: 'Test Weapon',
          type: 'M',
          quantity: 1,
          equipped: true,
          dmg1: '1d6',
        },
      ],
      manualActions: [
        {
          id: 'manual:test-action',
          name: 'Test Manual Action',
          kind: 'bonus-action',
          description: 'Test manual rules.',
          source: { kind: 'manual', name: 'Test Manual Action' },
          active: true,
        },
      ],
    })

    const actions = deriveCharacterActions(character, {
      abilityModifiers: {
        strength: 1,
        dexterity: 0,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
    })

    expect(actions.map((action) => action.id)).toEqual(['weapon:test-weapon', 'manual:test-action'])
  })
})
