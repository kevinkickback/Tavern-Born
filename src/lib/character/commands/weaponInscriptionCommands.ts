import { getWeaponInscriptionSetup } from '@/lib/5etools/weaponInscribedSpells'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character, CharacterClassEntry, WeaponInscription } from '@/types/character'

interface InscriptionChoice {
  target: string
  weaponId: string
  rune: string
}

export function setWeaponInscription(
  character: Character,
  entry: CharacterClassEntry,
  choice: InscriptionChoice | undefined,
  expected: InscriptionChoice | undefined,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const setup = getWeaponInscriptionSetup(character, entry, catalogs)
  const saved = setup?.saved
  if (
    !setup ||
    saved?.weapon.id !== expected?.weaponId ||
    saved?.mark.target !== expected?.target ||
    saved?.mark.rune !== expected?.rune
  )
    throw new RangeError('The weapon inscription changed. Open it again to edit it.')
  const rune = choice && setup.current?.runes.find((name) => norm(name) === norm(choice.rune))
  if (
    choice &&
    (!rune ||
      setup.current?.target !== choice.target ||
      !setup.weapons.some(({ id }) => id === choice.weaponId))
  )
    throw new RangeError('Choose a current rune and a melee weapon you own.')
  const target = choice?.target ?? saved?.mark.target
  if (!target) return character.equipment
  const mark: WeaponInscription | undefined =
    rune && choice ? { owner: setup.owner, target, rune: norm(rune) } : undefined
  return character.equipment.map((weapon) => {
    const old = weapon.weaponInscriptions
    const next = old?.filter((row) => JSON.stringify(row.owner) !== JSON.stringify(setup.owner))
    if (mark && weapon.id === choice?.weaponId)
      return { ...weapon, weaponInscriptions: [...(next ?? []), mark] }
    return next?.length !== old?.length ? { ...weapon, weaponInscriptions: next } : weapon
  })
}
