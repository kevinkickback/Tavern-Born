import { type FeatOptionStep, parseFeatSpellFilter } from '@/lib/5etools/parsers/featOptions'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import type { Spell5e } from '@/types/5etools'

export function createFeatSpellMatcher(filter: string): (spell: Spell5e) => boolean {
  const parsed = parseFeatSpellFilter(filter)
  return (spell) =>
    (!parsed.level || parsed.level.includes(spell.level)) &&
    (!parsed.school || parsed.school.includes(spell.school)) &&
    (!parsed.className || isSpellOnClassList(spell, parsed.className))
}

/** Saved aggregate references carry no step identity. Match exact rules to bounded slots. */
export function assignSavedFeatSpells(
  steps: readonly FeatOptionStep[],
  references: readonly string[],
  spellLookup: Readonly<Record<string, Spell5e>>,
): { selections: Record<number, string[]>; unassigned: string[] } {
  const unique = new Map<string, string>()
  for (const reference of references) {
    const key = getSpellReferenceKey(reference)
    if (!unique.has(key)) unique.set(key, reference)
  }
  const saved = [...unique.values()]
  const spellSteps = steps.flatMap((step, index) =>
    step.kind === 'spells' ? [{ step, index }] : [],
  )
  const slots = spellSteps.flatMap(({ step, index }) =>
    Array.from({ length: Math.min(Math.max(0, step.count), saved.length) }, () => index),
  )
  const matchers = new Map(
    spellSteps.map(({ step, index }) => [index, createFeatSpellMatcher(step.chooseFilter)]),
  )
  const candidates = saved.map((reference) => {
    const spell = parseSpellReference(reference).source
      ? resolveSpellReference(reference, spellLookup)
      : undefined
    return spell
      ? slots.flatMap((stepIndex, slot) => {
          return matchers.get(stepIndex)?.(spell) ? [slot] : []
        })
      : []
  })
  const occupants = new Map<number, number>()
  const place = (referenceIndex: number, visited: Set<number>): boolean => {
    // Prefer free slots so unchanged, already valid ordering remains stable.
    for (const slot of candidates[referenceIndex]) {
      if (!occupants.has(slot)) {
        occupants.set(slot, referenceIndex)
        return true
      }
    }
    for (const slot of candidates[referenceIndex]) {
      if (visited.has(slot)) continue
      visited.add(slot)
      const previous = occupants.get(slot)
      if (previous !== undefined && place(previous, visited)) {
        occupants.set(slot, referenceIndex)
        return true
      }
    }
    return false
  }
  for (let i = 0; i < saved.length; i++) place(i, new Set())

  // A single spell step is unambiguous even when its saved metadata is unavailable/refreshed.
  // Multiple steps cannot infer that association: expose leftovers for explicit recovery.
  if (spellSteps.length === 1) {
    const assigned = new Set(occupants.values())
    for (let i = 0; i < saved.length; i++) {
      if (assigned.has(i)) continue
      const empty = slots.findIndex((_, slot) => !occupants.has(slot))
      if (empty < 0) break
      occupants.set(empty, i)
    }
  }
  const byReference = new Map([...occupants].map(([slot, ref]) => [ref, slots[slot]]))
  const selections: Record<number, string[]> = {}
  const unassigned: string[] = []
  saved.forEach((reference, index) => {
    const step = byReference.get(index)
    if (step === undefined) unassigned.push(reference)
    else {
      selections[step] ??= []
      selections[step].push(reference)
    }
  })
  return { selections, unassigned }
}
