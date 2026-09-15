import { describe, expect, test } from 'vitest'
import { buildBackgroundLookup, buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Background5e, Class5e, Organization5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('createCharacterSheetViewModel', () => {
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
})
