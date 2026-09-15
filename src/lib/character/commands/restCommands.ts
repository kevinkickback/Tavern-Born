import type { Character } from '@/types/character'
import type { ClassResourceRecovery } from '@/types/classRules'
import { reconcileSpellSlotMaximaCommand, type SpellSlotMaxima } from './spellSlotCommands'

export type RestType = 'short' | 'long'

interface RestResourceState {
  id: string
  label: string
  current: number
  max: number
  recovery: ClassResourceRecovery
}

export interface RestContext {
  spellSlots: SpellSlotMaxima
  resources: readonly RestResourceState[]
  maximumHitPoints: number
  hitDiceRecovered: number
  restoreHitPoints: boolean
}

interface RestChange {
  id: string
  label: string
  before: number
  after: number
}

export interface RestResult {
  patch: Pick<Character, 'spells' | 'classResources' | 'hitDiceUsed' | 'hitPoints'>
  changes: RestChange[]
}

function recoveredValue(current: number, max: number, amount: number | 'all' | undefined): number {
  if (amount === undefined) return current
  if (amount === 'all') return max
  return Math.min(max, current + Math.max(0, Math.trunc(amount)))
}

function recordChange(
  changes: RestChange[],
  id: string,
  label: string,
  before: number,
  after: number,
): void {
  if (before !== after) changes.push({ id, label, before, after })
}

/** Builds one atomic rest patch and a matching user-facing preview without mutating the character. */
export function applyRest(
  character: Character,
  restType: RestType,
  context: RestContext,
): RestResult {
  const changes: RestChange[] = []
  const reconciled = reconcileSpellSlotMaximaCommand(character, context.spellSlots).spells
  const shared = { ...reconciled.spellSlots }
  const pact = { ...(reconciled.pactSpellSlots ?? {}) }

  for (let level = 1; level <= 9; level++) {
    const sharedSlot = shared[level] ?? { max: 0, used: 0 }
    const nextSharedUsed = restType === 'long' ? 0 : sharedSlot.used
    recordChange(
      changes,
      `spell-slot:shared:${level}`,
      `Level ${level} spell slots used`,
      sharedSlot.used,
      nextSharedUsed,
    )
    shared[level] = { ...sharedSlot, used: nextSharedUsed }

    const pactSlot = pact[level] ?? { max: 0, used: 0 }
    recordChange(
      changes,
      `spell-slot:pact:${level}`,
      `Level ${level} Pact Magic slots used`,
      pactSlot.used,
      0,
    )
    pact[level] = { ...pactSlot, used: 0 }
  }

  const classResources = { ...(character.classResources ?? {}) }
  for (const resource of context.resources) {
    const amount = restType === 'short' ? resource.recovery.shortRest : resource.recovery.longRest
    const next = recoveredValue(resource.current, resource.max, amount)
    recordChange(changes, `resource:${resource.id}`, resource.label, resource.current, next)
    classResources[resource.id] = next
  }

  const beforeHitDice = Math.max(0, character.hitDiceUsed ?? 0)
  const nextHitDice =
    restType === 'long'
      ? Math.max(0, beforeHitDice - Math.max(0, Math.trunc(context.hitDiceRecovered)))
      : beforeHitDice
  recordChange(changes, 'hit-dice', 'Hit dice used', beforeHitDice, nextHitDice)

  const hitPoints = { ...character.hitPoints }
  if (restType === 'long' && context.restoreHitPoints) {
    const nextCurrent = Math.max(0, Math.trunc(context.maximumHitPoints))
    recordChange(changes, 'hit-points', 'Current hit points', hitPoints.current, nextCurrent)
    recordChange(changes, 'temporary-hit-points', 'Temporary hit points', hitPoints.temporary, 0)
    hitPoints.current = nextCurrent
    hitPoints.temporary = 0
  }

  return {
    patch: {
      spells: { ...reconciled, spellSlots: shared, pactSpellSlots: pact },
      classResources,
      hitDiceUsed: nextHitDice,
      hitPoints,
    },
    changes,
  }
}
