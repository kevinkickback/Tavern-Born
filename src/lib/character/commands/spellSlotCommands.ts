import type { Character, SpellSlots } from '@/types/character'

export type SpellSlotPool = 'shared' | 'pact'

export interface SpellSlotMaxima {
  shared: Readonly<Partial<Record<number, { max: number }>>>
  pact: Readonly<Partial<Record<number, { max: number }>>>
}

function assertSlotInput(level: number, value: number, label: string): void {
  if (!Number.isInteger(level) || level < 1 || level > 9) {
    throw new RangeError('Spell slot level must be a whole number from 1 to 9.')
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative whole number.`)
  }
}

function slotsForPool(character: Pick<Character, 'spells'>, pool: SpellSlotPool): SpellSlots {
  return pool === 'shared' ? character.spells.spellSlots : (character.spells.pactSpellSlots ?? {})
}

function replacePool(
  character: Pick<Character, 'spells'>,
  pool: SpellSlotPool,
  slots: SpellSlots,
): Pick<Character, 'spells'> {
  return {
    spells: {
      ...character.spells,
      ...(pool === 'shared' ? { spellSlots: slots } : { pactSpellSlots: slots }),
    },
  }
}

export function correctSpellSlotUsageCommand(
  character: Pick<Character, 'spells'>,
  pool: SpellSlotPool,
  level: number,
  used: number,
  max: number,
): Pick<Character, 'spells'> {
  assertSlotInput(level, used, 'Used spell slots')
  assertSlotInput(level, max, 'Spell slot maximum')
  return replacePool(character, pool, {
    ...slotsForPool(character, pool),
    [level]: { max, used: Math.min(used, max) },
  })
}

export function spendSpellSlotCommand(
  character: Pick<Character, 'spells'>,
  pool: SpellSlotPool,
  level: number,
  max: number,
  amount = 1,
): Pick<Character, 'spells'> {
  assertSlotInput(level, amount, 'Spell slots spent')
  const current = slotsForPool(character, pool)[level]?.used ?? 0
  if (current + amount > max) throw new RangeError('Not enough spell slots are available.')
  return correctSpellSlotUsageCommand(character, pool, level, current + amount, max)
}

export function restoreSpellSlotCommand(
  character: Pick<Character, 'spells'>,
  pool: SpellSlotPool,
  level: number,
  max: number,
  amount: number | 'all' = 'all',
): Pick<Character, 'spells'> {
  if (amount !== 'all') assertSlotInput(level, amount, 'Spell slots restored')
  const current = slotsForPool(character, pool)[level]?.used ?? 0
  const nextUsed = amount === 'all' ? 0 : Math.max(0, current - amount)
  return correctSpellSlotUsageCommand(character, pool, level, nextUsed, max)
}

export function reconcileSpellSlotMaximaCommand(
  character: Pick<Character, 'spells'>,
  maxima: SpellSlotMaxima,
): Pick<Character, 'spells'> {
  const reconcilePool = (
    current: SpellSlots,
    next: Readonly<Partial<Record<number, { max: number }>>>,
  ): SpellSlots =>
    Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => index + 1).map((level) => {
        const max = Math.max(0, Math.trunc(next[level]?.max ?? 0))
        return [level, { max, used: Math.min(current[level]?.used ?? 0, max) }]
      }),
    )

  return {
    spells: {
      ...character.spells,
      spellSlots: reconcilePool(character.spells.spellSlots, maxima.shared),
      pactSpellSlots: reconcilePool(character.spells.pactSpellSlots ?? {}, maxima.pact),
    },
  }
}
