import { describe, expect, test } from 'vitest'
import {
  correctSpellSlotUsageCommand,
  reconcileSpellSlotMaximaCommand,
  restoreSpellSlotCommand,
  spendSpellSlotCommand,
} from '@/lib/character/commands/spellSlotCommands'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('spell slot commands', () => {
  test('spends, restores, and manually corrects shared and pact pools independently', () => {
    const character = makeCharacterFixture()
    const spentShared = spendSpellSlotCommand(character, 'shared', 1, 3, 2)
    const spentPact = spendSpellSlotCommand(spentShared as typeof character, 'pact', 1, 2)

    expect(spentPact.spells.spellSlots[1]).toEqual({ max: 3, used: 2 })
    expect(spentPact.spells.pactSpellSlots?.[1]).toEqual({ max: 2, used: 1 })

    const restored = restoreSpellSlotCommand(spentPact as typeof character, 'shared', 1, 3, 1)
    expect(restored.spells.spellSlots[1]?.used).toBe(1)
    expect(
      correctSpellSlotUsageCommand(restored as typeof character, 'pact', 1, 99, 2).spells
        .pactSpellSlots?.[1],
    ).toEqual({ max: 2, used: 2 })
  })

  test('rejects overspending and reconciles changed maxima without refilling existing usage', () => {
    const character = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellSlots: { 1: { max: 4, used: 3 }, 2: { max: 2, used: 1 } },
        pactSpellSlots: { 2: { max: 2, used: 2 } },
      },
    })

    expect(() => spendSpellSlotCommand(character, 'shared', 1, 3)).toThrow(/available/i)

    const reconciled = reconcileSpellSlotMaximaCommand(character, {
      shared: { 1: { max: 2 }, 2: { max: 3 }, 3: { max: 1 } },
      pact: { 2: { max: 1 } },
    })
    expect(reconciled.spells.spellSlots[1]).toEqual({ max: 2, used: 2 })
    expect(reconciled.spells.spellSlots[2]).toEqual({ max: 3, used: 1 })
    expect(reconciled.spells.spellSlots[3]).toEqual({ max: 1, used: 0 })
    expect(reconciled.spells.pactSpellSlots?.[2]).toEqual({ max: 1, used: 1 })
  })
})
