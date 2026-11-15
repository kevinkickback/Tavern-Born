type Row = Record<string, unknown>

// Exact printings audited for concrete inventory. Eligibility and names come from their data.
const classicMarker: Readonly<Record<string, readonly string[]>> = {
  BMT: [
    'Antimagic Armor',
    'Armor of Fungal Spores',
    'Armor of the Fallen',
    'Armor of Weightlessness',
    'Clockwork Armor',
    'Feywrought Armor',
    'Gloomwrought Armor',
  ],
  BGG: ['Armor of Safeguarding', 'Zephyr Armor'],
  DitLCoT: ['Demon Skin'],
  MM: ['Drow +1 Armor', 'Drow +2 Armor', 'Drow +3 Armor'],
  EGW: ['Last Stand Armor'],
  ERLW: ['Living Armor'],
  DMG: ["Mariner's Armor"],
  VGM: ['Mind Carapace Armor'],
  GGR: ['Mizzium Armor'],
  CRCotN: ['Ruidium Armor'],
}
const revisedMarker: Readonly<Record<string, readonly string[]>> = {
  XDMG: [
    ...['Bludgeoning', 'Piercing', 'Slashing'].map((type) => `Armor of Vulnerability (${type})`),
    'Demon Armor',
    'Dwarven Plate',
    'Efreeti Chain',
    'Elven Chain',
    "Mariner's Armor",
    'Plate Armor of Etherealness (*)',
    'Enspelled Armor (Cantrip)',
    ...Array.from({ length: 8 }, (_, level) => `Enspelled Armor (Level ${level + 1})`),
  ],
  AU: [
    'Regal Breastplate of the Tyrant (*)',
    'Subjugating Breastplate of the Tyrant (*)',
    'Tramontane Armor',
  ],
  AUD: ['Spell-Fueling Armor'],
}

const fields = new Set([
  'reqAttune',
  'reqAttuneTags',
  'attachedSpells',
  'charges',
  'recharge',
  'rechargeAmount',
  'spellScrollLevel',
  'curse',
  'resist',
  'immune',
  'vulnerable',
  'grantsLanguage',
  'grantsProficiency',
  'bonusWeapon',
  'hasRefs',
  'propertyAdd',
  'modifySpeed',
])
const object = (value: unknown): Row | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : undefined
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && !!entry.trim())
const affix = (value: unknown) =>
  value === undefined || (typeof value === 'string' && !!value.trim() && !value.includes('|'))
const fixedBonus = (value: unknown) =>
  value === undefined || (typeof value === 'string' && /^\+[123]$/.test(value))

function swimRule(name: string, source: string, inherited: Row): boolean {
  const entries = inherited.entries as unknown[] | undefined
  const intro = entries?.[0]
  if (source === 'XDMG') {
    return (
      inherited.modifySpeed === undefined &&
      typeof intro === 'string' &&
      intro.startsWith(
        'While wearing this armor, you have a {@variantrule Swim Speed|XPHB} equal to your {@variantrule Speed|XPHB}.',
      )
    )
  }
  const speed = object(inherited.modifySpeed)
  const equal = object(speed?.equal)
  if (
    !speed ||
    Object.keys(speed).length !== 1 ||
    !equal ||
    Object.keys(equal).length !== 1 ||
    equal.swim !== 'walk' ||
    typeof intro !== 'string'
  )
    return false
  if (name === "Mariner's Armor") {
    return intro.startsWith(
      'While wearing this armor, you have a swimming speed equal to your walking speed.',
    )
  }
  const list = object(entries?.[1])
  return (
    intro.endsWith('While you wear this armor, you gain the following benefits:') &&
    list?.type === 'list' &&
    Array.isArray(list.items) &&
    list.items.includes('You gain a swimming speed equal to your walking speed.')
  )
}

export function qualifyArmorTemplate(definition: Row) {
  const name = String(definition.name)
  const source = String(definition.source)
  const type =
    Array.isArray(classicMarker[source]) && classicMarker[source].includes(name)
      ? 'GV|DMG'
      : Array.isArray(revisedMarker[source]) && revisedMarker[source].includes(name)
        ? 'GV|XDMG'
        : undefined
  if (!type) return undefined
  const inherited = object(definition.inherits) ?? {}
  const swim = name === "Mariner's Armor" || name === 'Ruidium Armor'
  const manualAc = source === 'MM'
  const properties = inherited.propertyAdd
  const valid =
    definition.type === type &&
    (source === 'DMG' ? definition.edition === 'classic' : definition.edition === undefined) &&
    affix(inherited.namePrefix) &&
    affix(inherited.nameSuffix) &&
    !!(inherited.namePrefix || inherited.nameSuffix) &&
    fixedBonus(inherited.bonusAc) &&
    fixedBonus(inherited.bonusWeapon) &&
    inherited.strength === undefined &&
    (inherited.stealth === undefined || inherited.stealth === false) &&
    (inherited.reqAttune === undefined ||
      inherited.reqAttune === true ||
      (typeof inherited.reqAttune === 'string' && !!inherited.reqAttune.trim())) &&
    (inherited.grantsProficiency === undefined || inherited.grantsProficiency === true) &&
    ['resist', 'immune'].every(
      (field) => inherited[field] === undefined || strings(inherited[field]),
    ) &&
    (properties === undefined || strings(properties)) &&
    (swim ? swimRule(name, source, inherited) : inherited.modifySpeed === undefined)
  return { valid, fields, swim, manualAc, properties: strings(properties) ? properties : undefined }
}
