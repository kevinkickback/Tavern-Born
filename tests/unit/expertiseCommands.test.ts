import { describe, expect, test } from 'vitest'
import { toggleExpertiseCommand } from '@/lib/character/commands/expertiseCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('expertise commands', () => {
  test('manual expertise toggles atomically and preserves a separate feat owner', () => {
    const character = makeCharacterFixture()
    const feat = { name: 'Training', source: 'PHB', fixedGrant: true }
    const configured = applyCharacterCommandResult(
      character,
      commitFeatOptionsCommand(character, character.provenance, feat, { expertiseSkill: 'Arcana' }),
    )
    const snapshot = structuredClone(configured)
    const clicked = applyCharacterCommandResult(
      configured,
      toggleExpertiseCommand(configured, configured.provenance, ' ARCANA '),
    )
    expect(clicked.proficiencies.expertise).toEqual(['arcana'])
    expect(clicked.provenance.proficiencies.expertise?.arcana).toEqual(
      configured.provenance.proficiencies.expertise?.arcana,
    )
    expect(configured).toEqual(snapshot)
  })

  test('removes only manual expertise ownership and retains another owner', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        ...makeCharacterFixture().proficiencies,
        skills: ['arcana'],
        expertise: ['arcana'],
      },
    })
    const manual = makeSourceTag('manual', 'User Choice', 'choice')
    const featOwner = {
      ...makeSourceTag('feat', 'Training', 'choice', 'PHB'),
      grantVariant: 'fixed:',
    }
    let ledger = addGrant(character.provenance, 'expertise', 'Arcana', manual)
    ledger = addGrant(ledger, 'expertise', 'Arcana', featOwner)
    const result = toggleExpertiseCommand(character, ledger, 'Arcana')
    expect(result.characterPatch.proficiencies?.expertise).toEqual(['arcana'])
    expect(result.provenanceUpdate.proficiencies.expertise?.arcana).toEqual([featOwner])
  })

  test('adds/removes a manual selection without changing proficiency or unowned legacy fields', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        ...makeCharacterFixture().proficiencies,
        skills: ['arcana'],
        expertise: [],
      },
    })
    const selected = applyCharacterCommandResult(
      character,
      toggleExpertiseCommand(character, character.provenance, 'Arcana'),
    )
    expect(selected.provenance.proficiencies.expertise?.arcana).toEqual([
      makeSourceTag('manual', 'User Choice', 'choice'),
    ])
    const cleared = toggleExpertiseCommand(selected, selected.provenance, 'Arcana')
    expect(cleared.characterPatch.proficiencies?.expertise).toEqual([])
    expect(cleared.characterPatch.proficiencies?.skills).toEqual(['arcana'])
    expect(cleared.provenanceUpdate.proficiencies.expertise).toEqual({})
    expect(
      toggleExpertiseCommand(character, character.provenance, 'Stealth').characterPatch,
    ).toEqual({})
  })

  test('retains unknown saved expertise while retracting owned expertise from a different skill', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        ...makeCharacterFixture().proficiencies,
        skills: ['history'],
        expertise: ['history'],
      },
    })
    const feat = { name: 'Training', source: 'PHB', fixedGrant: true }
    const options = { expertiseSkill: 'Arcana' }
    const configured = applyCharacterCommandResult(
      character,
      commitFeatOptionsCommand(character, character.provenance, feat, options),
    )
    const removed = retractFeatOptionsCommand(configured, configured.provenance, feat, options)
    expect(removed.characterPatch.proficiencies?.skills).toEqual(['history'])
    expect(removed.characterPatch.proficiencies?.expertise).toEqual(['history'])
    expect(removed.provenanceUpdate.proficiencies.expertise).toEqual({})
  })
})
