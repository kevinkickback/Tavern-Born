import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { setProfileSpells } from '@/lib/character/commands/spellCommands'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'

/** Seed manual Bonus state through the same complete selection command as the picker. */
export function selectBonusSpellFixture(
  character: Character,
  reference: string,
  kind: 'cantrip' | 'spell',
  spellsByKey?: Readonly<Record<string, Spell5e>>,
) {
  const bonus = character.spells.spellProfiles.find((row) => row.id === SPECIAL_SPELL_PROFILE_ID)
  return setProfileSpells(
    character,
    character.provenance,
    SPECIAL_SPELL_PROFILE_ID,
    [...(bonus?.cantrips ?? []), ...(kind === 'cantrip' ? [reference] : [])],
    [...(bonus?.spellsKnown ?? []), ...(kind === 'spell' ? [reference] : [])],
    spellsByKey,
  )
}
