import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { makeSourceTag } from '@/lib/provenance'
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

  test('changing background retracts options owned by its feat choice', () => {
    const choiceId = 'sage-feat'
    const character = makeCharacterFixture({
      background: 'Sage',
      backgroundSource: 'PHB',
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
          sourceTag: makeSourceTag('background', 'Sage', 'placeholder', 'PHB'),
          chooseCount: 1,
          optionPool: [],
          selected: ['Skill Expert'],
          selectedRefs: [{ name: 'Skill Expert', source: 'TCE', options: { skills: ['Arcana'] } }],
          status: 'resolved' as const,
        },
      ],
    }

    const result = applyBackgroundSelectionCommand(
      character,
      ledger,
      { name: 'Soldier', source: 'PHB' } as Background5e,
      [],
      buildItemLookup([]),
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.skills?.arcana?.proficient).toBe(false)
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })
})
