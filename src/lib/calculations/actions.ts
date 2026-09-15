import { resolveItemReference } from '@/lib/5etools/itemResolvers'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import type { Item5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character, Equipment } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import type { AbilityName } from './abilityScores'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'

function isWeapon(item: Equipment): boolean {
  return !!item.dmg1 || !!item.weaponCategory || item.type === 'M' || item.type === 'R'
}

function parseMasteryReference(reference: string): { name: string; source?: string } | null {
  const [namePart, sourcePart] = reference.split('|')
  const name = namePart?.trim()
  if (!name) return null
  return { name, source: sourcePart?.trim() || undefined }
}

function isSelectedItemChoice(character: Character, item: Equipment): boolean {
  return (character.classChoiceSelections ?? []).some((selection) =>
    selection.selected.some(
      (option) =>
        option.entityType === 'item' &&
        option.name === item.name &&
        (!option.source || !item.source || option.source === item.source),
    ),
  )
}

export interface WeaponActionProjectionContext {
  abilityModifiers: Record<AbilityName, number>
  proficiencyBonus: number
  itemLookup?: ReadonlyMap<string, Item5e>
  propertyLookup?: Readonly<Record<string, string>>
  effects?: readonly CharacterEffect[]
  effectContext?: EffectResolutionContext
}

/** Derives weapon attacks from structured equipment and effect data without UI/PDF assumptions. */
export function deriveWeaponActions(
  character: Character,
  context: WeaponActionProjectionContext,
): CharacterAction[] {
  const effects = context.effects ?? []
  const effectContext = context.effectContext ?? {}
  return character.equipment
    .filter(isWeapon)
    .sort(
      (left, right) =>
        Number(right.equipped) - Number(left.equipped) || left.id.localeCompare(right.id),
    )
    .map((item) => {
      const properties = item.properties ?? []
      const propertyKeys = properties.map((property) => property.split('|')[0].toUpperCase())
      const ability: AbilityName = propertyKeys.includes('F')
        ? context.abilityModifiers.dexterity > context.abilityModifiers.strength
          ? 'dexterity'
          : 'strength'
        : item.type === 'R'
          ? 'dexterity'
          : 'strength'
      const proficient = isProficientWithWeapon(character.proficiencies.weapons, item)
      const baseAttackBonus =
        context.abilityModifiers[ability] + (proficient ? context.proficiencyBonus : 0)
      const attackBonus = Math.trunc(
        resolveNumericEffect(
          baseAttackBonus,
          { kind: 'attack-roll', attackId: item.id },
          effects,
          effectContext,
        ).value,
      )
      const damageBonus = Math.trunc(
        resolveNumericEffect(
          context.abilityModifiers[ability],
          { kind: 'damage', attackId: item.id, damageType: item.dmgType },
          effects,
          effectContext,
        ).value,
      )
      const itemData = resolveItemReference(item, context.itemLookup)
      const mastery = isSelectedItemChoice(character, item)
        ? (itemData?.mastery ?? []).flatMap((reference) => {
            const parsed = parseMasteryReference(reference)
            return parsed ? [parsed] : []
          })
        : []
      const propertyLabels = properties.map((property) => {
        const key = property.split('|')[0].toUpperCase()
        return context.propertyLookup?.[key] ?? property
      })
      if (item.dmg2) propertyLabels.push(`Versatile ${item.dmg2}`)

      return {
        id: `weapon:${item.id}`,
        name: item.name,
        kind: 'attack',
        description: item.description?.trim() ?? '',
        source: { kind: 'item', name: item.name, source: item.source, entityId: item.id },
        active: item.equipped,
        inactiveReason: item.equipped ? undefined : 'Not equipped',
        ability,
        proficient,
        attackBonus,
        range: item.range,
        damage: [{ dice: item.dmg1, bonus: damageBonus, damageType: item.dmgType }],
        properties: propertyLabels,
        mastery,
      } satisfies CharacterAction
    })
}
