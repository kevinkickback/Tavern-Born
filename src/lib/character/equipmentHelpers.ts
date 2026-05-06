import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { generateEquipmentId } from '@/lib/character/ids'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'

export function extractFixedGrantNames(blocks: unknown[] | undefined): string[] {
  return extractProficiencyBlockNames(Array.isArray(blocks) ? blocks : [], {
    includeAnyStandard: false,
  })
    .filter((name) => !name.toLowerCase().startsWith('choose '))
    .map((name) => stripItemTag(name))
}

export function removeSourceGrantedEquipment(
  equipment: Character['equipment'],
  sourceNames: string[],
): Character['equipment'] {
  if (sourceNames.length === 0) return equipment
  return equipment.filter((item) => !sourceNames.includes(normalizeKey(item.name)))
}

export function upsertGrantedEquipment(
  equipment: Character['equipment'],
  granted: Array<Omit<Character['equipment'][number], 'id' | 'equipped' | 'attuned'>>,
): Character['equipment'] {
  const next = [...equipment]

  for (const item of granted) {
    const existingIndex = next.findIndex(
      (eq) =>
        normalizeKey(eq.name) === normalizeKey(item.name) &&
        normalizeKey(eq.source ?? '') === normalizeKey(item.source ?? ''),
    )

    if (existingIndex === -1) {
      next.push({
        id: generateEquipmentId(),
        equipped: false,
        attuned: false,
        ...item,
      })
      continue
    }

    const existing = next[existingIndex]
    next[existingIndex] = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      type: existing.type || item.type,
      ac: existing.ac ?? item.ac,
      armorType: existing.armorType ?? item.armorType,
      weight: existing.weight ?? item.weight,
      value: existing.value ?? item.value,
      rarity: existing.rarity ?? item.rarity,
      reqAttune: existing.reqAttune ?? item.reqAttune,
      weaponCategory: existing.weaponCategory ?? item.weaponCategory,
      dmg1: existing.dmg1 ?? item.dmg1,
      dmg2: existing.dmg2 ?? item.dmg2,
      dmgType: existing.dmgType ?? item.dmgType,
      properties: existing.properties ?? item.properties,
      range: existing.range ?? item.range,
    }
  }

  return next
}
