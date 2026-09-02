import { resolveArmorType } from '@/lib/calculations/armorClass'
import { mergeSkillState } from '@/lib/calculations/skills'
import { generateEquipmentId } from '@/lib/character/ids'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export type ManualProficiencyDomain =
  | 'skills'
  | 'languages'
  | 'tools'
  | 'armor'
  | 'weapons'
  | 'savingThrows'

function buildEquipment(item: Item5e): Equipment {
  const armorType = resolveArmorType(item.type ?? '')
  return {
    id: generateEquipmentId(),
    name: item.name,
    type: item.type ?? 'G',
    quantity: 1,
    equipped: false,
    attuned: false,
    description: '',
    weight: item.weight,
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

export function addManualEquipmentEntryCommand(
  character: Character,
  ledger: ProvenanceLedger,
  equipment: Equipment,
): CharacterCommandResult {
  return {
    characterPatch: { equipment: [...(character.equipment ?? []), equipment] },
    provenanceUpdate: addGrant(
      ledger,
      'equipment',
      equipment.name,
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
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

export function addManualEquipmentCommand(
  character: Character,
  ledger: ProvenanceLedger,
  item: Item5e,
): CharacterCommandResult {
  return addManualEquipmentEntryCommand(character, ledger, buildEquipment(item))
}

export function removeManualEquipmentCommand(
  character: Character,
  ledger: ProvenanceLedger,
  equipmentId: string,
): CharacterCommandResult {
  const removed = character.equipment.find((item) => item.id === equipmentId)
  if (!removed) return { characterPatch: {}, provenanceUpdate: ledger }

  const equipment = character.equipment.filter((item) => item.id !== equipmentId)
  const normalizedName = normalizeKey(removed.name)
  if (equipment.some((item) => normalizeKey(item.name) === normalizedName)) {
    return { characterPatch: { equipment }, provenanceUpdate: ledger }
  }

  const nextEquipmentLedger = { ...ledger.equipment }
  const retained = (nextEquipmentLedger[normalizedName] ?? []).filter(
    (tag) => tag.sourceType !== 'manual',
  )
  if (retained.length > 0) nextEquipmentLedger[normalizedName] = retained
  else delete nextEquipmentLedger[normalizedName]

  return {
    characterPatch: { equipment },
    provenanceUpdate: { ...ledger, equipment: nextEquipmentLedger },
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

  return {
    characterPatch: {
      proficiencies,
      ...(domain === 'skills'
        ? { skills: mergeSkillState(character.skills ?? {}, proficiencies.skills) }
        : {}),
    },
    provenanceUpdate,
  }
}
