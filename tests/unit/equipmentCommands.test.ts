import { describe, expect, test } from 'vitest'
import {
  addManualEquipmentCommand,
  applyManualProficiencyCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const item: Item5e = {
  name: 'Chain Shirt',
  source: 'PHB',
  type: 'MA',
  ac: 13,
  weight: 20,
}

describe('equipment commands', () => {
  test('adds inventory and manual provenance in one result', () => {
    const character = makeCharacterFixture()
    const result = addManualEquipmentCommand(
      character,
      character.provenance ?? emptyProvenance(),
      item,
    )

    expect(result.characterPatch.equipment).toEqual([
      expect.objectContaining({
        name: 'Chain Shirt',
        source: 'PHB',
        armorType: 'medium',
        quantity: 1,
        equipped: false,
      }),
    ])
    expect(result.provenanceUpdate.equipment['chain shirt']).toEqual([
      expect.objectContaining({ sourceType: 'manual', sourceName: 'User Choice' }),
    ])
  })

  test('keeps manual provenance while another matching inventory row remains', () => {
    const character = makeCharacterFixture({
      equipment: [
        { id: 'first', name: item.name, type: 'MA', quantity: 1, equipped: false },
        { id: 'second', name: item.name, type: 'MA', quantity: 1, equipped: false },
      ],
    })
    const ledger = addGrant(
      character.provenance ?? emptyProvenance(),
      'equipment',
      item.name,
      makeSourceTag('manual', 'User Choice', 'choice'),
    )

    const result = removeManualEquipmentCommand(character, ledger, 'first')

    expect(result.characterPatch.equipment).toHaveLength(1)
    expect(result.provenanceUpdate.equipment['chain shirt']).toHaveLength(1)
  })

  test('removes only manual provenance with the last matching inventory row', () => {
    const character = makeCharacterFixture({
      equipment: [{ id: 'only', name: item.name, type: 'MA', quantity: 1, equipped: false }],
    })
    const classTag = makeSourceTag('class', 'Fighter', 'fixed', 'PHB')
    const manualTag = makeSourceTag('manual', 'User Choice', 'choice')
    const ledger = addGrant(
      addGrant(character.provenance ?? emptyProvenance(), 'equipment', item.name, classTag),
      'equipment',
      item.name,
      manualTag,
    )

    const result = removeManualEquipmentCommand(character, ledger, 'only')

    expect(result.characterPatch.equipment).toEqual([])
    expect(result.provenanceUpdate.equipment['chain shirt']).toEqual([classTag])
  })

  test('updates skill materialization and provenance together', () => {
    const character = makeCharacterFixture()
    const added = applyManualProficiencyCommand(
      character,
      character.provenance ?? emptyProvenance(),
      'skills',
      'Arcana',
      true,
    )

    expect(added.characterPatch.proficiencies?.skills).toEqual(['arcana'])
    expect(added.characterPatch.skills?.arcana).toEqual({
      proficient: true,
      expertise: false,
      bonus: 0,
    })
    expect(added.provenanceUpdate.proficiencies.skills.arcana).toHaveLength(1)

    const updatedCharacter = {
      ...character,
      ...added.characterPatch,
      provenance: added.provenanceUpdate,
    }
    const removed = applyManualProficiencyCommand(
      updatedCharacter,
      added.provenanceUpdate,
      'skills',
      'Arcana',
      false,
    )

    expect(removed.characterPatch.proficiencies?.skills).toEqual([])
    expect(removed.characterPatch.skills?.arcana?.proficient).toBe(false)
    expect(removed.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })
})
