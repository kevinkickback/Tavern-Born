import { describe, expect, test } from 'vitest'
import {
  applyOptionalFeatureSelectionCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceOptionalFeatureSelectionsCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { emptyProvenance } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function applyResult(
  character: ReturnType<typeof makeCharacterFixture>,
  result: ReturnType<typeof commitFeatOptionsCommand>,
) {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

describe('feat commands', () => {
  test('replaces optional features and accumulates provenance in one result', () => {
    const character = makeCharacterFixture({
      features: [
        { id: 'old-opt', name: 'Old Invocation', source: 'PHB', description: '' },
        { id: 'race-feature', name: 'Darkvision', source: 'PHB', description: '' },
      ],
    })
    const ledger = applyOptionalFeatureSelectionCommand(
      character.provenance ?? emptyProvenance(),
      'Old Invocation',
      'PHB',
      'Warlock',
      'class',
    ).provenanceUpdate

    const result = replaceOptionalFeatureSelectionsCommand(
      character,
      ledger,
      [{ name: 'Old Invocation', source: 'PHB' }],
      [
        { name: 'Agonizing Blast', source: 'PHB' },
        { name: 'Repelling Blast', source: 'PHB' },
      ],
      'Warlock',
      'class',
    )

    expect(result.characterPatch.features?.map((feature) => feature.name)).toEqual([
      'Darkvision',
      'Agonizing Blast',
      'Repelling Blast',
    ])
    expect(result.provenanceUpdate.features['old invocation']).toBeUndefined()
    expect(result.provenanceUpdate.features['agonizing blast']).toHaveLength(1)
    expect(result.provenanceUpdate.features['repelling blast']).toHaveLength(1)
  })

  test('option grants apply and retract symmetrically', () => {
    const character = makeCharacterFixture({
      specialFeats: [{ id: 'bonus-skilled', name: 'Skilled', source: 'PHB', description: '' }],
    })
    const committed = commitFeatOptionsCommand(
      character,
      emptyProvenance(),
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'], abilityScore: 'int' },
    )
    const configured = applyResult(character, committed)

    expect(configured.proficiencies.skills).toEqual(['arcana'])
    expect(configured.abilityScores.intelligence).toBe(11)
    expect(configured.provenance.proficiencies.skills.arcana).toHaveLength(1)

    const retracted = retractFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'], abilityScore: 'int' },
    )

    expect(retracted.characterPatch.proficiencies?.skills).toEqual([])
    expect(retracted.characterPatch.skills?.arcana).toMatchObject({
      proficient: false,
      expertise: false,
    })
    expect(retracted.characterPatch.abilityScores?.intelligence).toBe(10)
    expect(retracted.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })

  test('editing options retracts old grants before applying new grants', () => {
    const character = makeCharacterFixture({
      specialFeats: [
        {
          id: 'bonus-skilled',
          name: 'Skilled',
          source: 'PHB',
          description: '',
          options: { skills: ['Arcana'] },
        },
      ],
    })
    const committed = commitFeatOptionsCommand(
      character,
      emptyProvenance(),
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'] },
    )
    const configured = applyResult(character, committed)
    const edited = editFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'] },
      { skills: ['History'] },
    )

    expect(edited.characterPatch.proficiencies?.skills).toEqual(['history'])
    expect(edited.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
    expect(edited.provenanceUpdate.proficiencies.skills.history).toHaveLength(1)
  })
})
