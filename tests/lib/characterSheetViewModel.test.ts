import { describe, expect, test } from 'vitest'
import { buildBackgroundLookup, buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Background5e, Class5e, Organization5e, Race5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('createCharacterSheetViewModel', () => {
  test('maps active structured actions into the fixed 2014 capacities', () => {
    const viewModel = createCharacterSheetViewModel(makeCharacterFixture(), {})
    const action = (
      id: string,
      kind: CharacterAction['kind'],
      sourceKind: CharacterAction['source']['kind'] = 'manual',
    ): CharacterAction => ({
      id,
      name: `Test ${id}`,
      kind,
      description: `Description ${id}.`,
      source: { kind: sourceKind, name: `Source ${id}` },
      active: true,
    })
    const actions: CharacterAction[] = [
      {
        ...action('derived', 'action', 'spell'),
        attackBonus: 4,
        range: 'Test range',
        damage: [{ dice: '1d6', bonus: 2, damageType: 'test damage' }],
      },
      ...Array.from({ length: 7 }, (_, index) => action(`manual-${index + 1}`, 'action')),
      {
        ...action('bonus', 'bonus-action'),
        save: { ability: 'wisdom', dc: 13 },
        resourceCost: { resourceId: 'test-resource', amount: 1 },
        recharge: { rest: 'short', note: 'Test recharge.' },
      },
      action('reaction', 'reaction'),
      action('weapon', 'attack'),
      { ...action('inactive', 'reaction'), active: false },
    ]

    const map = mapCharacterSheet2014({ ...viewModel, actions })

    expect(map.textFields['Action 1']).toBe('Test manual-1: Description manual-1')
    expect(map.textFields['Action 6']).toBe('Test manual-6: Description manual-6')
    expect(map.textFields['Action 7']).toBeUndefined()
    expect(map.textFields['Bonus Action 1']).toBe(
      'Test bonus: DC 13 Wisdom; 1 test-resource; Short rest; Test recharge',
    )
    expect(map.textFields['Bonus Action 2']).toBe('')
    expect(map.textFields['Reaction 1']).toBe('Test reaction: Description reaction')
    expect(map.textFields['Reaction 2']).toBe('')
    expect(Object.values(map.textFields)).not.toContain('Test weapon: Description weapon.')
    expect(Object.values(map.textFields)).not.toContain('Test inactive: Description inactive.')
  })

  test('resolves source-qualified entities and merges nested subrace data before mapping', () => {
    const phbWizard = {
      name: 'Wizard',
      source: 'PHB',
      hd: { faces: 6 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
    } as Class5e
    const xphbWizard = {
      name: 'Wizard',
      source: 'XPHB',
      hd: { faces: 8 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
    } as Class5e
    const highElf = {
      name: 'High Elf',
      source: 'PHB',
      darkvision: 120,
      size: ['S'],
    } as Race5e
    const elf = {
      name: 'Elf',
      source: 'PHB',
      darkvision: 60,
      size: ['M'],
      subraces: [highElf],
    } as Race5e
    const background = {
      name: 'Sage',
      source: 'PHB',
      entries: [
        {
          type: 'entries',
          name: 'Feature: Researcher',
          entries: ['You know where to find lore.'],
        },
      ],
    } as Background5e
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      race: 'Elf',
      raceSource: 'PHB',
      subrace: 'High Elf',
      subraceSource: 'PHB',
      background: 'Sage',
      backgroundSource: 'PHB',
      visions: [],
      hitPoints: { max: 0, current: 0, temporary: 0 },
    })

    const viewModel = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup([xphbWizard, phbWizard]),
      racesByKey: buildRaceLookup([elf]),
      backgroundsByKey: buildBackgroundLookup([background]),
    })

    expect(viewModel.resolvedClasses).toEqual([phbWizard])
    expect(viewModel.mergedRace?.darkvision).toBe(120)
    expect(viewModel.mergedRace?.size).toEqual(['S'])
    expect(viewModel.visionSummary).toBe('Darkvision 120 ft.')
    expect(viewModel.background).toBe(background)
    expect(viewModel.backgroundFeature).toEqual({
      name: 'Researcher',
      description: 'You know where to find lore.',
    })
    expect(viewModel.maxHP).toBe(6)
  })

  test('resolves an unambiguous class printing for a legacy source-less spell profile', () => {
    const warlock = {
      name: 'Warlock',
      source: 'PHB',
      hd: { faces: 8 },
      spellcastingAbility: 'cha',
      casterProgression: 'pact',
      cantripProgression: [2],
      spellsKnownProgression: [2],
    } as Class5e
    const character = makeCharacterFixture({
      class: warlock.name,
      classSource: undefined,
      classProgression: [{ name: warlock.name, source: undefined, levels: 1 }],
    })

    const viewModel = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup([warlock]),
    })

    expect(viewModel.spellcastingDetails).toHaveLength(1)
    expect(viewModel.spellcastingDetails[0]).toMatchObject({
      profileId: 'class:Warlock|',
      className: 'Warlock',
      spellcastingAbility: 'charisma',
    })
  })

  test('resolves preset and custom organization images', () => {
    const organizations = [
      {
        name: 'Harpers',
        source: 'SCAG',
        description: 'A covert network.',
        imagePath: '/assets/images/factions/harpers-5e.webp',
      } as Organization5e,
    ]
    const preset = createCharacterSheetViewModel(
      makeCharacterFixture({ details: { organizationSelectionKey: 'Harpers|SCAG' } }),
      { organizations },
    )
    const custom = createCharacterSheetViewModel(
      makeCharacterFixture({
        details: {
          organizationSelectionKey: '__custom__',
          organizationCustomImage: 'data:image/png;base64,custom-image',
        },
      }),
      { organizations },
    )

    expect(preset.organizationImage).toBe('/assets/images/factions/harpers-5e.webp')
    expect(custom.organizationImage).toBe('data:image/png;base64,custom-image')
  })

  test('projects structured movement into both fixed PDF templates', () => {
    const viewModel = createCharacterSheetViewModel(
      makeCharacterFixture({
        speed: 30,
        movement: {
          speeds: { walk: 25, swim: 30, fly: 40 },
          hover: true,
          source: { kind: 'race', name: 'River Dwarf', source: 'HB' },
        },
      }),
      {},
    )

    const map2014 = mapCharacterSheet2014(viewModel)
    const map2024 = mapCharacterSheet2024(viewModel)

    expect(viewModel.movementSummary).toBe('walk 25 ft., swim 30 ft., fly 40 ft. (hover)')
    expect(map2014.textFields.Speed).toBe('25 ft')
    expect(map2014.textFields['Speed encumbered']).toBe('15 ft')
    expect(map2014.textFields['Racial Traits']).toContain(
      'Additional movement: swim 30 ft., fly 40 ft. (hover)',
    )
    expect(map2024.textFields.Text_17).toBe('25 ft')
    expect(map2024.textFields.Text_59).toContain(
      'Additional movement: swim 30 ft., fly 40 ft. (hover)',
    )
  })

  test('uses the shared effect totals in both fixed PDF templates', () => {
    const testClass = {
      name: 'Test Class',
      source: 'TEST',
      hd: { faces: 8 },
    } as Class5e
    const character = makeCharacterFixture({
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hitPoints: { max: 0, current: 0, temporary: 0 },
      manualEffects: [
        {
          id: 'test-strength',
          label: 'Test strength adjustment',
          target: { kind: 'ability-score', ability: 'strength' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Test strength adjustment' },
        },
        {
          id: 'test-armor-class',
          label: 'Test armor class adjustment',
          target: { kind: 'armor-class' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Test armor class adjustment' },
        },
        {
          id: 'test-hit-points',
          label: 'Test hit point adjustment',
          target: { kind: 'hit-point-maximum' },
          operation: { kind: 'add', value: 3 },
          source: { kind: 'manual', name: 'Test hit point adjustment' },
        },
        {
          id: 'test-speed',
          label: 'Test speed adjustment',
          target: { kind: 'speed', mode: 'walk' },
          operation: { kind: 'add', value: 5 },
          source: { kind: 'manual', name: 'Test speed adjustment' },
        },
      ],
    })

    const viewModel = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup([testClass]),
    })
    const map2014 = mapCharacterSheet2014(viewModel)
    const map2024 = mapCharacterSheet2024(viewModel)

    expect(viewModel.effectiveAbilityScores.strength).toBe(12)
    expect(viewModel.effectiveArmorClass).toBe(14)
    expect(viewModel.maxHP).toBe(12)
    expect(viewModel.walkingSpeed).toBe(35)
    expect(map2014.textFields.Str).toBe('12')
    expect(map2014.textFields.AC).toBe('14')
    expect(map2014.textFields['HP Max']).toBe('12')
    expect(map2014.textFields.Speed).toBe('35 ft')
    expect(map2024.textFields.Text_25).toBe('12')
    expect(map2024.textFields.Text_8).toBe('14')
    expect(map2024.textFields.Text_11).toBe('12')
    expect(map2024.textFields.Text_17).toBe('35 ft')
  })

  test('applies every structured equipped-item bonus through the shared PDF view model', () => {
    const testClass = {
      name: 'Test Caster',
      source: 'TEST',
      hd: { faces: 8 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
    } as Class5e
    const itemData = {
      name: 'Test Focus',
      source: 'TEST',
      type: 'G',
      reqAttune: true,
      bonusAc: '+1',
      bonusSavingThrow: '+1',
      bonusAbilityCheck: '+1',
      bonusSpellAttack: '+1',
      bonusSpellSaveDc: '+1',
      modifySpeed: { bonus: { '*': 5 } },
    }
    const character = makeCharacterFixture({
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      equipment: [
        {
          id: 'test-focus',
          name: itemData.name,
          source: itemData.source,
          type: itemData.type,
          quantity: 1,
          equipped: true,
          attuned: true,
          reqAttune: true,
        },
      ],
    })
    const viewModel = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup([testClass]),
      itemLookup: new Map([['test', itemData]]),
    })
    const map2014 = mapCharacterSheet2014(viewModel)
    const map2024 = mapCharacterSheet2024(viewModel)

    expect(viewModel.effectiveArmorClass).toBe(13)
    expect(viewModel.walkingSpeed).toBe(35)
    expect(viewModel.savingThrowByAbility.get('strength')?.modifier).toBe(1)
    expect(viewModel.skillByName.get('athletics')?.modifier).toBe(1)
    expect(viewModel.spellcastingDetails[0]?.spellAttackBonus).toBe(3)
    expect(viewModel.spellcastingDetails[0]?.spellSaveDC).toBe(11)
    expect(map2014.textFields.AC).toBe('13')
    expect(map2014.textFields.Speed).toBe('35 ft')
    expect(map2024.textFields.Text_8).toBe('13')
    expect(map2024.textFields.Text_17).toBe('35 ft')
  })
})
