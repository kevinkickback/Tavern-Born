import { describe, expect, test } from 'vitest'
import {
  buildBackgroundLookup,
  buildClassLookup,
  buildFeatLookup,
  buildRaceLookup,
} from '@/lib/5etools/lookups'
import {
  createCharacterCalculationContext,
  deriveEffectiveAbilityScores,
} from '@/lib/calculations/characterCalculationContext'
import { makeSourceTag } from '@/lib/provenance'
import type { Background5e, Class5e, Feat5e, Item5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('character calculation context', () => {
  test('composes 2014 racial bonuses and later ASIs without mutating base scores', () => {
    const dwarf = {
      name: 'Dwarf',
      source: 'PHB',
      ability: [{ con: 2 }],
      speed: 25,
    } as Race5e
    const character = makeCharacterFixture({
      race: 'Dwarf',
      raceSource: 'PHB',
      abilityScores: {
        strength: 14,
        dexterity: 12,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 10,
      },
      asiChoices: [
        {
          id: 'fighter|PHB|4',
          level: 4,
          className: 'Fighter',
          classSource: 'PHB',
          abilityChanges: { strength: 2 },
        },
      ],
    })

    const result = deriveEffectiveAbilityScores(character, dwarf)

    expect(result.base).toEqual(character.abilityScores)
    expect(result.total).toMatchObject({ strength: 16, constitution: 16 })
    expect(result.modifiers).toMatchObject({ strength: 3, constitution: 3 })
    expect(character.abilityScores).toMatchObject({ strength: 14, constitution: 14 })
  })

  test('composes feat-option bonuses from provenance without changing allocated scores', () => {
    const character = makeCharacterFixture({
      abilityScores: {
        ...makeCharacterFixture().abilityScores,
        intelligence: 15,
      },
      provenance: {
        ...makeCharacterFixture().provenance!,
        abilityBonuses: [
          {
            ability: 'intelligence',
            value: 1,
            sourceTag: makeSourceTag('feat', 'Skill Expert', 'choice', 'TCE'),
          },
        ],
      },
    })

    const result = deriveEffectiveAbilityScores(character)

    expect(result.base.intelligence).toBe(15)
    expect(result.featBonuses).toEqual({ intelligence: 1 })
    expect(result.total.intelligence).toBe(16)
  })

  test('uses 2024 background ASIs and suppresses legacy racial ASIs', () => {
    const legacyRace = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dex: 2 }],
    } as Race5e
    const background = {
      name: 'Acolyte',
      source: 'XPHB',
      edition: 'one',
      ability: [
        {
          choose: {
            weighted: { from: ['wis', 'int', 'cha'], weights: [2, 1] },
          },
        },
      ],
    } as Background5e
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: 'Elf',
      raceSource: 'PHB',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
      backgroundAsiChoices: ['wisdom', 'charisma'],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 15,
        charisma: 8,
      },
    })

    const result = deriveEffectiveAbilityScores(character, legacyRace, undefined, background)

    expect(result.racialBonuses).toEqual({})
    expect(result.backgroundBonuses).toEqual({ wisdom: 2, charisma: 1 })
    expect(result.total).toMatchObject({ dexterity: 14, wisdom: 17, charisma: 9 })
  })

  test('resolves source-qualified entities and classifies equipment state once', () => {
    const phbWizard = { name: 'Wizard', source: 'PHB', hd: { faces: 6 } } as Class5e
    const xphbWizard = { name: 'Wizard', source: 'XPHB', hd: { faces: 8 } } as Class5e
    const elf = { name: 'Elf', source: 'PHB', ability: [{ dex: 2 }] } as Race5e
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      race: 'Elf',
      raceSource: 'PHB',
      equipment: [
        { id: 'armor', name: 'Leather Armor', type: 'LA', quantity: 1, equipped: true },
        {
          id: 'ring',
          name: 'Ring of Testing',
          type: 'RG',
          quantity: 1,
          equipped: true,
          attuned: true,
        },
        { id: 'rope', name: 'Rope', type: 'G', quantity: 1, equipped: false },
      ],
    })
    const context = createCharacterCalculationContext(character, {
      classesByKey: buildClassLookup([xphbWizard, phbWizard]),
      racesByKey: buildRaceLookup([elf]),
      backgroundsByKey: buildBackgroundLookup([]),
    })

    expect(context.rules.originSystem).toBe('2014')
    expect(context.classes).toEqual([phbWizard])
    expect(context.raceResolution.parentRace).toBe(elf)
    expect(context.equipment.all).toHaveLength(3)
    expect(context.equipment.equipped.map((item) => item.id)).toEqual(['armor', 'ring'])
    expect(context.equipment.attuned.map((item) => item.id)).toEqual(['ring'])
  })

  test('applies manual ability effects and exposes structured source effects', () => {
    const race = {
      name: 'Test Ancestry',
      source: 'TEST',
      darkvision: 45,
      resist: ['test damage'],
    } as Race5e
    const character = makeCharacterFixture({
      race: race.name,
      raceSource: race.source,
      manualEffects: [
        {
          id: 'ability-adjustment',
          label: 'Ability adjustment',
          target: { kind: 'ability-score', ability: 'wisdom' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
      ],
    })
    const context = createCharacterCalculationContext(character, {
      racesByKey: buildRaceLookup([race]),
    })

    expect(context.abilityScores.total.wisdom).toBe(character.abilityScores.wisdom + 2)
    expect(context.effects.declarations.map((effect) => effect.target)).toEqual(
      expect.arrayContaining([
        { kind: 'ability-score', ability: 'wisdom' },
        { kind: 'sense', sense: 'darkvision' },
        { kind: 'damage-resistance', damageType: 'test damage' },
      ]),
    )
  })

  test('projects initiative and sense effects into canonical derived values', () => {
    const character = makeCharacterFixture({
      abilityScores: {
        ...makeCharacterFixture().abilityScores,
        dexterity: 14,
      },
      visions: [{ type: 'darkvision', range: 60 }],
      manualEffects: [
        {
          id: 'initiative-bonus',
          label: 'Initiative bonus',
          target: { kind: 'initiative' },
          operation: { kind: 'add', value: 3 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
        {
          id: 'darkvision-bonus',
          label: 'Darkvision bonus',
          target: { kind: 'sense', sense: 'darkvision' },
          operation: { kind: 'add', value: 30 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
      ],
    })

    const context = createCharacterCalculationContext(character, {})

    expect(context.initiativeModifier).toBe(5)
    expect(context.senses).toEqual([{ type: 'darkvision', range: 90 }])
  })

  test('falls back to raw item data when filtered item effects cannot resolve', () => {
    const item = {
      name: 'Ring of Protection',
      source: 'DMG',
      type: 'RG',
      bonusAc: '+1',
    } as Item5e
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'ring',
          name: item.name,
          source: item.source,
          type: item.type,
          quantity: 1,
          equipped: true,
        },
      ],
    })

    const context = createCharacterCalculationContext(
      character,
      { itemLookup: new Map() },
      { itemLookup: new Map([['Ring of Protection|DMG', item]]) },
    )

    expect(context.effects.sourceDeclarations).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: { kind: 'armor-class' } })]),
    )
  })

  test('includes source-qualified feat grants from every persisted feat owner', () => {
    const feat = {
      name: 'Test Enduring Feature',
      source: 'TEST',
      resist: ['test damage'],
    } as Feat5e
    const conflictingFeat = {
      name: feat.name,
      source: 'OTHER',
      immune: ['other damage'],
    } as Feat5e
    const selectedFeat = { id: 'selected', name: feat.name, source: feat.source, description: '' }
    const character = makeCharacterFixture({ specialFeats: [selectedFeat] })

    const context = createCharacterCalculationContext(character, {
      featsByKey: buildFeatLookup([conflictingFeat, feat]),
    })

    expect(context.effects.declarations.map((effect) => effect.target)).toContainEqual({
      kind: 'damage-resistance',
      damageType: 'test damage',
    })
    expect(context.effects.declarations.map((effect) => effect.target)).not.toContainEqual({
      kind: 'damage-immunity',
      damageType: 'other damage',
    })
  })
})
