import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { CharacterClassEntry, Equipment, WeaponInscription } from '@/types/character'
import { canonicalFeatureOptionParent } from './featureOptionIdentity'

export function weaponInscriptionOwner(entry: CharacterClassEntry): WeaponInscription['owner'] {
  return [
    'subclass',
    norm(entry.name),
    norm(entry.source),
    norm(entry.subclass),
    norm(entry.subclassSource),
  ]
}

function weaponInscriptionLevel(target: string) {
  const prefix = 'subclass-feature|'
  const parent =
    target.startsWith(prefix) &&
    canonicalFeatureOptionParent(target.slice(prefix.length), 'subclassFeature')
  const level = parent && Number(parent.ref.split('|')[5])
  return parent &&
    parent.identity === target &&
    level &&
    Number.isInteger(level) &&
    level <= 20 &&
    level > 0
    ? level
    : undefined
}

export function isEarnedWeaponInscription(
  mark: Pick<WeaponInscription, 'owner' | 'target'>,
  progression: readonly CharacterClassEntry[],
) {
  const level = weaponInscriptionLevel(mark.target)
  return (
    level !== undefined &&
    progression.filter(
      (entry) =>
        entry.levels >= level &&
        JSON.stringify(weaponInscriptionOwner(entry)) === JSON.stringify(mark.owner),
    ).length === 1
  )
}

export function retainEarnedWeaponInscriptions(
  equipment: Equipment[],
  progression: readonly CharacterClassEntry[],
): Equipment[] {
  if (
    !equipment.some((item) =>
      item.weaponInscriptions?.some((mark) => !isEarnedWeaponInscription(mark, progression)),
    )
  )
    return equipment
  return equipment.map((item) =>
    item.weaponInscriptions?.length
      ? {
          ...item,
          weaponInscriptions: item.weaponInscriptions.filter((mark) =>
            isEarnedWeaponInscription(mark, progression),
          ),
        }
      : item,
  )
}
