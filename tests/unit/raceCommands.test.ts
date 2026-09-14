import { describe, expect, test } from 'vitest'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { makeSourceTag } from '@/lib/provenance'
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

  test('changing race retracts options owned by its feat choice', () => {
    const choiceId = 'variant-human-feat'
    const character = makeCharacterFixture({
      race: 'Variant Human',
      raceSource: 'PHB',
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['arcana'],
        languages: [],
        savingThrows: [],
      },
      skills: { arcana: { proficient: true, expertise: false, bonus: 0 } },
    })
    const ledger = {
      ...emptyProvenance(),
      proficiencies: {
        ...emptyProvenance().proficiencies,
        skills: {
          arcana: [
            {
              ...makeSourceTag('feat', 'Skill Expert', 'choice', 'TCE'),
              grantVariant: `choice:${choiceId}`,
            },
          ],
        },
      },
      choices: [
        {
          id: choiceId,
          domain: 'feats' as const,
          sourceTag: makeSourceTag('race', 'Variant Human', 'placeholder', 'PHB'),
          chooseCount: 1,
          optionPool: [],
          selected: ['Skill Expert'],
          selectedRefs: [{ name: 'Skill Expert', source: 'TCE', options: { skills: ['Arcana'] } }],
          status: 'resolved' as const,
        },
      ],
    }

    const result = applyRaceSelectionCommand(
      character,
      ledger,
      { name: 'Elf', source: 'PHB' } as Race5e,
      undefined,
      0,
      resolveNoChoices,
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.skills?.arcana?.proficient).toBe(false)
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })
})
