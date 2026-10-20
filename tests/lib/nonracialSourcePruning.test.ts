import { describe, expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { addSpellToCharacter } from '@/lib/character/commands/spellCommands'
import { pruneSpellsForDisabledSources } from '@/lib/sourceConflicts'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import { makeNonracialSourceCharacter } from '../fixtures/nonracialSourceCharacter'

const { lookups } = makeManagedClassSpellFixtures()
describe('source suspension retains class spell intent', () => {
  test.each([
    '2014',
    '2024',
  ] as const)('%s toggles exact class source without deleting intent or independent Bonus ownership', (originSystem) => {
    const saved = characterPersistenceSchema.parse(makeNonracialSourceCharacter(originSystem))
    const disabled = 'XGE'
    const selected = saved.spells.spellProfiles.find((row) => row.type === 'class')!.cantrips[0]
    const before = JSON.stringify(saved)
    saved.spells.spellSlots[1] = { max: 2, used: 1 }
    const patch = pruneSpellsForDisabledSources(
      saved,
      ['PHB', 'XPHB'],
      Object.values(lookups.spellsByKey),
    )
    expect(patch).toBeNull()
    const hidden = { ...saved, allowedSources: ['PHB', 'XPHB'] }
    const primary = {
      ...lookups,
      spellsByKey: Object.fromEntries(
        Object.entries(lookups.spellsByKey).filter(([, row]) => row.source !== disabled),
      ),
    }
    const current = createCharacterCalculationContext(hidden, primary, lookups)
    expect(
      current.character.spells.spellProfiles.find((row) => row.type === 'class')?.cantrips,
    ).not.toContain(selected)
    expect(current.managedClassSpellStatuses[0].active).toBe(false)
    expect(
      current.character.spells.spellProfiles.find((row) => row.type === 'special')?.cantrips,
    ).toEqual(saved.spells.spellProfiles.find((row) => row.type === 'special')?.cantrips)
    const restored = createCharacterCalculationContext(
      characterPersistenceSchema.parse(saved),
      lookups,
    )
    expect(
      restored.character.spells.spellProfiles.find((row) => row.type === 'class')?.cantrips,
    ).toContain(selected)
    expect(restored.character.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
    expect(saved.spells.spellSlots[1].used).toBe(1)
    saved.spells.spellSlots[1] = { max: 0, used: 0 }
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('mixed Bonus pruning final sweep retains exact reserved numeric ownership and another printing', () => {
    let saved = makeNonracialSourceCharacter()
    const bonus = addSpellToCharacter(
      saved,
      saved.provenance,
      'Toll the Dead|XGE',
      'cantrip',
      'special:unrestricted',
    )
    saved = characterPersistenceSchema.parse({
      ...saved,
      ...bonus.characterPatch,
      provenance: bonus.provenanceUpdate,
    })
    const patch = pruneSpellsForDisabledSources(
      saved,
      ['XPHB'],
      Object.values(lookups.spellsByKey),
    )!
    const reopened = characterPersistenceSchema.parse({ ...saved, ...patch })
    expect(reopened.spells.spellProfiles.find((row) => row.type === 'class')?.cantrips).toEqual([
      'Toll the Dead|XGE',
    ])
    expect(reopened.spells.spellProfiles.find((row) => row.type === 'special')?.cantrips).toEqual([
      'Toll the Dead|XPHB',
    ])
    expect(reopened.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ grantSource: 'XGE', sourceType: 'class' }),
      expect.objectContaining({ grantSource: 'XPHB', sourceType: 'manual' }),
    ])
    expect(reopened.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
    expect(reopened.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
  })
})
