import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { emptyProvenance } from '@/store/characterStore'
import type { Background5e, Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('background commands', () => {
  test('applies identity, proficiencies, equipment, and currency in one result', () => {
    const pouch = { name: 'Pouch', source: 'PHB', type: 'G' } as Item5e
    const background = {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ insight: true }],
      languageProficiencies: [{ celestial: true }],
      startingEquipment: [
        {
          a: ['Pouch|PHB', { value: 250 }],
        },
      ],
    } as Background5e
    const character = makeCharacterFixture({ background: '', backgroundSource: '' })

    const result = applyBackgroundSelectionCommand(
      character,
      emptyProvenance(),
      background,
      ['a'],
      buildItemLookup([pouch]),
    )

    expect(result.characterPatch.background).toBe('Acolyte')
    expect(result.characterPatch.backgroundSource).toBe('PHB')
    expect(result.characterPatch.proficiencies?.skills).toContain('insight')
    expect(result.characterPatch.proficiencies?.languages).toContain('celestial')
    expect(result.characterPatch.equipment?.map((item) => item.name)).toContain('Pouch')
    expect(result.characterPatch.backgroundEquipmentChoices).toEqual(['a'])
    expect(result.characterPatch.currency?.gp).toBe(2)
    expect(result.characterPatch.currency?.sp).toBe(5)
  })
})
