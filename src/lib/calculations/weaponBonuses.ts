import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import {
  getItemTypeCodes,
  getNormalizedItemTraits,
  isSelectableEquipmentItem,
} from './itemClassification'

// Audited against the pinned producers documented in state-management.md. Tags alone
// cannot represent bearer choice, deployment, charges or an effect belonging to a spell.
const unsupported: Readonly<Record<string, string>> = {
  'Blood Spear|CoS': "The +2 bonus requires Kavan's chosen bearer.",
  'Bloodrage Greataxe|BMT': 'The +2 bonus requires half hit points or fewer.',
  'Duskcrusher|EGW': 'The +2 bonus requires the radiant head to be active.',
  'Hammer of Runic Focus|BMT': 'The +3 bonus requires the charged rune area.',
  'Hazirawn|HotDQ': 'Its +1 unattuned and +2 attuned bonuses need manual handling.',
  "Niko's Mace|UtHftLH": 'The +9 spell attack is not a bonus to attacks with this mace.',
  'Needle of Mending|EGW': 'The +1 bonus requires dagger form.',
  'True-Ice Shards (Rapier)|CoA': 'Its +3 bonus can be transferred to Armor Class.',
  'Dawnbringer|OotA': 'The +2 bonus requires the radiant blade to be active.',
  'Sun Blade|DMG': 'The +2 bonus requires the radiant blade to be active.',
  'Sun Blade|XDMG': 'The +2 bonus requires the radiant blade to be active.',
  'Sunsword|CoS': 'The +2 bonus requires the radiant blade to be active.',
  "Baba Yaga's Pestle|TCE": 'The +3 bonus requires quarterstaff form.',
}

const baselineNotes: Readonly<Record<string, string>> = {
  'Mace of Smiting|DMG': 'The increase against constructs needs manual handling.',
  'Mace of Smiting|XDMG': 'The increase against constructs needs manual handling.',
  'Dragontooth Dagger|RoT': 'The increase against Cult enemies needs manual handling.',
  'Moonblade|DMG': 'Additional rune bonuses need manual handling.',
}

function readInteger(value: unknown): number | undefined {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^[+-]?\d+$/.test(value.trim()))
  ) {
    return undefined
  }
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

/** Fixed intrinsic bonuses for an existing physical attack, never global item grants. */
export function getWeaponBonuses(
  item: Equipment,
  data: Item5e,
): { attack?: number; damage?: number; note?: string } {
  const traits = getNormalizedItemTraits(data)
  const physical = (value: Equipment | Item5e) =>
    !!value.dmg1 ||
    !!value.weaponCategory ||
    getItemTypeCodes(value.type).some((code) => code === 'M' || code === 'R')
  if (
    !physical(item) ||
    !physical(data) ||
    getItemTypeCodes(data.type).some((code) => code === 'A' || code === 'AF') ||
    traits.isAmmunition ||
    traits.isArmor ||
    traits.isConsumable ||
    data.magicVariantReference ||
    !isSelectableEquipmentItem(data)
  )
    return {}

  const fields = [data.bonusWeapon, data.bonusWeaponAttack, data.bonusWeaponDamage]
  if (fields.every((value) => value === undefined)) return {}
  const key = `${data.name}|${data.source}`
  if (unsupported[key]) return { note: unsupported[key] }
  if (fields.some((value) => value !== undefined && readInteger(value) === undefined)) {
    return {
      note: 'This weapon bonus cannot be calculated automatically. Check its rules and adjust it manually.',
    }
  }
  if (
    data.bonusWeapon !== undefined &&
    (data.bonusWeaponAttack !== undefined || data.bonusWeaponDamage !== undefined)
  ) {
    return {
      note: 'Overlapping weapon bonuses need manual review. Check its rules before adding a bonus.',
    }
  }
  return {
    attack: readInteger(data.bonusWeapon ?? data.bonusWeaponAttack),
    damage: readInteger(data.bonusWeapon ?? data.bonusWeaponDamage),
    note: baselineNotes[key],
  }
}
