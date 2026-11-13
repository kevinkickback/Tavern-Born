import { findClassReference } from '@/lib/5etools/classReference'
import { getItemPropertyReferences, getItemPropertyUid } from '@/lib/5etools/itemProperties'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import type { Class5e, ItemPropertyReference } from '@/types/5etools'
import type { Character } from '@/types/character'

interface WeaponProficiencyTarget {
  name: string
  source?: string
  weaponCategory?: string
  type?: string
  properties?: ItemPropertyReference[]
  property?: ItemPropertyReference[]
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

const LIGHT = 'martial weapons that have the light property'
const LIGHT_OR_FINESSE = 'martial weapons that have the finesse or light property'

function hasQualifiedWeaponSource(
  proficiency: string,
  blocks: readonly Record<string, unknown>[] | undefined,
): boolean {
  return (
    Array.isArray(blocks) &&
    blocks.some((block: Record<string, unknown>) => {
      const filter = block?.all
      if (
        !filter ||
        typeof filter !== 'object' ||
        !('fromFilter' in filter) ||
        typeof filter.fromFilter !== 'string' ||
        Object.keys(filter).length !== 1 ||
        Object.keys(block).some((key) => key !== 'all' && key !== 'simple')
      )
        return false
      const clauses = filter.fromFilter
        .toLowerCase()
        .split('|')
        .map((clause) => clause.trim())
      const properties = clauses.find((clause) => clause.startsWith('property='))?.slice(9)
      return (
        clauses.length === 2 &&
        clauses.includes('type=martial weapon') &&
        (proficiency === LIGHT
          ? properties === 'light'
          : properties === 'light;finesse' || properties === 'finesse;light')
      )
    })
  )
}

/** Keep explicit independent proficiencies and verify attributed base-class grants against live rules. */
export function getCurrentWeaponProficiencies(
  character: Character,
  classes: readonly Class5e[] | undefined,
): readonly string[] {
  if (!classes) return character.proficiencies.weapons
  const primary = findClassReference(
    character.initialClass ?? character.classProgression[0] ?? {},
    character.classProgression,
  )
  return [
    ...new Set(
      character.proficiencies.weapons.flatMap((value) => {
        const name = normalizeKey(value)
        const tags = character.provenance.proficiencies.weapons[name]
        if (!tags?.length) return [value]
        return tags.flatMap((tag) => {
          if (tag.sourceType !== 'class' || tag.grantType !== 'fixed' || tag.grantVariant)
            return [value]
          const reference = { name: tag.sourceName, source: tag.sourceRef }
          const owner = findClassReference(reference, character.classProgression)
          const matches = classes.filter((cls) => findClassReference(reference, [cls]))
          if (!owner || matches.length !== 1 || matches[0].sourceIdentityConflict) return []
          const cls = matches[0]
          const proficiencies =
            owner === primary ? cls.startingProficiencies : cls.multiclassing?.proficienciesGained
          if (!Array.isArray(proficiencies?.weapons)) return []
          return proficiencies.weapons.filter((weapon) => {
            const current = normalizeKey(weapon)
            return name === LIGHT || name === LIGHT_OR_FINESSE
              ? (current === LIGHT || current === LIGHT_OR_FINESSE) &&
                  hasQualifiedWeaponSource(current, proficiencies.weaponProficiencies)
              : current === name
          })
        })
      }),
    ),
  ]
}

/** Checks source-derived weapon proficiencies by exact item name or weapon category. */
export function isProficientWithWeapon(
  proficiencies: readonly string[],
  weapon: WeaponProficiencyTarget,
): boolean {
  const name = normalized(weapon.name)
  const category = normalized(weapon.weaponCategory)
  const typeCode = normalized(weapon.type).split('|')[0]
  const range =
    typeCode === 'm' || typeCode === 'mw'
      ? 'melee'
      : typeCode === 'r' || typeCode === 'rw'
        ? 'ranged'
        : ''
  return proficiencies.some((rawProficiency) => {
    const proficiency = normalized(rawProficiency)
    if (proficiency === name) return true
    const tagged = /^\{@item\s+([^|}]+)(?:\|([^|}]*)(?:\|[^}]*)?)?\}$/i.exec(proficiency)
    if (
      tagged &&
      normalized(tagged[1]) === name &&
      (normalized(tagged[2]) || 'dmg') === normalized(weapon.source)
    )
      return true
    if (!category) return false

    if ([category, `${category} weapon`, `${category} weapons`].includes(proficiency)) return true
    if (category === 'martial') {
      // These are the complete rendered forms of the revised Rogue and Monk source grants.
      const qualified = stripItemTag(proficiency)
      if (qualified === LIGHT || qualified === LIGHT_OR_FINESSE)
        return getItemPropertyReferences(weapon.property ?? weapon.properties).some((reference) => {
          const code = getItemPropertyUid(reference).split('|')[0].trim().toUpperCase()
          return code === 'L' || (code === 'F' && qualified === LIGHT_OR_FINESSE)
        })
    }
    return range.length > 0 && proficiency === `${category} ${range} weapons`
  })
}
