import { resolveArmorType } from '@/lib/calculations/armorClass'
import { enforceArmorEquipmentRestrictions } from '@/lib/calculations/itemEquippable'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import { generateEquipmentId } from '@/lib/character/ids'
import { updateStartingEquipmentQuantity } from '@/lib/character/startingEquipmentGrants'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { reconcileExpertiseOwnership } from './expertiseCommands'

export type ManualProficiencyDomain =
  | 'skills'
  | 'languages'
  | 'tools'
  | 'armor'
  | 'weapons'
  | 'savingThrows'

/** Set the rule and reconcile already-equipped armor in one character patch. */
export function setEquipmentRestrictionsIgnoredCommand(
  character: Character,
  ignored: boolean,
  armorTraining = character.proficiencies.armor,
  catalog?: ReadonlyMap<string, Item5e>,
): Partial<Character> {
  return {
    variantRules: { ...character.variantRules, ignoreEquipRestrictions: ignored },
    ...(ignored
      ? {}
      : {
          equipment: enforceArmorEquipmentRestrictions(character.equipment, armorTraining, catalog)
            .equipment,
        }),
  }
}

function buildEquipment(item: Item5e, occupied: ReadonlySet<string>): Equipment {
  const armorType = resolveArmorType(item.type ?? '')
  return {
    id: generateEquipmentId(occupied),
    name: item.name,
    type: item.type ?? 'G',
    quantity: 1,
    equipped: false,
    attuned: false,
    description: '',
    weight: item.weight,
    value: item.value,
    rarity: item.rarity,
    reqAttune: Boolean(item.reqAttune),
    ac: item.ac,
    armorType: armorType === 'none' ? undefined : armorType,
    weaponCategory: item.weaponCategory,
    dmg1: item.dmg1,
    dmg2: item.dmg2,
    dmgType: item.dmgType,
    properties: item.property,
    range: item.range,
    source: item.source,
    wondrous: item.wondrous,
    tattoo: item.tattoo,
    focus: item.focus,
  }
}

function removeManualTags(
  ledger: ProvenanceLedger,
  domain: ManualProficiencyDomain,
  itemName: string,
): ProvenanceLedger {
  const key = normalizeKey(itemName)
  const map = ledger.proficiencies[domain]
  const retained = (map[key] ?? []).filter((tag) => tag.sourceType !== 'manual')
  const nextMap = { ...map }
  if (retained.length > 0) nextMap[key] = retained
  else delete nextMap[key]
  return {
    ...ledger,
    proficiencies: { ...ledger.proficiencies, [domain]: nextMap },
  }
}

export function addManualEquipmentBatchCommand(
  character: Character,
  ledger: ProvenanceLedger,
  items: readonly Item5e[],
): CharacterCommandResult {
  if (items.length === 0) return { characterPatch: {}, provenanceUpdate: ledger }

  const equipment = [...(character.equipment ?? [])]
  const occupied = new Set([
    ...equipment.map((item) => item.id),
    ...Object.values(character.startingEquipmentGrants ?? {}).flatMap(
      (grant) => grant?.items.map((lot) => lot.equipmentId) ?? [],
    ),
  ])
  let provenanceUpdate = ledger
  for (const item of items) {
    const entry = buildEquipment(item, occupied)
    occupied.add(entry.id)
    equipment.push(entry)
    provenanceUpdate = addGrant(
      provenanceUpdate,
      'equipment',
      entry.name,
      makeSourceTag('manual', 'User Choice', 'choice'),
    )
  }

  return { characterPatch: { equipment }, provenanceUpdate }
}

export function removeManualEquipmentCommand(
  character: Character,
  ledger: ProvenanceLedger,
  equipmentId: string,
): CharacterCommandResult {
  const removed = character.equipment.find((item) => item.id === equipmentId)
  if (!removed) return { characterPatch: {}, provenanceUpdate: ledger }

  const quantityPatch = updateStartingEquipmentQuantity(character, equipmentId, 0)
  const equipment = quantityPatch.equipment ?? character.equipment
  const normalizedName = normalizeKey(removed.name)
  if (equipment.some((item) => normalizeKey(item.name) === normalizedName)) {
    return { characterPatch: quantityPatch, provenanceUpdate: ledger }
  }

  const nextEquipmentLedger = { ...ledger.equipment }
  const retained = (nextEquipmentLedger[normalizedName] ?? []).filter(
    (tag) => tag.sourceType !== 'manual',
  )
  if (retained.length > 0) nextEquipmentLedger[normalizedName] = retained
  else delete nextEquipmentLedger[normalizedName]

  return {
    characterPatch: quantityPatch,
    provenanceUpdate: { ...ledger, equipment: nextEquipmentLedger },
  }
}

export function updateEquipmentQuantityCommand(
  character: Character,
  ledger: ProvenanceLedger,
  equipmentId: string,
  quantity: number,
): CharacterCommandResult {
  if (quantity === 0) return removeManualEquipmentCommand(character, ledger, equipmentId)
  const item = character.equipment.find((entry) => entry.id === equipmentId)
  if (!item) return { characterPatch: {}, provenanceUpdate: ledger }
  return {
    characterPatch: updateStartingEquipmentQuantity(character, equipmentId, quantity),
    provenanceUpdate:
      quantity > item.quantity
        ? addGrant(ledger, 'equipment', item.name, makeSourceTag('manual', 'User Choice', 'choice'))
        : ledger,
  }
}

export function applyManualProficiencyCommand(
  character: Character,
  ledger: ProvenanceLedger,
  domain: ManualProficiencyDomain,
  itemName: string,
  added: boolean,
): CharacterCommandResult {
  const normalizedName = normalizeKey(itemName)
  const provenanceUpdate = added
    ? addGrant(ledger, domain, itemName, makeSourceTag('manual', 'User Choice', 'choice'))
    : removeManualTags(ledger, domain, itemName)
  const hasRemainingGrant = Boolean(provenanceUpdate.proficiencies[domain][normalizedName]?.length)
  const current = character.proficiencies[domain]
  const next = added
    ? [...new Set([...current, domain === 'skills' ? normalizedName : itemName])]
    : hasRemainingGrant
      ? current
      : current.filter((entry) => normalizeKey(entry) !== normalizedName)
  const proficiencies = { ...character.proficiencies, [domain]: next }

  return reconcileExpertiseOwnership({
    characterPatch: {
      proficiencies:
        domain === 'skills' || domain === 'tools'
          ? reconcileSkillExpertise(proficiencies)
          : proficiencies,
    },
    provenanceUpdate,
  })
}
