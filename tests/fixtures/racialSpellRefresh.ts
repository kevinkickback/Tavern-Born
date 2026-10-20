import {
  setRacialCastingAbility,
  setRacialSpellChoice,
} from '@/lib/character/commands/spellCommands'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from './bonusSpellSelection'
import {
  makeNativeRacialCharacter,
  nativeChoiceSpellLookup,
  nativeRaceResolution,
} from './nativeRacialCharacter'

export const racialRefreshRace: Race5e = {
  name: 'Refresh caster',
  source: 'PHB',
  additionalSpells: [
    {
      ability: { choose: ['int', 'wis', 'cha'] },
      known: { 1: [{ choose: 'level=0|class=Wizard', count: 2 }] },
    },
  ],
}

/** A strict current native setup with independent manual ownership and spent slot pools. */
export function makeRacialRefreshCharacter(owner = racialRefreshRace, parent?: Race5e): Character {
  const resolution = nativeRaceResolution(parent ?? owner, parent ? owner : undefined)
  let c = makeNativeRacialCharacter(parent ?? owner, parent ? owner : undefined, 5)
  const apply = (r: ReturnType<typeof setRacialSpellChoice>) => {
    c = { ...c, ...r.characterPatch, provenance: r.provenanceUpdate }
  }
  const p = c.spells.spellProfiles.find((p) => p.type === 'racial' && p.choices?.length)!
  apply(
    setRacialSpellChoice(
      c,
      c.provenance,
      p.id,
      p.choices![0].id,
      ['Light|PHB', 'Mage Hand|PHB'],
      resolution,
      nativeChoiceSpellLookup,
    ),
  )
  apply(setRacialCastingAbility(c, c.provenance, p.id, 'wis', resolution))
  apply(selectBonusSpellFixture(c, 'Light|PHB', 'cantrip'))
  c.spells.spellSlots = { 1: { max: 4, used: 2 } }
  c.spells.pactSpellSlots = { 2: { max: 2, used: 1 } }
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(c)))
}
