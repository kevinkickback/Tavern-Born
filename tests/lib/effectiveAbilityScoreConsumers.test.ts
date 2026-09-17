import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { buildPrerequisiteSnapshot, checkPrerequisite } from '@/lib/calculations/prerequisites'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('effective ability score consumers', () => {
  test('uses one effective score set for rules, spellcasting, and both PDF projections', () => {
    const elf = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dex: 2 }],
    } as Race5e
    const wizard = {
      name: 'Wizard',
      source: 'PHB',
      hd: { faces: 6 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
      preparedSpells: '<$level$> + <$int_mod$>',
    } as Class5e
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      race: 'Elf',
      raceSource: 'PHB',
      abilityScores: {
        strength: 8,
        dexterity: 14,
        constitution: 13,
        intelligence: 15,
        wisdom: 12,
        charisma: 10,
      },
      asiChoices: [
        {
          id: 'wizard|PHB|4',
          level: 4,
          className: 'Wizard',
          classSource: 'PHB',
          abilityChanges: { intelligence: 1, constitution: 1 },
        },
      ],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['acrobatics'],
        expertise: [],
        languages: [],
        savingThrows: ['intelligence'],
      },
      equipment: [
        {
          id: 'leather',
          name: 'Leather Armor',
          type: 'LA',
          quantity: 1,
          equipped: true,
          ac: 11,
          armorType: 'light',
        },
      ],
      hitPoints: { current: 0, temporary: 0 },
    })
    const lookups = {
      classesByKey: buildClassLookup([wizard]),
      racesByKey: buildRaceLookup([elf]),
    }

    const viewModel = createCharacterSheetViewModel(character, lookups)
    const prerequisiteSnapshot = buildPrerequisiteSnapshot({
      character,
      effectiveAbilityScores: viewModel.effectiveAbilityScores,
    })
    const pdf2014 = mapCharacterSheet2014(viewModel)
    const pdf2024 = mapCharacterSheet2024(viewModel)

    expect(viewModel.effectiveAbilityScores).toMatchObject({
      dexterity: 16,
      constitution: 14,
      intelligence: 16,
    })
    expect(viewModel.abilityModifiers).toMatchObject({
      dexterity: 3,
      constitution: 2,
      intelligence: 3,
    })
    expect(viewModel.effectiveArmorClass).toBe(14)
    expect(viewModel.maxHP).toBe(26)
    expect(viewModel.skillByName.get('acrobatics')?.modifier).toBe(5)
    expect(viewModel.savingThrowByAbility.get('intelligence')?.modifier).toBe(5)
    expect(viewModel.spellcastingDetails[0]).toMatchObject({
      spellSaveDC: 13,
      spellAttackBonus: 5,
      preparedSpellLimit: 7,
    })
    expect(
      checkPrerequisite({ ability: [{ ability: 'int', score: 16 }] }, prerequisiteSnapshot).met,
    ).toBe(true)
    expect(pdf2014.textFields).toMatchObject({
      Dex: '16',
      Con: '14',
      Int: '16',
      'Dex Mod': '+3',
      AC: '14',
      'HP Max': '26',
    })
    expect(pdf2024.textFields).toMatchObject({
      Text_26: '16',
      Text_27: '14',
      Text_30: '16',
      Text_23: '+3',
      Text_8: '14',
      Text_11: '26',
    })
  })
})
