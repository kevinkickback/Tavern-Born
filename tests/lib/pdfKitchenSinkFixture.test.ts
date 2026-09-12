import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { validateCharacterData } from '@/store/characterStore'
import type { Class5e, Race5e } from '@/types/5etools'
import { characterSchema } from '@/types/characterSchema'

const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'pdf-kitchen-sink.tbc')

function loadFixture() {
  return characterSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')))
}

describe('PDF kitchen sink character fixture', () => {
  test('is importable current-schema character data with high-capacity coverage', () => {
    const rawCharacter = JSON.parse(readFileSync(fixturePath, 'utf8'))
    const character = characterSchema.parse(rawCharacter)

    expect(validateCharacterData(rawCharacter)).toBeNull()
    expect(character.version).toBe('6.0.0')
    expect(character.classProgression).toHaveLength(3)
    expect(character.subrace).toBe('High')
    expect(character.spells.spellProfiles).toHaveLength(4)
    expect(character.equipment).toHaveLength(90)
    expect(character.features).toHaveLength(17)
    expect(character.proficiencies.skills).toHaveLength(18)
    expect(character.details.allies).toHaveLength(3)
    expect(character.hitPointGains).toHaveLength(19)
  })

  test('exercises both template mappings through their fixed row capacities', () => {
    const character = loadFixture()
    const classes: Class5e[] = [
      {
        name: 'Wizard',
        source: 'PHB',
        spellcastingAbility: 'int',
        casterProgression: 'full',
        hd: { faces: 6 },
      } as Class5e,
      { name: 'Fighter', source: 'PHB', hd: { faces: 10 } } as Class5e,
      {
        name: 'Cleric',
        source: 'PHB',
        spellcastingAbility: 'wis',
        casterProgression: 'full',
        hd: { faces: 8 },
      } as Class5e,
    ]
    const races = [{ name: 'Elf', source: 'PHB', size: ['M'] } as Race5e]
    const viewModel = createCharacterSheetViewModel(character, {
      classesByKey: buildClassLookup(classes),
      racesByKey: buildRaceLookup(races),
      backgroundsByKey: {},
      itemPropertyByAbbr: {
        A: 'Ammunition',
        F: 'Finesse',
        H: 'Heavy',
        L: 'Light',
        T: 'Thrown',
        V: 'Versatile',
        '2H': 'Two-Handed',
      },
    })
    const map2014 = buildCharacterSheetFieldMap(viewModel, '2014')
    const map2024 = buildCharacterSheetFieldMap(viewModel, '2024')

    expect(viewModel.weaponRows).toHaveLength(6)
    expect(viewModel.spellRows).toHaveLength(31)
    expect(viewModel.magicItems).toHaveLength(5)
    expect(map2014.textFields['Extra.Gear Row 36']).toBe(character.equipment[89]?.name)
    expect(map2014.textFields['Attack.5.Weapon Selection']).not.toBe('')
    expect(map2024.textFields.Text_66).not.toBe('')
    expect(map2024.textFields.Text_151).not.toBe('')
    expect(map2024.textFields.Text_214).toBe('Ring of Spell Storing')
  })
})
