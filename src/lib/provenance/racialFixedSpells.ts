import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { deriveRaceSpellSelection } from '@/lib/calculations/raceSpellSelection'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import type { Character } from '@/types/character'
import { applyRaceSpellGrants } from './applyRaceGrants'
import { isSelectedRaceOwner } from './raceOwnership'
import { makeSourceTag } from './sourceLabels'
import type { ProvenanceLedger } from './types'

/** Rebuild fixed spell ownership only when the complete exact selection is available. */
export function reconcileResolvedRacialFixedSpells(
  character: Character,
  ledger: ProvenanceLedger,
  resolution?: Pick<ResolvedRaceReference, 'parentRace' | 'subraceData' | 'subraceIsNested'>,
): ProvenanceLedger {
  const parent = resolution?.parentRace
  const child = resolution?.subraceData
  if (!parent || (character.subrace && !child)) return ledger
  const parentTag = makeSourceTag('race', parent.name, 'fixed', parent.source)
  const childTag = child ? makeSourceTag('subrace', child.name, 'fixed', child.source) : undefined
  if (
    !isSelectedRaceOwner(parentTag, character) ||
    (character.subrace && (!childTag || !isSelectedRaceOwner(childTag, character)))
  )
    return ledger

  const selection = deriveRaceSpellSelection(parent, character.subrace ? child : undefined, {
    subraceIsNested: resolution?.subraceIsNested,
  })
  const totalLevel = getTotalCharacterLevel(character)
  let next: ProvenanceLedger = {
    ...ledger,
    spells: Object.fromEntries(
      Object.entries(ledger.spells).flatMap(([name, tags]) => {
        const retained = tags.filter(
          (tag) => tag.grantType !== 'fixed' || !isSelectedRaceOwner(tag, character),
        )
        return retained.length ? [[name, retained]] : []
      }),
    ),
  }
  next = applyRaceSpellGrants(
    { additionalSpells: selection.parentAdditionalSpells },
    totalLevel,
    next,
    parentTag,
  )
  if (character.subrace && childTag)
    next = applyRaceSpellGrants(
      { additionalSpells: selection.subraceAdditionalSpells },
      totalLevel,
      next,
      childTag,
    )
  return next
}
