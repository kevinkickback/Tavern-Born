import { describe, expect, test } from 'vitest'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { emptyProvenance } from '@/store/characterStore'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const resolveNoChoices = () => []

describe('race commands', () => {
  test('applies identity, proficiencies, and traits in one result', () => {
    const character = makeCharacterFixture({ race: '', raceSource: '' })
    const race = {
      name: 'Elf',
      source: 'PHB',
      skillProficiencies: [{ perception: true }],
      languageProficiencies: [{ elvish: true }],
      darkvision: 60,
      resist: ['fire'],
    } as Race5e

    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      undefined,
      0,
      resolveNoChoices,
    )

    expect(result.characterPatch.race).toBe('Elf')
    expect(result.characterPatch.raceSource).toBe('PHB')
    expect(result.characterPatch.proficiencies?.skills).toContain('perception')
    expect(result.characterPatch.proficiencies?.languages).toContain('elvish')
    expect(result.characterPatch.visions).toContainEqual({ type: 'darkvision', range: 60 })
    expect(result.characterPatch.damageResistances).toEqual(['fire'])
  })

  test('subrace selection owns identity and resets race ASI choices', () => {
    const character = makeCharacterFixture({
      race: 'Dwarf',
      raceSource: 'PHB',
      raceAsiChoices: [['strength']],
    })
    const race = { name: 'Dwarf', source: 'PHB', darkvision: 60 } as Race5e
    const subrace = { name: 'Duergar', source: 'SCAG', darkvision: 120 } as Race5e

    const result = applySubraceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      subrace,
      resolveNoChoices,
    )

    expect(result.characterPatch.subrace).toBe('Duergar')
    expect(result.characterPatch.subraceSource).toBe('SCAG')
    expect(result.characterPatch.raceAsiChoices).toEqual([])
    expect(result.characterPatch.visions).toContainEqual({ type: 'darkvision', range: 120 })
  })
})
